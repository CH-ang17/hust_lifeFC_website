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
          data.setup ? "输入站点口令以进入编辑器。" : "首次使用，请设置一个站点口令（之后每次进入都需输入）。");
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
    C.staff = C.staff || [];
    C.squad = C.squad || {}; C.squad.men = C.squad.men || []; C.squad.women = C.squad.women || [];
    C.fixtures = C.fixtures || {}; C.fixtures.recent = C.fixtures.recent || []; C.fixtures.upcoming = C.fixtures.upcoming || [];
    C.story = C.story || {}; C.story.values = C.story.values || [];
    C.footer = C.footer || {}; C.footer.links = C.footer.links || []; C.footer.social = C.footer.social || []; C.footer.contact = C.footer.contact || [];

    /* Tab 栏 + 面板 */
    var TABS = [
      { id: "basics", label: "基础信息" },
      { id: "news",   label: "新闻" },
      { id: "club",   label: "俱乐部" },
      { id: "staff",  label: "教练·领队" },
      { id: "men",    label: "男足阵容" },
      { id: "women",  label: "女足阵容" },
      { id: "fix",    label: "赛程 · 战报" },
      { id: "footer", label: "页脚 · 联系" }
    ];
    var tabbar = el("div", { class: "a-tabs", role: "tablist" });
    var panels = {};
    TABS.forEach(function (t, i) {
      var btn = el("button", { class: "a-tab" + (i === 0 ? " is-active" : ""), type: "button", role: "tab" });
      btn.textContent = t.label;
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.addEventListener("click", function () {
        tabbar.querySelectorAll(".a-tab").forEach(function (b) { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
        btn.classList.add("is-active"); btn.setAttribute("aria-selected", "true");
        Object.keys(panels).forEach(function (k) { panels[k].hidden = true; });
        panels[t.id].hidden = false;
      });
      tabbar.appendChild(btn);
      var panel = el("div", { class: "a-tab-panel" });
      if (i !== 0) panel.hidden = true;
      panels[t.id] = panel;
      root.appendChild(panel);
    });
    root.insertBefore(tabbar, root.firstChild);

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
    pb.appendChild(repeatable("球队分组（男足 / 女足）", C.teams, [
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
      { key: "team", label: "关联球队(可空)", type: "select", options: (C.teams || []).map(function(t){return{value:t.short,label:t.short};}).concat([{value:"",label:"无"}]) },
      { key: "comp", label: "关联赛事(可空)" }
    ], { label: "添加新闻" }));

    /* ===== 俱乐部 ===== */
    var pc = panels.club;
    pc.appendChild(section("简介", [textareaField(C.club, "intro", "俱乐部介绍（支持换行）")]));
    pc.appendChild(repeatable("荣誉墙", C.club.honors, [
      { key: "year", label: "年份" }, { key: "text", label: "荣誉描述" }
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

    /* ===== 教练·领队 ===== */
    panels.staff.append(repeatable("教练与领队", C.staff, [
      { key: "name", label: "姓名" }, { key: "role", label: "职务" },
      { key: "note", label: "简介", type: "textarea" },
      { key: "img", label: "头像图片", type: "image" }
    ], { label: "添加成员" }));

    /* ===== 男足阵容 ===== */
    panels.men.appendChild(repeatable("男子足球队阵容", C.squad.men, [
      { key: "num", label: "号码" }, { key: "name", label: "姓名" }, { key: "pos", label: "位置" },
      { key: "note", label: "简介", type: "textarea" }, { key: "captain", label: "队长", type: "checkbox" },
      { key: "img", label: "头像图片", type: "image" }
    ], { label: "添加男足球员" }));

    /* ===== 女足阵容 ===== */
    panels.women.appendChild(repeatable("女子足球队阵容", C.squad.women, [
      { key: "num", label: "号码" }, { key: "name", label: "姓名" }, { key: "pos", label: "位置" },
      { key: "note", label: "简介", type: "textarea" }, { key: "captain", label: "队长", type: "checkbox" },
      { key: "img", label: "头像图片", type: "image" }
    ], { label: "添加女足球员" }));

    /* ===== 赛程 · 战报（按赛事分组） ===== */
    var pf = panels.fix;
    var compNames = (C.competitions && C.competitions.length)
      ? C.competitions.map(function (c) { return c.name; })
      : ["新生杯", "华科杯", "毕业杯"];
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
        { key: "round", label: "轮次" }, { key: "team", label: "球队", type: "select", options: teamOptions, default: teamOptions[0].value }
      ], {
        label: "添加战报",
        filter: function (x) { return x.comp === comp; },
        defaults: { comp: comp }
      }));
      pf.appendChild(repeatable(comp + " · 接下来", C.fixtures.upcoming, [
        { key: "date", label: "日期" }, { key: "home", label: "主队" }, { key: "away", label: "客队" },
        { key: "time", label: "时间" }, { key: "venue", label: "主/客场" }, { key: "round", label: "轮次" },
        { key: "team", label: "球队", type: "select", options: teamOptions, default: teamOptions[0].value }
      ], {
        label: "添加赛程",
        filter: function (x) { return x.comp === comp; },
        defaults: { comp: comp }
      }));
    });

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

  /* 可重复列表（支持 select 下拉、按条件过滤 filter、新建默认 defaults） */
  function repeatable(title, arr, defs, opts) {
    opts = opts || {};
    var filterFn = opts.filter || function () { return true; };
    var defaults = opts.defaults || {};

    var s = el("section", { class: "a-section" });
    var head = el("div", { class: "a-section__head" });
    head.appendChild(el("h3", { class: "a-section__title" }, esc(title)));
    var addBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "+ " + esc(opts.label || "添加"));
    head.appendChild(addBtn);
    s.appendChild(head);

    var list = el("div", { class: "a-list" });
    s.appendChild(list);

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
    function renderRow(item) {
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
      var rm = el("button", { class: "a-row-remove", type: "button", title: "删除" }, "✕");
      rm.addEventListener("click", function () {
        var i = arr.indexOf(item);
        if (i > -1) arr.splice(i, 1);
        row.remove();
      });
      row.appendChild(rm);
      return row;
    }

    function refresh() {
      list.innerHTML = "";
      arr.filter(filterFn).forEach(function (item) { list.appendChild(renderRow(item)); });
    }
    refresh();
    addBtn.addEventListener("click", function () {
      var it = blankItem();
      arr.push(it);
      list.appendChild(renderRow(it));
    });

    return s;
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

    /* 若已存凭据，尝试自动连接 */
    if (S.token && S.owner && S.repo) {
      toast("检测到已保存的登录信息，自动连接中…");
      connect();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
