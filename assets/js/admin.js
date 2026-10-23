/* 管理后台 · 通过 GitHub API 编辑 content.json（无需服务器）
   - 连接：owner / repo / branch + PAT（仅存本浏览器 localStorage）
   - 口令：可选，SHA-256 存于 assets/data/admin.config.json（公开文件，仅作 UI 门禁；真正写入靠 PAT）
   - 保存：用 Contents API 提交 content.json；导出/导入 JSON 作为兜底
*/
(function () {
  "use strict";

  var API = "https://api.github.com";
  var CONTENT_PATH = "assets/data/content.json";
  var CONFIG_PATH = "assets/data/admin.config.json";

  var LS_TOKEN = "lsfc_adm_token";
  var LS_REPO = "lsfc_adm_repo";

  var S = {
    owner: "", repo: "", branch: "main", token: "",
    content: null, contentSha: null,
    cfg: null, cfgSha: null,
    passcodeOk: false, passcodePending: null /* 首次设置时暂存明文 */
  };

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "type" || k === "placeholder" || k === "value") n.setAttribute(k, attrs[k]);
      else n[k] = attrs[k];
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var ks = path.split("."), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\s/g, ""))));
  }
  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }

  /* 读取图片文件并压缩为 data URL（限制最大宽度，控制体积，便于写入 content.json） */
  function resizeImage(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error("请选择图片文件")); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          /* PNG 透明背景转 JPEG 会变黑，故统一导出 JPEG */
          resolve(canvas.toDataURL("image/jpeg", quality || 0.82));
        };
        img.onerror = function () { reject(new Error("图片解码失败")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("文件读取失败")); };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- GitHub API ---------- */
  function headers(extra) {
    var h = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (S.token) h["Authorization"] = "Bearer " + S.token;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function apiGet(path) {
    return fetch(API + path, { headers: headers(), cache: "no-store" }).then(function (r) {
      if (r.status === 404) return { _404: true };
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || ("HTTP " + r.status)); });
      return r.json();
    });
  }
  function apiPut(path, body) {
    return fetch(API + path, {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || ("HTTP " + r.status)); });
      return r.json();
    });
  }
  function contentGet(path) {
    return apiGet("/repos/" + S.owner + "/" + S.repo + "/contents/" + path + "?ref=" + S.branch);
  }
  function contentPut(path, message, content, sha) {
    var body = { message: message, content: utf8ToB64(content), branch: S.branch };
    if (sha) body.sha = sha;
    return apiPut("/repos/" + S.owner + "/" + S.repo + "/contents/" + path, body);
  }

  function siteUrl() {
    /* 用户/组织页：仓库名即 <owner>.github.io，站点在根路径 */
    if (S.repo.indexOf(".github.io") > -1) return "https://" + S.repo + "/";
    /* 项目页：owner.github.io/<repo>/ */
    return "https://" + S.owner + ".github.io/" + S.repo + "/";
  }

  /* ---------- 连接流程 ---------- */
  function detectFromUrl() {
    if (!location.hostname.endsWith("github.io")) return null;
    var owner = location.hostname.split(".")[0];
    var seg = location.pathname.split("/").filter(Boolean);
    /* 项目页 owner.github.io/<repo>/  → repo = 第一段
       用户/组织页 owner.github.io/    → repo = <owner>.github.io（特殊仓库名） */
    var repo = seg.length ? seg[0] : (owner + ".github.io");
    return { owner: owner, repo: repo, branch: "main" };
  }

  function saveRepoLS() {
    try { localStorage.setItem(LS_REPO, JSON.stringify({ owner: S.owner, repo: S.repo, branch: S.branch })); } catch (e) {}
    try { if (S.token) localStorage.setItem(LS_TOKEN, S.token); } catch (e) {}
  }

  function connect() {
    S.owner = $("f-owner").value.trim();
    S.repo = $("f-repo").value.trim();
    S.branch = ($("f-branch").value.trim() || "main");
    S.token = $("f-token").value.trim();
    if (!S.owner || !S.repo || !S.token) { toast("请填写 所有者 / 仓库 / 令牌", true); return; }
    saveRepoLS();
    toast("正在连接 " + S.owner + "/" + S.repo + " …");

    contentGet(CONFIG_PATH).then(function (cfg) {
      if (cfg._404) { enterPasscodeSetup(); return; }
      S.cfg = cfg; S.cfgSha = cfg.sha;
      var data = JSON.parse(b64ToUtf8(cfg.content));
      if (data.passcodeHash) {
        S.passcodePending = null;
        showPasscode(data.setup ? "解锁编辑器" : "设置站点口令",
          data.setup ? "口令只是界面门禁（防止误入），真正的写权限由 GitHub 令牌决定。" : "首次使用，请设置一个站点口令（之后每次进入都需输入）。");
      } else {
        S.passcodeOk = true;
        loadContent();
      }
    }).catch(function (err) {
      toast("连接失败：" + err.message + "（检查仓库名 / 分支 / 令牌权限）", true);
    });
  }

  function enterPasscodeSetup() {
    S.passcodePending = null;
    showPasscode("设置站点口令", "首次使用，请设置一个站点口令。留空表示不设口令（任何人都能打开编辑器，但仍需你的 PAT 才能保存）。");
  }

  function showPasscode(title, desc) {
    $("passcode-title").textContent = title;
    $("passcode-desc").textContent = desc;
    $("screen-connect").hidden = true;
    $("screen-editor").hidden = true;
    $("screen-passcode").hidden = false;
    $("f-passcode").value = "";
    setTimeout(function () { $("f-passcode").focus(); }, 50);
  }

  function submitPasscode() {
    var val = $("f-passcode").value;
    var data = S.cfg ? JSON.parse(b64ToUtf8(S.cfg.content)) : { setup: false, passcodeHash: "" };

    if (!data.passcodeHash) {
      /* 首次设置 */
      if (val.trim() === "") { S.passcodeOk = true; loadContent(); return; }
      S.passcodePending = val;
      S.passcodeOk = true;
      loadContent();
      return;
    }
    sha256(val).then(function (h) {
      if (h === data.passcodeHash) { S.passcodeOk = true; loadContent(); }
      else toast("口令不正确", true);
    });
  }

  function loadContent() {
    toast("加载内容中…");
    contentGet(CONTENT_PATH).then(function (c) {
      if (c._404) throw new Error("未找到 " + CONTENT_PATH + "，请确认仓库内有该文件");
      S.content = JSON.parse(b64ToUtf8(c.content));
      S.contentSha = c.sha;
      buildEditor();
      $("editor-repo").textContent = S.owner + "/" + S.repo + " · " + S.branch;
      if ($("wbUserRepo")) $("wbUserRepo").textContent = S.owner + "/" + S.repo;
      if ($("wbUserBranch")) $("wbUserBranch").textContent = S.branch;
      $("screen-connect").hidden = true;
      $("screen-passcode").hidden = true;
      $("screen-editor").hidden = false;
      toast("已加载，可以开始编辑");
    }).catch(function (err) {
      toast("加载失败：" + err.message, true);
    });
  }

  /* ---------- 保存 ---------- */
  function save() {
    if (!S.content) return;
    toast("正在提交到 GitHub…");

    var sequence = Promise.resolve();
    /* 首次设置口令：先写 admin.config.json */
    if (S.passcodePending != null) {
      sequence = sequence.then(function () {
        var newCfg = { setup: true, passcodeHash: "" };
        return sha256(S.passcodePending).then(function (h) {
          newCfg.passcodeHash = h;
          return contentPut(CONFIG_PATH, "chore: set admin passcode", JSON.stringify(newCfg, null, 2), S.cfgSha)
            .then(function (r) { S.cfgSha = r.content.sha; S.passcodePending = null; });
        });
      });
    }

    sequence.then(function () {
      var payload = JSON.stringify(S.content, null, 2);
      return contentPut(CONTENT_PATH, "update: edit site content via admin", payload, S.contentSha);
    }).then(function (r) {
      S.contentSha = r.content.sha;
      toast("✓ 已保存！GitHub Pages 通常 1 分钟内更新");
    }).catch(function (err) {
      toast("保存失败：" + err.message, true);
    });
  }

  /* ---------- 编辑器构建（Tab 结构：基础信息 / 新闻 / 俱乐部 / 教练 / 男足 / 女足 / 赛程 / 页脚） ---------- */
  function buildEditor() {
    var root = $("editor-root");
    root.innerHTML = "";
    var C = S.content;

    /* 确保结构存在 */
    C.hero = C.hero || {}; C.teams = C.teams || [];
    C.hero.facts = C.hero.facts || [];
    C.stats = C.stats || [];
    C.competitions = C.competitions || [];
    C.news = C.news || [];
    C.club = C.club || {}; C.club.honors = C.club.honors || []; C.club.timeline = C.club.timeline || [];
    C.squad = C.squad || {}; C.squad.men = C.squad.men || []; C.squad.women = C.squad.women || [];
    C.fixtures = C.fixtures || {}; C.fixtures.recent = C.fixtures.recent || []; C.fixtures.upcoming = C.fixtures.upcoming || [];
    C.story = C.story || {}; C.story.values = C.story.values || [];
    C.footer = C.footer || {}; C.footer.links = C.footer.links || []; C.footer.social = C.footer.social || []; C.footer.contact = C.footer.contact || [];
    C.squadHistory = C.squadHistory || {}; C.staffHistory = C.staffHistory || {}; C.achievements = C.achievements || {};

    /* 页面骨架：工作台 + 各编辑页（由左侧导航切换） */
    var panels = {};
    PAGES.forEach(function (p) {
      var page = el("div", { class: "wb-page" });
      page.setAttribute("data-page", p.id);
      if (p.id !== "dash") page.hidden = true;
      panels[p.id] = page;
      root.appendChild(page);
    });
    buildDashboard(panels.dash, C);

    /* ===== 基础信息 ===== */
    var pb = panels.basics;
    pb.appendChild(section("站点信息", [
      textField(C, "site.name", "球队名称"),
      textField(C, "site.abbr", "英文缩写"),
      textField(C, "site.tagline", "标语")
    ]));
    pb.appendChild(section("首屏 Hero", [
      textField(C, "hero.eyebrow", "小标题"),
      textField(C, "hero.titleA", "主标题·第一行"),
      textField(C, "hero.titleB", "主标题·第二行(强调色)"),
      textField(C, "hero.titleC", "主标题·第三行(描边)"),
      textareaField(C, "hero.lead", "导语"),
      textField(C, "hero.season.num", "赛季编号"),
      textField(C, "hero.season.label", "赛季标签")
    ]));
    pb.appendChild(repeatable("球队分组（男足/女足）", C.teams, [
      { key: "id", label: "标识(men/women)" }, { key: "name", label: "全称" },
      { key: "short", label: "简称(男足/女足)" }, { key: "group", label: "组别" }
    ], { label: "添加球队" }));
    pb.appendChild(repeatable("Hero 小事实", C.hero.facts, [
      { key: "label", label: "标签" }, { key: "value", label: "值" }
    ], { label: "添加事实" }));
    pb.appendChild(repeatable("数据条（深色条）", C.stats, [
      { key: "num", label: "数字" }, { key: "unit", label: "单位(可空)" }, { key: "label", label: "说明" }
    ], { label: "添加数据" }));
    pb.appendChild(repeatable("三项年度赛事（新生杯 / 华科杯 / 毕业杯）", C.competitions, [
      { key: "name", label: "赛事名" }, { key: "badge", label: "简称/徽标" }, { key: "desc", label: "说明" }
    ], { label: "添加赛事" }));

    /* ===== 新闻 ===== */
    var pn = panels.news;
    pn.appendChild(repeatable("新闻动态", C.news, [
      { key: "date", label: "日期(YYYY.MM.DD)" },
      { key: "tag", label: "标签", type: "select", options: [
        { value: "战报", label: "战报" }, { value: "公告", label: "公告" },
        { value: "荣誉", label: "荣誉" }, { value: "动态", label: "动态" }
      ], default: "动态" },
      { key: "title", label: "标题" },
      { key: "summary", label: "摘要", type: "textarea" },
      { key: "body", label: "正文(详细内容，空行分段，支持换行)", type: "textarea" },
      { key: "images", label: "配图(可多张，点保存生效)", type: "images" },
      { key: "video", label: "视频链接(mp4直链 或 B站播放器嵌入URL，可空)", type: "textarea" },
      { key: "videoEmbed", label: "视频为嵌入链接(如B站iframe，勾选则网页内嵌入播放)", type: "checkbox" },
      { key: "team", label: "关联球队(可空)", type: "select", options: (C.teams || []).map(function(t){return{value:t.short,label:t.short};}).concat([{value:"",label:"无"}]) },
      { key: "comp", label: "关联赛事(可空)" }
    ], {
      label: "添加新闻",
      prepend: true,
      columns: [
        { key: "date", label: "日期" },
        { key: "title", label: "标题", wide: true },
        { key: "tag", label: "标签" },
        { key: "comp", label: "赛事" }
      ]
    }));

    /* ===== 俱乐部 ===== */
    var pc = panels.club;
    pc.appendChild(section("简介", [textareaField(C.club, "intro", "俱乐部介绍（支持换行）")]));
    pc.appendChild(repeatable("荣誉", C.club.honors, [
      { key: "year", label: "年份" },
      { key: "comp", label: "赛事", type: "select", options: [
        { value: "华科杯", label: "华科杯" }, { value: "新生杯", label: "新生杯" }, { value: "毕业杯", label: "毕业杯" }
      ], default: "华科杯" },
      { key: "group", label: "组别(可空)" },
      { key: "rank", label: "名次", type: "select", options: [
        { value: "冠军", label: "冠军(金)" }, { value: "亚军", label: "亚军(银)" }, { value: "季军", label: "季军(铜)" }
      ], default: "冠军" }
    ], { label: "添加荣誉" }));
    pc.appendChild(repeatable("历程时间线", C.club.timeline, [
      { key: "year", label: "年份" }, { key: "text", label: "事件描述" }
    ], { label: "添加时间节点" }));
    pc.appendChild(section("队长引语（显示在比赛区之后）", [
      textareaField(C.story, "quote", "引语（用换行分行）"),
      textField(C.story, "cite", "署名")
    ]));
    pc.appendChild(repeatable("价值观", C.story.values, [
      { key: "k", label: "序号" }, { key: "title", label: "标题" },
      { key: "text", label: "说明", type: "textarea" }
    ], { label: "添加价值观" }));

    /* ===== 教练·领队（按队伍分别编辑） ===== */
    C.teams.forEach(function (t) {
      t.staff = t.staff || [];
      panels.staff.append(repeatable(t.name + " · 教练与领队", t.staff, [
        { key: "name", label: "姓名" }, { key: "id", label: "学号/工号" }, { key: "role", label: "职务" },
        { key: "note", label: "简介", type: "textarea" },
        { key: "img", label: "头像图片", type: "image" }
      ], {
        label: "添加成员",
        columns: [
          { key: "role", label: "职务" },
          { key: "name", label: "姓名" },
          { key: "id", label: "学号/工号" }
        ]
      }));
    });

    /* ===== 男足阵容 ===== */
    panels.men.appendChild(repeatable("男子足球队阵容", C.squad.men, [
      { key: "num", label: "号码" }, { key: "name", label: "姓名" }, { key: "pos", label: "位置" },
      { key: "id", label: "学号/工号" },
      { key: "note", label: "简介", type: "textarea" }, { key: "captain", label: "队长", type: "checkbox" },
      { key: "img", label: "头像图片", type: "image" }
    ], {
      label: "添加男足球员",
      columns: [
        { key: "num", label: "号码" },
        { key: "name", label: "姓名" },
        { key: "pos", label: "位置" },
        { key: "id", label: "学号/工号" }
      ]
    }));

    /* ===== 女足阵容 ===== */
    panels.women.appendChild(repeatable("女子足球队阵容", C.squad.women, [
      { key: "num", label: "号码" }, { key: "name", label: "姓名" }, { key: "pos", label: "位置" },
      { key: "id", label: "学号/工号" },
      { key: "note", label: "简介", type: "textarea" }, { key: "captain", label: "队长", type: "checkbox" },
      { key: "img", label: "头像图片", type: "image" }
    ], {
      label: "添加女足球员",
      columns: [
        { key: "num", label: "号码" },
        { key: "name", label: "姓名" },
        { key: "pos", label: "位置" },
        { key: "id", label: "学号/工号" }
      ]
    }));

    /* ===== 赛程 · 战报（按赛事分组） ===== */
    var pf = panels.fix;
    var compNames = (C.competitions && C.competitions.length)
      ? C.competitions.map(function (c) { return c.name; })
      : ["新生杯", "华科杯", "毕业杯"];
    /* 补全数据中实际存在、但未在 competitions 声明的赛事（如 友谊赛），使其也能录入 */
    (C.fixtures.recent || []).concat(C.fixtures.upcoming || []).forEach(function (m) {
      if (m.comp && compNames.indexOf(m.comp) === -1) compNames.push(m.comp);
    });
    var teamOptions = (C.teams && C.teams.length)
      ? C.teams.map(function (t) { return { value: t.short, label: t.short }; })
      : [{ value: "男足", label: "男足" }, { value: "女足", label: "女足" }];
    if (!teamOptions.length) teamOptions = [{ value: "男足", label: "男足" }, { value: "女足", label: "女足" }];
    var resultOptions = [
      { value: "W", label: "胜 (W)" }, { value: "D", label: "平 (D)" }, { value: "L", label: "负 (L)" }
    ];

    compNames.forEach(function (comp) {
      pf.appendChild(el("h3", { class: "a-comp-title" }, esc(comp)));
      pf.appendChild(repeatable(comp + " · 最近战报", C.fixtures.recent, [
        { key: "date", label: "日期" }, { key: "home", label: "主队" }, { key: "away", label: "客队" },
        { key: "score", label: "比分" }, { key: "result", label: "结果", type: "select", options: resultOptions, default: "W" },
        { key: "round", label: "轮次" }, { key: "team", label: "球队", type: "select", options: teamOptions, default: teamOptions[0].value },
        { key: "video", label: "视频链接" },
        { key: "goals", label: "进球明细（球员 · 时间）", type: "events", itemLabel: "进球", fields: [
          { key: "player", label: "球员" },
          { key: "time", label: "时间(如 23')" }
        ] },
        { key: "cards", label: "红黄牌明细（球员 · 时间 · 类型）", type: "events", itemLabel: "红黄牌", fields: [
          { key: "player", label: "球员" },
          { key: "time", label: "时间(如 45')" },
          { key: "type", label: "类型", type: "select", options: [
            { value: "Y", label: "黄牌" }, { value: "R", label: "红牌" }
          ], default: "Y" }
        ] }
      ], {
        label: "添加战报",
        prepend: true,
        columns: [
          { key: "date", label: "日期" },
          { key: "vs", label: "对阵", wide: true, get: function (m) { return (m.home || "") + " vs " + (m.away || ""); } },
          { key: "score", label: "比分" },
          { key: "result", label: "结果" },
          { key: "round", label: "轮次" }
        ],
        filter: function (x) { return x.comp === comp; },
        defaults: { comp: comp }
      }));
      pf.appendChild(repeatable(comp + " · 接下来", C.fixtures.upcoming, [
        { key: "date", label: "日期" }, { key: "home", label: "主队" }, { key: "away", label: "客队" },
        { key: "time", label: "时间" }, { key: "venue", label: "主/客场" }, { key: "round", label: "轮次" },
        { key: "team", label: "球队", type: "select", options: teamOptions, default: teamOptions[0].value }
      ], {
        label: "添加赛程",
        prepend: true,
        columns: [
          { key: "date", label: "日期" },
          { key: "vs", label: "对阵", wide: true, get: function (m) { return (m.home || "") + " vs " + (m.away || ""); } },
          { key: "time", label: "时间" },
          { key: "venue", label: "场地" },
          { key: "round", label: "轮次" }
        ],
        filter: function (x) { return x.comp === comp; },
        defaults: { comp: comp }
      }));
    });

    /* ===== 历史阵容（赛季 → 赛事 → 男足/女足 三级） ===== */
    editNestedHistory(panels.squadHist, C.squadHistory, [
      { key: "num", label: "号码" },
      { key: "name", label: "姓名" },
      { key: "pos", label: "位置" },
      { key: "id", label: "学号/工号" },
      { key: "captain", label: "队长", type: "checkbox" }
    ], "球员", [
      { key: "num", label: "号码" }, { key: "name", label: "姓名" },
      { key: "pos", label: "位置" }, { key: "id", label: "学号/工号" }
    ]);

    /* ===== 历史官员（同上三级结构） ===== */
    editNestedHistory(panels.staffHist, C.staffHistory, [
      { key: "role", label: "职务" },
      { key: "name", label: "姓名" },
      { key: "id", label: "学号/工号" }
    ], "官员", [
      { key: "role", label: "职务" }, { key: "name", label: "姓名" }, { key: "id", label: "学号/工号" }
    ]);

    /* ===== 历史成绩（按赛季 + 键/值） ===== */
    editAchievements(panels.ach, C);

    /* ===== 页脚 · 联系 ===== */
    var pf2 = panels.footer;
    pf2.appendChild(section("页脚信息", [
      textareaField(C.footer, "intro", "简介"),
      textField(C.footer, "copyright", "版权信息")
    ]));
    pf2.append(repeatable("快速链接", C.footer.links, [
      { key: "label", label: "文字" }, { key: "href", label: "链接(#锚点或URL)" }
    ], { label: "添加链接" }));
    pf2.append(repeatable("社交媒体", C.footer.social, [
      { key: "label", label: "文字" }, { key: "href", label: "链接" }
    ], { label: "添加社交" }));
    pf2.append(repeatable("联系信息（显示在页脚）", C.footer.contact, [
      { key: "label", label: "标签(如邮箱/地址)" }, { key: "value", label: "内容" }
    ], { label: "添加联系方式" }));

    /* 导航与初始页 */
    buildSidebar();
    activatePage("dash", true);
  }

  /* ---------- 工作台：左侧导航 ---------- */
  var PAGES = [
    { id: "dash",      group: "概览",     label: "工作台" },
    { id: "news",      group: "内容管理", label: "新闻动态" },
    { id: "club",      group: "内容管理", label: "俱乐部" },
    { id: "basics",    group: "内容管理", label: "基础信息" },
    { id: "men",       group: "球队阵容", label: "男足阵容" },
    { id: "women",     group: "球队阵容", label: "女足阵容" },
    { id: "staff",     group: "球队阵容", label: "教练 · 领队" },
    { id: "fix",       group: "比赛数据", label: "赛程 · 战报" },
    { id: "ach",       group: "比赛数据", label: "历史成绩" },
    { id: "squadHist", group: "历史档案", label: "历史阵容" },
    { id: "staffHist", group: "历史档案", label: "历史官员" },
    { id: "footer",    group: "站点设置", label: "页脚 · 联系" }
  ];

  function buildSidebar() {
    var nav = $("wbNav");
    if (!nav) return;
    nav.innerHTML = "";
    var groups = {}, order = [];
    PAGES.forEach(function (p) {
      if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); }
      groups[p.group].push(p);
    });
    order.forEach(function (g) {
      var wrap = el("div", { class: "wb__group" });
      wrap.appendChild(el("div", { class: "wb__group-title" }, esc(g)));
      groups[g].forEach(function (p) {
        var b = el("button", { class: "wb__item", type: "button" });
        b.setAttribute("data-page", p.id);
        b.textContent = p.label;
        b.addEventListener("click", function () { activatePage(p.id); });
        wrap.appendChild(b);
      });
      nav.appendChild(wrap);
    });
  }

  function activatePage(id, silent) {
    var root = $("editor-root");
    if (!root) return;
    var found = false;
    Array.prototype.forEach.call(root.querySelectorAll(".wb-page"), function (pg) {
      var on = pg.getAttribute("data-page") === id;
      pg.hidden = !on;
      if (on) found = true;
    });
    if (!found) return;

    var nav = $("wbNav");
    if (nav) Array.prototype.forEach.call(nav.querySelectorAll(".wb__item"), function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-page") === id);
    });

    var meta = null;
    PAGES.forEach(function (p) { if (p.id === id) meta = p; });
    var crumb = $("wbCrumb");
    if (crumb && meta) crumb.textContent = meta.label;

    if (!silent && window.scrollTo) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 工作台：概览面板 ---------- */
  var ICON = {
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h12.5V19H5.5A1.5 1.5 0 0 1 4 17.5z"/><path d="M16.5 8.5H20v8.5a2 2 0 0 1-2 2h-1.5"/><path d="M7 9h6M7 12.5h6M7 16h4"/></svg>',
    match: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.6l3.1 2.3-1.2 3.6h-3.8L8.9 9.9z"/><path d="M12 3.4v4.2M4.3 9.9l3.5 2.4M19.7 9.9l-3.5 2.4M8.4 20.1l1.7-4.1M15.6 20.1l-1.7-4.1"/></svg>',
    season: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.6" y="5.2" width="16.8" height="14.6" rx="2.4"/><path d="M3.6 10h16.8M8.2 3.6v3M15.8 3.6v3"/></svg>',
    squad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.2" cy="8.6" r="3.1"/><path d="M3.6 19.4c0-2.9 2.5-4.9 5.6-4.9s5.6 2 5.6 4.9"/><path d="M16.2 6.4a2.9 2.9 0 0 1 0 5.4M17.8 19.4c0-2.1-.6-3.5-1.7-4.5"/></svg>'
  };

  function panel(title, moreLabel, moreFn) {
    var s = el("section", { class: "wb-panel" });
    var head = el("div", { class: "wb-panel__head" });
    head.appendChild(el("h3", { class: "wb-panel__title" }, esc(title)));
    if (moreLabel) {
      var m = el("button", { class: "wb-panel__more", type: "button" }, esc(moreLabel) + " →");
      m.addEventListener("click", moreFn);
      head.appendChild(m);
    }
    s.appendChild(head);
    return s;
  }

  function buildDashboard(page, C) {
    if (!page) return;
    var recent = C.fixtures.recent || [];
    var upcoming = C.fixtures.upcoming || [];
    var news = C.news || [];
    var seasons = Object.keys(C.squadHistory || {});
    var squadN = (C.squad.men || []).length + (C.squad.women || []).length;

    var d = new Date();
    var wk = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][d.getDay()];
    var dateStr = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + wk;

    /* 欢迎条 + KPI */
    var hero = el("section", { class: "wb-hero" });
    var hl = el("div");
    hl.appendChild(el("h2", { class: "wb-hero__title" }, "欢迎回来，管理员！"));
    hl.appendChild(el("p", { class: "wb-hero__sub" },
      "今天是 " + esc(dateStr) + " · 站点已收录 " + recent.length + " 场比赛、" + news.length + " 条新闻"));
    hero.appendChild(hl);

    var kpis = el("div", { class: "wb-kpis" });
    [
      { label: "新闻动态", num: news.length, icon: ICON.news },
      { label: "比赛场次", num: recent.length + upcoming.length, icon: ICON.match },
      { label: "历史赛季", num: seasons.length, icon: ICON.season },
      { label: "现役阵容", num: squadN, icon: ICON.squad }
    ].forEach(function (k) {
      var card = el("div", { class: "wb-kpi" });
      var txt = el("div");
      txt.appendChild(el("div", { class: "wb-kpi__label" }, esc(k.label)));
      txt.appendChild(el("div", { class: "wb-kpi__num" }, String(k.num)));
      card.appendChild(txt);
      card.appendChild(el("div", { class: "wb-kpi__icon" }, k.icon));
      kpis.appendChild(card);
    });
    hero.appendChild(kpis);
    page.appendChild(hero);

    /* 最近战报 + 快捷入口 */
    var g1 = el("div", { class: "wb-grid" });

    var p1 = panel("最近战报", "查看全部", function () { activatePage("fix"); });
    var list = el("div", { class: "wb-list" });
    var rs = recent.slice(0, 6);
    if (!rs.length) list.appendChild(el("div", { class: "wb-empty" }, "暂无比赛记录"));
    rs.forEach(function (m) {
      var row = el("div", { class: "wb-item" });
      row.appendChild(el("span", { class: "wb-item__date" }, esc(m.date || "")));
      row.appendChild(el("span", { class: "wb-item__main" },
        esc(m.home || "") + '<span style="color:var(--ink-faint);font-weight:400"> vs </span>' +
        esc(m.away || "") + " · " + esc(m.score || "")));
      var cls = m.result === "W" ? "wb-pill--w" : m.result === "L" ? "wb-pill--l" : "wb-pill--d";
      row.appendChild(el("span", { class: "wb-pill " + cls }, m.result === "W" ? "胜" : m.result === "L" ? "负" : "平"));
      var b = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "编辑");
      b.addEventListener("click", function () { activatePage("fix"); });
      row.appendChild(b);
      list.appendChild(row);
    });
    p1.appendChild(list);
    g1.appendChild(p1);

    var p2 = panel("快捷入口");
    var q = el("div", { class: "wb-quick" });
    [
      { label: "新增新闻", hint: "新闻动态", go: "news" },
      { label: "录入比赛 / 战报", hint: "赛程 · 战报", go: "fix" },
      { label: "编辑男足阵容", hint: "球队阵容", go: "men" },
      { label: "历史赛季成绩", hint: "历史成绩", go: "ach" },
      { label: "历史阵容 / 官员", hint: "历史档案", go: "squadHist" }
    ].forEach(function (it) {
      var b = el("button", { class: "wb-quick__btn", type: "button" });
      b.appendChild(el("span", null, esc(it.label)));
      b.appendChild(el("span", null, esc(it.hint) + " →"));
      b.addEventListener("click", function () { activatePage(it.go); });
      q.appendChild(b);
    });
    var exp = el("button", { class: "wb-quick__btn", type: "button" });
    exp.appendChild(el("span", null, "导出 content.json"));
    exp.appendChild(el("span", null, "本地备份 →"));
    exp.addEventListener("click", exportJson);
    q.appendChild(exp);
    p2.appendChild(q);
    g1.appendChild(p2);
    page.appendChild(g1);

    /* 赛事战绩统计 + 最新新闻 */
    var g2 = el("div", { class: "wb-grid" });

    var p3 = panel("赛事战绩统计", "全部战报", function () { activatePage("fix"); });
    var byComp = {};
    recent.forEach(function (m) {
      var k = m.comp || "其他";
      var o = byComp[k] || (byComp[k] = { n: 0, w: 0, d: 0, l: 0 });
      o.n++;
      if (m.result === "W") o.w++;
      else if (m.result === "D") o.d++;
      else if (m.result === "L") o.l++;
    });
    var comps = Object.keys(byComp).sort(function (a, b) { return byComp[b].n - byComp[a].n; });
    if (!comps.length) {
      p3.appendChild(el("div", { class: "wb-empty" }, "暂无数据"));
    } else {
      var t = el("table", { class: "wb-table" });
      var thead = el("thead"), trh = el("tr");
      ["赛事", "场次", "胜", "平", "负", "胜率"].forEach(function (h, i) {
        trh.appendChild(el("th", { class: i >= 1 ? "right" : "" }, h));
      });
      thead.appendChild(trh);
      t.appendChild(thead);
      var tb = el("tbody");
      comps.forEach(function (k) {
        var o = byComp[k], tr = el("tr");
        tr.appendChild(el("td", null, esc(k)));
        tr.appendChild(el("td", { class: "num right" }, String(o.n)));
        tr.appendChild(el("td", { class: "num right" }, String(o.w)));
        tr.appendChild(el("td", { class: "num right" }, String(o.d)));
        tr.appendChild(el("td", { class: "num right" }, String(o.l)));
        tr.appendChild(el("td", { class: "num right" }, o.n ? Math.round(o.w / o.n * 100) + "%" : "—"));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      p3.appendChild(t);
    }
    g2.appendChild(p3);

    var p4 = panel("最新新闻", "全部新闻", function () { activatePage("news"); });
    var nl = el("div", { class: "wb-list" });
    var ns = news.slice(0, 5);
    if (!ns.length) nl.appendChild(el("div", { class: "wb-empty" }, "暂无新闻"));
    ns.forEach(function (n) {
      var row = el("div", { class: "wb-item wb-item--news" });
      row.appendChild(el("span", { class: "wb-item__date" }, esc(n.date || "")));
      row.appendChild(el("span", { class: "wb-item__main", title: n.title || "" }, esc(n.title || "（无标题）")));
      row.appendChild(el("span", { class: "wb-tag" }, esc(n.tag || "动态")));
      nl.appendChild(row);
    });
    p4.appendChild(nl);
    g2.appendChild(p4);

    page.appendChild(g2);
  }

  /* ---------- 表单部件 ---------- */
  function section(title, fields) {
    var s = el("section", { class: "a-section" });
    s.appendChild(el("h3", { class: "a-section__title" }, esc(title)));
    var grid = el("div", { class: "a-grid" });
    fields.forEach(function (f) { grid.appendChild(f); });
    s.appendChild(grid);
    return s;
  }

  function textField(obj, path, label) {
    var cur = getPath(obj, path);
    var input = el("input", { class: "a-input", type: "text", value: cur == null ? "" : cur });
    input.addEventListener("input", function () { setPath(obj, path, input.value); });
    input.addEventListener("change", function () { setPath(obj, path, input.value); });
    return fieldWrap(label, input);
  }
  function textareaField(obj, path, label) {
    var cur = getPath(obj, path);
    var ta = el("textarea", { class: "a-input a-textarea", rows: "3" });
    ta.value = cur == null ? "" : cur;
    ta.addEventListener("input", function () { setPath(obj, path, ta.value); });
    return fieldWrap(label, ta);
  }
  function fieldWrap(label, control) {
    var f = el("label", { class: "a-field" });
    f.appendChild(el("span", null, esc(label)));
    f.appendChild(control);
    return f;
  }

  /* ---------- 列表列定义 / 单元格取值 / 只读详情 ---------- */
  function pickColumns(defs, opts) {
    if (opts.columns) return opts.columns;
    var cols = [];
    defs.forEach(function (d) {
      if (cols.length >= 4) return;
      if (d.type === "textarea" || d.type === "image" || d.type === "images" || d.type === "events") return;
      cols.push({ key: d.key, label: d.label });
    });
    return cols;
  }
  var RESULT_LABEL = { W: "胜", D: "平", L: "负" };

  function cellText(c, it) {
    var v = c.get ? c.get(it) : it[c.key];
    if (v == null) v = "";
    if (Array.isArray(v)) v = v.join("、");
    v = String(v);
    if (c.key === "result" && RESULT_LABEL[v]) return RESULT_LABEL[v];
    return v;
  }

  /* 可重复列表：默认「表格分条显示 + 每行 查看/修改/删除」；
     opts.table=false 退回卡片列表（用于进球/红黄牌这类嵌套明细） */
  function repeatable(title, arr, defs, opts) {
    opts = opts || {};
    var useTable = opts.table !== false;
    var filterFn = opts.filter || function () { return true; };
    var defaults = opts.defaults || {};
    var pageSize = opts.pageSize || 50;

    var s = el("section", { class: "a-section" });
    var head = el("div", { class: "a-section__head" });
    var tw = el("div", { class: "a-section__titlewrap" });
    tw.appendChild(el("h3", { class: "a-section__title" }, esc(title)));
    var countEl = el("span", { class: "a-count" }, "0 条");
    tw.appendChild(countEl);
    head.appendChild(tw);

    var tools = el("div", { class: "a-section__tools" });
    var initialCount = arr.filter(filterFn).length;
    var searchEl = null;
    /* 条目少的时候不显示搜索框，避免历史阵容等 40+ 个小表被搜索框塞满 */
    if (useTable && initialCount >= 8) {
      searchEl = el("input", { class: "a-input a-search", type: "search", placeholder: "搜索…" });
      tools.appendChild(searchEl);
    }
    var addBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ " + esc(opts.label || "添加"));
    tools.appendChild(addBtn);
    head.appendChild(tools);
    s.appendChild(head);

    var list = el("div", { class: "a-list" });        /* 卡片模式容器 */
    var wrap = el("div", { class: "a-table-wrap" });  /* 表格模式容器 */
    var table = el("table", { class: "a-table" });
    var tbody = el("tbody");
    var moreBar = el("div", { class: "a-more" });
    var cols = pickColumns(defs, opts);

    function blankItem() {
      var it = {};
      defs.forEach(function (d) {
        if (d.type === "checkbox") it[d.key] = false;
        else if (d.default != null) it[d.key] = d.default;
        else it[d.key] = "";
      });
      Object.keys(defaults).forEach(function (k) { it[k] = defaults[k]; });
      return it;
    }

    /* ---- 单条编辑卡（点击「修改」后展开） ---- */
    function renderCard(item, afterRemove) {
      var row = el("div", { class: "a-row-card" });
      var grid = el("div", { class: "a-grid a-grid--row" });
      defs.forEach(function (d) {
        if (d.type === "checkbox") {
          var lab = el("label", { class: "a-field a-field--check" });
          var cb = el("input", { type: "checkbox" });
          cb.checked = !!item[d.key];
          cb.addEventListener("change", function () { item[d.key] = cb.checked; });
          lab.appendChild(cb);
          lab.appendChild(el("span", null, esc(d.label)));
          grid.appendChild(lab);
        } else if (d.type === "textarea") {
          var ta = el("textarea", { class: "a-input a-textarea", rows: "2" });
          ta.value = item[d.key] == null ? "" : item[d.key];
          ta.addEventListener("input", function () { item[d.key] = ta.value; });
          var fw = el("label", { class: "a-field a-field--full" });
          fw.appendChild(el("span", null, esc(d.label)));
          fw.appendChild(ta);
          grid.appendChild(fw);
        } else if (d.type === "select") {
          var sel = el("select", { class: "a-input" });
          (d.options || []).forEach(function (o) {
            var val = (o && o.value != null) ? o.value : o;
            var lbl = (o && o.label != null) ? o.label : o;
            var opt = el("option", { value: val });
            opt.textContent = lbl;
            if (String(item[d.key]) === String(val)) opt.selected = true;
            sel.appendChild(opt);
          });
          sel.addEventListener("change", function () { item[d.key] = sel.value; });
          var fw = el("label", { class: "a-field" });
          fw.appendChild(el("span", null, esc(d.label)));
          fw.appendChild(sel);
          grid.appendChild(fw);
        } else if (d.type === "image") {
          var ifw = el("label", { class: "a-field a-field--full a-field--img" });
          ifw.appendChild(el("span", null, esc(d.label)));
          var preview = el("div", { class: "a-img-preview" });
          if (item[d.key]) preview.appendChild(el("img", { src: item[d.key], alt: "预览" }));
          else preview.appendChild(el("span", { class: "a-img-empty" }, "暂无图片"));
          ifw.appendChild(preview);
          var fileInput = el("input", { class: "a-input", type: "file", accept: "image/*" });
          fileInput.addEventListener("change", function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            resizeImage(file, 480, 0.82).then(function (dataUrl) {
              item[d.key] = dataUrl;
              preview.innerHTML = "";
              preview.appendChild(el("img", { src: dataUrl, alt: "预览" }));
              toast("图片已选择，点「保存修改」生效");
            }).catch(function (err) { toast("图片处理失败：" + err.message, true); });
          });
          ifw.appendChild(fileInput);
          var clr = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "清除图片");
          clr.addEventListener("click", function () {
            item[d.key] = "";
            preview.innerHTML = "";
            preview.appendChild(el("span", { class: "a-img-empty" }, "暂无图片"));
            fileInput.value = "";
          });
          ifw.appendChild(clr);
          grid.appendChild(ifw);
        } else if (d.type === "images") {
          var ifw2 = el("label", { class: "a-field a-field--full a-field--imgs" });
          ifw2.appendChild(el("span", null, esc(d.label)));
          var thumbGrid = el("div", { class: "a-imgs-grid" });
          function renderImgs() {
            thumbGrid.innerHTML = "";
            (item[d.key] || []).forEach(function (src, idx) {
              var cell = el("div", { class: "a-img-cell" });
              cell.appendChild(el("img", { src: src, alt: "配图" }));
              var del = el("button", { class: "a-img-del", type: "button", title: "删除" }, "✕");
              del.addEventListener("click", function () {
                item[d.key].splice(idx, 1);
                renderImgs();
              });
              cell.appendChild(del);
              thumbGrid.appendChild(cell);
            });
          }
          renderImgs();
          ifw2.appendChild(thumbGrid);
          var fileInput = el("input", { class: "a-input", type: "file", accept: "image/*", style: "display:none" });
          var addImg = el("label", { class: "a-img-add btn btn--ghost btn--sm" }, "+ 添加图片");
          addImg.appendChild(fileInput);
          fileInput.addEventListener("change", function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            resizeImage(file, 960, 0.82).then(function (dataUrl) {
              if (!item[d.key]) item[d.key] = [];
              item[d.key].push(dataUrl);
              renderImgs();
              toast("图片已添加，点「保存修改」生效");
            }).catch(function (err) { toast("图片处理失败：" + err.message, true); });
            fileInput.value = "";
          });
          ifw2.appendChild(addImg);
          grid.appendChild(ifw2);
        } else if (d.type === "events") {
          /* 嵌套明细（进球 / 红黄牌）：保持卡片式，避免表格里再套表格 */
          var subArr = (item[d.key] || []);
          item[d.key] = subArr;
          var fw = el("label", { class: "a-field a-field--full" });
          fw.appendChild(el("span", null, esc(d.label)));
          var nested = repeatable((d.label || "明细"), subArr, d.fields || [], {
            label: "添加" + (d.itemLabel || "条目"),
            table: false
          });
          nested.classList.add("a-section--nested");
          fw.appendChild(nested);
          grid.appendChild(fw);
        } else {
          var inp = el("input", { class: "a-input", type: "text", value: item[d.key] == null ? "" : item[d.key] });
          inp.addEventListener("input", function () { item[d.key] = inp.value; });
          var fw2 = el("label", { class: "a-field" });
          fw2.appendChild(el("span", null, esc(d.label)));
          fw2.appendChild(inp);
          grid.appendChild(fw2);
        }
      });
      row.appendChild(grid);
      var rm = el("button", { class: "a-row-remove", type: "button", title: "删除这一条" }, "✕");
      rm.addEventListener("click", function () {
        if (!window.confirm("确定删除这一条？点「保存修改」后才会写入仓库。")) return;
        var i = arr.indexOf(item);
        if (i > -1) arr.splice(i, 1);
        if (afterRemove) afterRemove();
        else row.remove();
      });
      row.appendChild(rm);
      return row;
    }

    /* ---- 只读详情（点击「查看」后展开） ---- */
    function detailBody(item) {
      var box = el("div", { class: "a-detail" });
      defs.forEach(function (d) {
        var val = item[d.key];
        var row = el("div", { class: "a-detail__row" });
        row.appendChild(el("span", { class: "a-detail__k" }, esc(d.label)));
        var v = el("div", { class: "a-detail__v" });
        if (d.type === "images") {
          if (!val || !val.length) v.textContent = "—";
          else val.forEach(function (src) { v.appendChild(el("img", { class: "a-detail__thumb", src: src, alt: "配图" })); });
        } else if (d.type === "image") {
          if (!val) v.textContent = "—";
          else v.appendChild(el("img", { class: "a-detail__thumb", src: val, alt: "头像" }));
        } else if (d.type === "events") {
          if (!val || !val.length) v.textContent = "—";
          else v.textContent = val.map(function (e) {
            return (e.player || "") + " " + (e.time || "") +
              (e.penalty ? "（点球）" : "") + (e.og ? "（乌龙）" : "") +
              (e.type === "Y" ? "（黄牌）" : e.type === "R" ? "（红牌）" : "");
          }).join("； ");
        } else if (d.type === "checkbox") {
          v.textContent = val ? "是" : "否";
        } else if (d.type === "textarea") {
          v.classList.add("a-detail__v--pre");
          v.textContent = (val == null || val === "") ? "—" : String(val);
        } else {
          v.textContent = (val == null || val === "") ? "—" : String(val);
        }
        row.appendChild(v);
        box.appendChild(row);
      });
      return box;
    }

    /* ---- 卡片模式（table:false） ---- */
    if (!useTable) {
      s.appendChild(list);
      function refreshCards() {
        list.innerHTML = "";
        var its = arr.filter(filterFn);
        countEl.textContent = its.length + " 条";
        if (!its.length) {
          list.appendChild(el("p", { class: "a-empty" }, "暂无记录，点右上角按钮添加"));
          return;
        }
        its.forEach(function (item) {
          list.appendChild(renderCard(item, function () {
            var i = arr.indexOf(item);
            if (i > -1) arr.splice(i, 1);
            refreshCards();
          }));
        });
      }
      refreshCards();
      addBtn.addEventListener("click", function () {
        var it = blankItem();
        arr.push(it);
        refreshCards();
      });
      return s;
    }

    /* ---- 表格模式（默认） ---- */
    var thead = el("thead");
    var htr = el("tr");
    cols.forEach(function (c) {
      var th = el("th");
      th.textContent = c.label;
      if (c.wide) th.classList.add("a-table__wide");
      htr.appendChild(th);
    });
    htr.appendChild(el("th", { class: "a-table__op" }, "操作"));
    thead.appendChild(htr);
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    s.appendChild(wrap);
    s.appendChild(moreBar);

    var kw = "";
    var limit = pageSize;
    var entries = [];

    function items() {
      var base = arr.filter(filterFn);
      if (!kw) return base;
      var k = kw.toLowerCase();
      return base.filter(function (it) {
        var hay = cols.map(function (c) { return cellText(c, it); }).join(" ").toLowerCase();
        return hay.indexOf(k) > -1;
      });
    }

    function openEntry(entry, mode) {
      if (entry.open === mode) {
        entry.open = null;
        entry.exp.hidden = true;
        entry.tr.classList.remove("is-open");
        refreshCells(entry);   /* 收起时把改过的值同步回行内文字 */
        return;
      }
      entry.box.innerHTML = "";
      entry.box.appendChild(mode === "view" ? detailBody(entry.item)
        : renderCard(entry.item, function () { renderTable(); }));
      entry.open = mode;
      entry.exp.hidden = false;
      entry.tr.classList.add("is-open");
    }

    function refreshCells(entry) {
      cols.forEach(function (c, i) {
        var td = entry.tds[i];
        if (!td) return;
        var txt = cellText(c, entry.item);
        if (c.key === "result") {
          td.innerHTML = "";
          td.appendChild(el("span", { class: "wb-pill wb-pill--" + String(entry.item.result || "").toLowerCase() }, txt || "—"));
        } else {
          td.textContent = txt;
          td.title = txt;
        }
      });
    }

    function renderTable() {
      tbody.innerHTML = "";
      entries = [];
      var its = items();
      countEl.textContent = its.length + " 条";

      its.slice(0, limit).forEach(function (it) {
        var tr = el("tr", { class: "a-tr" });
        var tds = [];
        cols.forEach(function (c) {
          var td = el("td");
          var txt = cellText(c, it);
          if (c.key === "result") {
            var p = el("span", { class: "wb-pill wb-pill--" + String(it.result || "").toLowerCase() }, txt || "—");
            td.appendChild(p);
          } else {
            td.textContent = txt;
            td.title = txt;
          }
          tds.push(td);
          tr.appendChild(td);
        });

        var op = el("td", { class: "a-table__op" });
        var bView = el("button", { class: "a-act", type: "button" }, "查看");
        var bEdit = el("button", { class: "a-act a-act--edit", type: "button" }, "修改");
        var bDel = el("button", { class: "a-act a-act--del", type: "button" }, "删除");
        op.appendChild(bView);
        op.appendChild(bEdit);
        op.appendChild(bDel);
        tr.appendChild(op);
        tbody.appendChild(tr);

        var exp = el("tr", { class: "a-tr-exp" });
        var expTd = el("td", { class: "a-tr-exp__cell" });
        expTd.setAttribute("colspan", String(cols.length + 1));
        var box = el("div", { class: "a-expand" });
        expTd.appendChild(box);
        exp.appendChild(expTd);
        exp.hidden = true;
        tbody.appendChild(exp);

        var entry = { item: it, tr: tr, exp: exp, expTd: expTd, box: box, tds: tds, open: null };
        entries.push(entry);

        bView.addEventListener("click", function () { openEntry(entry, "view"); });
        bEdit.addEventListener("click", function () { openEntry(entry, "edit"); });
        bDel.addEventListener("click", function () {
          if (!window.confirm("确定删除这一条？点「保存修改」后才会写入仓库。")) return;
          var i = arr.indexOf(it);
          if (i > -1) arr.splice(i, 1);
          renderTable();
        });
        /* 点整行任意位置 = 查看（按钮本身不触发） */
        tr.addEventListener("click", function (e) {
          if (e.target && e.target.closest && e.target.closest(".a-act")) return;
          openEntry(entry, "view");
        });
      });

      moreBar.innerHTML = "";
      if (its.length > limit) {
        var moreBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" },
          "显示更多（还有 " + (its.length - limit) + " 条）");
        moreBtn.addEventListener("click", function () { limit += pageSize; renderTable(); });
        moreBar.appendChild(moreBtn);
      }
    }

    renderTable();

    if (searchEl) {
      searchEl.addEventListener("input", function () {
        kw = searchEl.value.trim();
        limit = pageSize;
        renderTable();
      });
    }

    addBtn.addEventListener("click", function () {
      var it = blankItem();
      if (opts.prepend) arr.unshift(it); else arr.push(it);
      if (kw) { kw = ""; if (searchEl) searchEl.value = ""; }
      var idx = items().indexOf(it);
      if (idx >= limit) limit = idx + 1;
      renderTable();
      var target = null;
      entries.forEach(function (x) { if (x.item === it) target = x; });
      if (target) {
        openEntry(target, "edit");
        if (target.tr.scrollIntoView) target.tr.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });

    return s;
  }

  /* ---------- 历史名单：按「赛季 + 赛事」筛选后逐条管理 ---------- */
  function editNestedHistory(panel, rootObj, itemDefs, itemLabel, cols) {
    panel.appendChild(el("p", { class: "a-hint" },
      "先选「赛季」和「赛事」，再管理该次比赛的" + itemLabel + "名单。每条可查看 / 修改 / 删除，改完点右上角「保存修改」提交。"));

    var cur = { season: null, comp: null };
    var COMP_ORDER = ["新生杯", "华科杯", "毕业杯"];

    function seasonsList() {
      return Object.keys(rootObj).filter(function (s) {
        return rootObj[s] && typeof rootObj[s] === "object";
      }).sort().reverse();
    }
    function compsList(season) {
      var bucket = rootObj[season] || {};
      return Object.keys(bucket).filter(function (c) {
        return bucket[c] && typeof bucket[c] === "object";
      }).sort(function (a, b) {
        var ia = COMP_ORDER.indexOf(a), ib = COMP_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    /* 筛选条 */
    var bar = el("div", { class: "a-filter" });
    var fSeason = el("label", { class: "a-field" });
    fSeason.appendChild(el("span", null, "赛季"));
    var selSeason = el("select", { class: "a-input" });
    fSeason.appendChild(selSeason);
    bar.appendChild(fSeason);

    var fComp = el("label", { class: "a-field" });
    fComp.appendChild(el("span", null, "赛事"));
    var selComp = el("select", { class: "a-input" });
    fComp.appendChild(selComp);
    bar.appendChild(fComp);

    var tools = el("div", { class: "a-filter__tools" });
    var addSeasonBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ 添加赛季");
    var addCompBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ 添加赛事");
    tools.appendChild(addSeasonBtn);
    tools.appendChild(addCompBtn);
    bar.appendChild(tools);
    panel.appendChild(bar);

    var body = el("div", { class: "a-nested" });
    panel.appendChild(body);

    function renderAll() {
      var sList = seasonsList();
      if (!sList.length) {
        selSeason.innerHTML = "";
        selComp.innerHTML = "";
        selComp.disabled = true;
        body.innerHTML = "";
        body.appendChild(el("p", { class: "a-empty" }, "还没有任何赛季，点「+ 添加赛季」开始录入"));
        return;
      }
      if (sList.indexOf(cur.season) === -1) cur.season = sList[0];

      selSeason.innerHTML = "";
      sList.forEach(function (s) {
        var o = el("option", { value: s });
        o.textContent = s;
        if (s === cur.season) o.selected = true;
        selSeason.appendChild(o);
      });

      var cList = compsList(cur.season);
      if (cList.indexOf(cur.comp) === -1) cur.comp = cList[0] || null;
      selComp.innerHTML = "";
      if (!cList.length) {
        var o0 = el("option", { value: "" });
        o0.textContent = "（暂无赛事）";
        selComp.appendChild(o0);
        selComp.disabled = true;
      } else {
        selComp.disabled = false;
        cList.forEach(function (c) {
          var o = el("option", { value: c });
          o.textContent = c;
          if (c === cur.comp) o.selected = true;
          selComp.appendChild(o);
        });
      }
      renderBody();
    }

    function renderBody() {
      body.innerHTML = "";
      if (!cur.season) return;
      if (!cur.comp) {
        body.appendChild(el("p", { class: "a-empty" }, "该赛季还没有赛事，点「+ 添加赛事」新建一个"));
        return;
      }
      var teamsObj = rootObj[cur.season][cur.comp];
      var hasWomen = Array.isArray(teamsObj.women);
      if (!Array.isArray(teamsObj.men)) teamsObj.men = [];

      var sec = el("section", { class: "a-nest-sec" });
      var head = el("div", { class: "a-section__head" });
      var tw = el("div", { class: "a-section__titlewrap" });
      tw.appendChild(el("h3", { class: "a-section__title" }, esc(cur.season + " · " + cur.comp)));
      tw.appendChild(el("span", { class: "a-count" }, (teamsObj.men.length + (hasWomen ? teamsObj.women.length : 0)) + " 人"));
      head.appendChild(tw);
      sec.appendChild(head);

      var blocks = el("div", { class: "a-team-blocks" });

      function teamBlock(key) {
        var wrap = el("div", { class: "a-team-block" });
        wrap.appendChild(el("h4", { class: "a-nest-title" }, key === "men" ? "男足" : "女足"));
        wrap.appendChild(repeatable((key === "men" ? "男足" : "女足") + " " + itemLabel, teamsObj[key], itemDefs, {
          label: "添加" + itemLabel, columns: cols
        }));
        return wrap;
      }

      blocks.appendChild(teamBlock("men"));
      if (hasWomen) blocks.appendChild(teamBlock("women"));
      else {
        var addWomen = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ 添加女足" + itemLabel + "名单");
        addWomen.addEventListener("click", function () {
          if (!window.confirm("为「" + cur.season + " · " + cur.comp + "」新增女足名单？点「保存修改」后写入仓库。")) return;
          teamsObj.women = [];
          renderBody();
        });
        blocks.appendChild(addWomen);
      }
      sec.appendChild(blocks);
      body.appendChild(sec);
    }

    selSeason.addEventListener("change", function () {
      cur.season = selSeason.value;
      cur.comp = null;
      renderAll();
    });
    selComp.addEventListener("change", function () {
      cur.comp = selComp.value;
      renderBody();
    });

    addSeasonBtn.addEventListener("click", function () {
      var name = (window.prompt("赛季名称（如 2026-2027）：") || "").trim();
      if (!name) return;
      if (rootObj[name]) { toast("该赛季已存在，已为你切换过去", true); cur.season = name; cur.comp = null; renderAll(); return; }
      rootObj[name] = {};
      cur.season = name;
      cur.comp = null;
      renderAll();
      toast("已添加赛季 " + name + "，接着点「+ 添加赛事」");
    });

    addCompBtn.addEventListener("click", function () {
      if (!cur.season) { toast("请先添加赛季", true); return; }
      var name = (window.prompt("赛事名称（华科杯 / 新生杯 / 毕业杯）：") || "").trim();
      if (!name) return;
      var bucket = rootObj[cur.season];
      if (bucket[name]) { toast("该赛事已存在，已为你切换过去", true); cur.comp = name; renderAll(); return; }
      bucket[name] = /华科杯/.test(name) ? { men: [], women: [] } : { men: [] };
      cur.comp = name;
      renderAll();
      toast("已添加赛事 " + name + "（" + cur.season + "）");
    });

    renderAll();
  }

  /* ---------- 历史成绩编辑器：season + 键/值 ---------- */
  function editAchievements(panel, C) {
    C.achievements = C.achievements || {};
    panel.appendChild(el("p", { class: "a-hint" },
      "按赛季填写各赛事最终成绩。华科杯分男足/女足，键名请写「华科杯|男足」「华科杯|女足」；其余赛事直接写赛事名（如 新生杯、毕业杯）。"));

    var addSeason = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "+ 添加赛季");
    addSeason.addEventListener("click", function () {
      var name = (window.prompt("赛季名称（如 2025-2026）：") || "").trim();
      if (!name) return;
      if (!C.achievements[name]) C.achievements[name] = {};
      renderAch();
    });
    panel.appendChild(addSeason);

    var box = el("div", { class: "a-nested" });
    panel.appendChild(box);

    function renderAch() {
      box.innerHTML = "";
      Object.keys(C.achievements).forEach(function (season) {
        if (!C.achievements[season] || typeof C.achievements[season] !== "object") return;
        var sec = el("section", { class: "a-nest-sec" });
        sec.appendChild(el("h3", { class: "a-section__title" }, esc(season)));
        var obj = C.achievements[season];

        var tblWrap = el("div", { class: "a-table-wrap" });
        var tbl = el("table", { class: "a-table" });
        var thead = el("thead");
        var htr = el("tr");
        htr.appendChild(el("th", null, "赛事键"));
        htr.appendChild(el("th", null, "成绩"));
        htr.appendChild(el("th", { class: "a-table__op" }, "操作"));
        thead.appendChild(htr);
        tbl.appendChild(thead);
        var tbody = el("tbody");
        tbl.appendChild(tbody);
        tblWrap.appendChild(tbl);
        sec.appendChild(tblWrap);

        function renderRows() {
          tbody.innerHTML = "";
          var keys = Object.keys(obj);
          if (!keys.length) {
            var tr0 = el("tr");
            var td0 = el("td", { class: "a-empty" }, "暂无成绩项");
            td0.setAttribute("colspan", "3");
            tr0.appendChild(td0);
            tbody.appendChild(tr0);
          }
          keys.forEach(function (key) {
            var tr = el("tr", { class: "a-tr" });
            tr.appendChild(el("td", null, esc(key)));
            tr.appendChild(el("td", null, esc(obj[key] == null || obj[key] === "" ? "—" : obj[key])));

            var op = el("td", { class: "a-table__op" });
            var bEdit = el("button", { class: "a-act a-act--edit", type: "button" }, "修改");
            var bDel = el("button", { class: "a-act a-act--del", type: "button" }, "删除");
            op.appendChild(bEdit);
            op.appendChild(bDel);
            tr.appendChild(op);
            tbody.appendChild(tr);

            var exp = el("tr", { class: "a-tr-exp" });
            var expTd = el("td", { class: "a-tr-exp__cell" });
            expTd.setAttribute("colspan", "3");
            exp.appendChild(expTd);
            exp.hidden = true;
            tbody.appendChild(exp);

            bEdit.addEventListener("click", function () {
              if (!exp.hidden) { exp.hidden = true; tr.classList.remove("is-open"); return; }
              expTd.innerHTML = "";
              var box2 = el("div", { class: "a-expand" });
              var grid = el("div", { class: "a-grid a-grid--row" });

              var kfw = el("label", { class: "a-field" });
              kfw.appendChild(el("span", null, "赛事键（华科杯用 华科杯|男足）"));
              var kinp = el("input", { class: "a-input", type: "text", value: key });
              kinp.addEventListener("change", function () {
                var nv = kinp.value.trim();
                if (!nv || nv === key) { kinp.value = key; return; }
                if (obj[nv] != null) { toast("该赛事键已存在", true); kinp.value = key; return; }
                var v = obj[key]; delete obj[key]; obj[nv] = v;
                renderRows();
              });
              kfw.appendChild(kinp);
              grid.appendChild(kfw);

              var vfw = el("label", { class: "a-field" });
              vfw.appendChild(el("span", null, "成绩"));
              var vinp = el("input", { class: "a-input", type: "text", value: obj[key] == null ? "" : obj[key] });
              vinp.addEventListener("input", function () { obj[key] = vinp.value; });
              vfw.appendChild(vinp);
              grid.appendChild(vfw);

              box2.appendChild(grid);
              expTd.appendChild(box2);
              exp.hidden = false;
              tr.classList.add("is-open");
            });

            bDel.addEventListener("click", function () {
              if (!window.confirm("确定删除「" + key + "」？点「保存修改」后才会写入仓库。")) return;
              delete obj[key];
              renderRows();
            });
          });
        }
        renderRows();

        var addBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ 添加成绩项");
        addBtn.addEventListener("click", function () {
          var def = "华科杯|男足", i = 1;
          while (obj[def] != null) { def = "新赛事" + i; i++; }
          obj[def] = "";
          renderRows();
        });
        sec.appendChild(addBtn);
        box.appendChild(sec);
      });
    }
    renderAch();
  }

  /* ---------- 导出 / 导入 / 退出 ---------- */
  function exportJson() {
    var blob = new Blob([JSON.stringify(S.content, null, 2)], { type: "application/json" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "content.json" });
    document.body.appendChild(a); a.click(); a.remove();
    toast("已导出 content.json（可手动提交到仓库）");
  }
  function importJson() { $("file-import").click(); }
  function onImportFile(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        S.content = JSON.parse(reader.result);
        buildEditor();
        toast("已导入，记得点「保存修改」提交到仓库");
      } catch (err) { toast("JSON 解析失败：" + err.message, true); }
    };
    reader.readAsText(file);
  }
  function exitEditor() {
    S.passcodeOk = false; S.content = null;
    $("screen-editor").hidden = true;
    $("screen-connect").hidden = false;
    $("f-token").value = S.token; /* 保留令牌，方便再进 */
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.toggle("toast--err", !!isErr);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 5000 : 2600);
  }

  /* ---------- 主题 ---------- */
  function initTheme() {
    var root = document.documentElement;
    var toggle = $("themeToggle");
    var saved = null;
    try { saved = localStorage.getItem("lsfc-theme"); } catch (e) {}
    if (!saved) saved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    apply(saved);
    if (toggle) toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem("lsfc-theme", next); } catch (e) {}
    });
    function apply(t) {
      root.setAttribute("data-theme", t);
      if (toggle) toggle.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
    }
  }

  /* ---------- 演示模式（?demo=1）：只读预览工作台布局，不连 GitHub ---------- */
  function initDemo() {
    fetch("assets/data/content.json", { cache: "no-store" }).then(function (r) {
      return r.json();
    }).then(function (data) {
      S.content = data;
      S.contentSha = null;
      buildEditor();
      $("editor-repo").textContent = "演示模式 · 只读";
      if ($("wbUserRepo")) $("wbUserRepo").textContent = "演示模式";
      if ($("wbUserBranch")) $("wbUserBranch").textContent = "只读预览";
      var sv = $("btn-save");
      if (sv) { sv.disabled = true; sv.textContent = "演示模式 · 不可保存"; }
      var ex = $("btn-export"); if (ex) ex.disabled = true;
      $("screen-connect").hidden = true;
      $("screen-passcode").hidden = true;
      $("screen-editor").hidden = false;
      toast("演示模式：仅预览布局与数据，不保存");
    }).catch(function (err) {
      toast("演示加载失败：" + err.message, true);
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    /* 恢复登录信息 */
    try {
      var t = localStorage.getItem(LS_TOKEN); if (t) { S.token = t; $("f-token").value = t; }
      var r = JSON.parse(localStorage.getItem(LS_REPO) || "null");
      if (r) { S.owner = r.owner || ""; S.repo = r.repo || ""; S.branch = r.branch || "main";
        $("f-owner").value = S.owner; $("f-repo").value = S.repo; $("f-branch").value = S.branch; }
    } catch (e) {}

    $("btn-connect").addEventListener("click", connect);
    $("btn-clear-token").addEventListener("click", function () {
      try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
      S.token = ""; $("f-token").value = "";
      if (window.confirm("已清除本机保存的令牌。\n\n如果这是一台公用电脑，建议再到 GitHub 上吊销这个令牌（Settings → Developer settings → Tokens）。\n\n是否现在打开令牌管理页？")) {
        window.open("https://github.com/settings/tokens", "_blank", "noopener");
      }
      toast("本机令牌已清除");
    });
    $("btn-detect").addEventListener("click", function () {
      var d = detectFromUrl();
      if (!d) { toast("当前不是 github.io 网址，请手动填写", true); return; }
      $("f-owner").value = d.owner; $("f-repo").value = d.repo; $("f-branch").value = d.branch;
      toast("已根据网址填充，请补全令牌");
    });
    $("btn-passcode").addEventListener("click", submitPasscode);
    $("btn-back-connect").addEventListener("click", function () {
      $("screen-passcode").hidden = true; $("screen-connect").hidden = false;
    });
    $("btn-save").addEventListener("click", save);
    $("btn-export").addEventListener("click", exportJson);
    $("btn-import").addEventListener("click", importJson);
    $("file-import").addEventListener("change", onImportFile);
    $("btn-exit").addEventListener("click", exitEditor);
    $("f-passcode").addEventListener("keydown", function (e) { if (e.key === "Enter") submitPasscode(); });

    initTheme();

    /* ?demo=1 → 只读预览布局（不连 GitHub） */
    if (/[?&]demo=1/.test(location.search)) { initDemo(); return; }

    /* 若已存凭据，尝试自动连接 */
    if (S.token && S.owner && S.repo) {
      toast("检测到已保存的登录信息，自动连接中…");
      connect();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
