/* HUST Life FC 网站 · 前台渲染 + 交互
   - 从 assets/data/content.json 读取内容并渲染（设计样式完全复用 styles.css）
   - 主题切换（localStorage + 系统偏好）
   - 滚动渐显（IntersectionObserver，尊重 prefers-reduced-motion）
   - 导航汉堡菜单 + 年份
*/
(function () {
  "use strict";

  var CREST = '<img class="hv__crest brand__logo" src="assets/images/logo-transparent.png" alt="HUST Life FC" width="64" height="72" />';
  var HOME = "生命科学与技术学院";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ml(s) { return esc(s).replace(/\n/g, "<br>"); }

  /* 荣誉奖杯 SVG：按赛事+组别形状 + 名次配色（金/银/铜） */
  function trophySvg(comp, group, rank, idx) {
    var gid = "trophyGrad-" + idx + "-" + (rank === "冠军" ? "g" : rank === "亚军" ? "s" : "b");
    var stops = {
      "冠军": ["#FFF1C9", "#E8B923", "#A9770E"],
      "亚军": ["#FFFFFF", "#D7DBE0", "#9CA2A8"],
      "季军": ["#F3D2B3", "#CD7F32", "#8A5523"]
    };
    var c = stops[rank] || stops["冠军"];
    var grad = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + c[0] + '"/>' +
      '<stop offset="55%" stop-color="' + c[1] + '"/>' +
      '<stop offset="100%" stop-color="' + c[2] + '"/></linearGradient></defs>';
    var fill = 'fill="url(#' + gid + ')"';
    var stroke = 'stroke="url(#' + gid + ')"';
    var body, handles = "";

    if (comp === "新生杯") {
      // V 形杯身 + 多层底座（杯口不加足球）
      body = '<path ' + fill + ' d="M13 12 C14 26 18 38 21 44 Q24 48 27 44 C30 38 34 26 35 12 Z"/>' +
             '<path ' + fill + ' d="M19 43 H29 L30 47 H18 Z"/>' +
             '<path ' + fill + ' d="M17 47 H31 L33 52 H15 Z"/>' +
             '<path ' + fill + ' d="M14 52 H34 L39 59 H9 Z"/>';
    } else if (comp === "毕业杯") {
      // 盾形奖章（中间圆环）
      body = '<path ' + fill + ' d="M24 5 L39 11 V30 C39 43 32 51 24 57 C16 51 9 43 9 30 V11 Z"/>' +
             '<circle cx="24" cy="29" r="7.5" fill="none" ' + stroke + ' stroke-width="2.6"/>';
    } else if (comp === "华科杯" && group === "女足") {
      // 华科杯女足：足总杯式奖杯（高身宽口 + 双耳 + 顶盖 + 红绶带）
      // 顶部盖钮
      body = '<path ' + fill + ' d="M22 2 H26 L25.5 5 H22.5 Z"/>' +
             '<circle cx="24" cy="1.8" r="1.3" ' + fill + '/>' +
             // 盖沿
             '<ellipse cx="24" cy="6" rx="7" ry="2" ' + fill + '/>' +
             // 杯颈（收窄）
             '<path ' + fill + ' d="M19 6 H29 L28 12 H20 Z"/>' +
             // 杯身上半（向外展开）
             '<path ' + fill + ' d="M18 12 H30 C31 14 32 17 32 20 C32 24 30 27 28 28 H20 C18 27 16 24 16 20 C16 17 17 14 18 12 Z"/>' +
             // 杯身下半（宽口碗）
             '<path ' + fill + ' d="M15 27 H33 C35 30 34 36 32 38 C30 40 27 41 24 41 C21 41 18 40 16 38 C14 36 13 30 15 27 Z"/>' +
             // 杯口内圈（高光）
             '<ellipse cx="24" cy="27.5" rx="8" ry="2.5" fill="none" ' + stroke + ' stroke-width=".9" opacity=".4"/>' +
             // 窄底座
             '<rect x="21" y="41" width="6" height="4" rx=".5" ' + fill + '/>' +
             // 多层阶梯底座
             '<path ' + fill + ' d="M17 45 H31 L32 49 H16 Z"/>' +
             '<path ' + fill + ' d="M15 49 H33 L35 55 H13 Z"/>';
      // 双耳（大弧形把手）
      handles = '<path ' + stroke + ' fill="none" stroke-width="3.5" d="M16 15 C5 15 3 32 14 35"/>' +
                '<path ' + stroke + ' fill="none" stroke-width="3.5" d="M32 15 C43 15 45 32 34 35"/>';
    } else {
      // 华科杯男足（默认）：双耳杯
      body = '<path ' + fill + ' d="M11 8 H37 V19 C37 29 31 34 24 34 C17 34 11 29 11 19 Z"/>' +
             '<rect ' + fill + ' x="22" y="34" width="4" height="13"/>' +
             '<path ' + fill + ' d="M14 47 H34 L39 58 H9 Z"/>';
      handles = '<path ' + stroke + ' fill="none" stroke-width="3.2" d="M11 11 C3 11 3 24 13 24"/>' +
                '<path ' + stroke + ' fill="none" stroke-width="3.2" d="M37 11 C45 11 45 24 35 24"/>';
    }
    return '<svg viewBox="0 0 48 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + grad + body + handles + '</svg>';
  }

  /* ---------- 渲染 ---------- */
  function render(data) {
    console.log("[HUST FC] app.js version: 20260714a");
    if (!data) return;
    GROUP_HISTORY = data.groupHistory || {};

    // 站点名 / 页脚
    setText("brandName", data.site && data.site.name);
    setText("brandAbbr", data.site && data.site.abbr);
    setText("footerBrandName", data.site && data.site.name);
    setText("footerBrandAbbr", data.site && data.site.abbr);

    if (data.hero) renderHero(data.hero, data.teams);
    if (data.stats) {
      /* 前两项（球队/赛事）保留静态数据，后三项（场次/胜/进球）由赛程自动计算 */
      var matchStats = (data.fixtures) ? calcMatchStats(data.fixtures) : [];
      var finalStats = data.stats.slice(0, 2).concat(matchStats);
      renderStats(finalStats);
    }
    if (data.news) renderNews(data.news);
    if (data.club) renderClub(data.club, data.story);
    if (data.teams && data.squad) renderSquad(data.squad, data.teams, data.squadSeasons);
    if (data.competitions) renderCompetitions(data.competitions);
    if (data.fixtures) renderFixtures(data.fixtures);
    if (data.footer) renderFooter(data.footer);
    /* 数据就绪后，按地址栏锚点自动打开分享的新闻详情 */
    syncNewsFromHash();
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el && val != null) el.textContent = val;
  }

  /* ===== Hero ===== */
  function renderHero(h, teams) {
    var facts = (h.facts || []).map(function (f) {
      return '<div class="fact"><dt>' + esc(f.label) + '</dt><dd>' + esc(f.value) + '</dd></div>';
    }).join("");

    var copy =
      (h.eyebrow ? '<p class="eyebrow hero__eyebrow reveal">' + esc(h.eyebrow) + '</p>' : '') +
      '<h1 class="display hero__title reveal">' + esc(h.titleA) + '<br>' +
        '<span class="accent">' + esc(h.titleB) + '</span>' +
        (h.titleC ? '<span class="outline">' + esc(h.titleC) + '</span>' : '') + '</h1>' +
      (h.lead ? '<p class="lead hero__lead reveal">' + ml(h.lead) + '</p>' : '') +
      '<dl class="hero__facts reveal">' + facts + '</dl>' +
      '<div class="hero__actions reveal">' +
        '<a class="btn btn--primary" href="#news">最新动态 <span class="arrow">→</span></a>' +
        '<a class="btn btn--ghost" href="#matches">查看比赛</a>' +
      '</div>';
    document.getElementById("heroCopy").innerHTML = copy;

    var teamsHtml = (teams || []).map(function (t) {
      return '<div><strong>' + esc(t.short) + '</strong>' + esc(t.group) + '</div>';
    }).join("");

    var visual =
      '<div class="hv__season">' +
        (function () {
          var n = h.season && h.season.num;
          var isText = n && /[A-Za-z]/.test(n);
          var inner = '';
          if (n) {
            if (isText) {
              var sp = n.indexOf(' ');
              inner = sp > 0 ? esc(n.slice(0, sp)) + '<br>' + esc(n.slice(sp + 1)) : esc(n);
            } else {
              inner = esc(n);
            }
          }
          return '<div class="num mono' + (isText ? ' num--text' : '') + '">' + inner + '</div>';
        })() +
        '<div class="lbl">' + esc(h.season && h.season.label) + '</div>' +
      '</div>' +
      '<div class="hv__bottom">' + (teamsHtml || '<div><strong>—</strong></div>') + '</div>';
    document.getElementById("heroVisual").innerHTML = visual;
  }

  /* ===== Stats Bar ===== */
  /* 从赛程数据自动计算总场次 / 胜场 / 进球（仅统计当前赛季的华科杯、新生杯、毕业杯） */
  function calcMatchStats(fixtures) {
    var official = (fixtures.recent || []).filter(function (m) {
      return ["华科杯", "新生杯", "毕业杯"].indexOf(m.comp) !== -1 && seasonOf(m) === "2025-2026";
    });
    var wins = 0, goals = 0;
    var HOME = "生命科学与技术学院";
    official.forEach(function (m) {
      if (m.result === "W") wins++;
      var g = 0;
      if (m.score.indexOf("(") !== -1) {
        // 点球格式 0(3–4)0 — 只取括号外的常规比分，点球不计入进球
        var reg = m.score.match(/^(\d+)\(/);
        if (reg) {
          var rh = parseInt(reg[1], 10) || 0, ra = 0;
          // 末尾的常规比分（如 0(3–4)0 中的末尾 0）
          var endMatch = m.score.match(/\)(\d+)$/);
          ra = endMatch ? (parseInt(endMatch[1], 10) || 0) : 0;
          g = (m.home === HOME) ? rh : ra;
        }
      } else {
        // 常规格式 4–3
        var parts = m.score.split("–");
        if (parts.length === 2) {
          var h = parseInt(parts[0], 10) || 0, a = parseInt(parts[1], 10) || 0;
          g = (m.home === HOME) ? h : a;
        }
      }
      goals += g;
    });
    return [
      { num: String(official.length), unit: "", label: "总场次" },
      { num: String(wins), unit: "胜", label: "Wins" },
      { num: String(goals), unit: "", label: "进球" }
    ];
  }

  function renderStats(stats) {
    var html = stats.map(function (s) {
      var unit = s.unit ? '<span class="unit">' + esc(s.unit) + '</span>' : "";
      return '<div class="stat reveal"><span class="stat__num mono">' + esc(s.num) + unit +
        '</span><span class="stat__lbl">' + esc(s.label) + '</span></div>';
    }).join("");
    document.getElementById("statsGrid").innerHTML = html;
  }

  /* ===== 新闻（#news） ===== */
  var NEWS_DATA = [];
  var NEWS_TAG_CLS = { "战报": "tag--comp", "公告": "tag--team", "荣誉": "tag--win", "动态": "" };

  function renderNews(news) {
    NEWS_DATA = news || [];
    var html = news.map(function (n, i) {
      var tag = n.tag || "动态";
      var tc = NEWS_TAG_CLS[tag] || "tag--team";
      var metaParts = [];
      if (n.team) metaParts.push(esc(n.team));
      if (n.comp) metaParts.push(esc(n.comp));
      var meta = metaParts.length ? ' <small class="match__tags">' + metaParts.join(" / ") + '</small>' : '';
      var hasDetail = !!(n.body || (n.images && n.images.length));
      var more = hasDetail ? '<span class="news-card__more">阅读全文 →</span>' : '';
      return '<article class="news-card reveal" data-idx="' + i + '" tabindex="0" role="button" aria-label="' + esc(n.title) + '">' +
        '<div class="news-card__header">' +
          '<span class="tag ' + tc + '">' + esc(tag) + '</span>' +
          '<time class="news-card__date mono">' + esc(n.date) + '</time>' +
        '</div>' +
        '<h3 class="news-card__title">' + esc(n.title) + meta + '</h3>' +
        '<p class="news-card__summary">' + esc(n.summary) + '</p>' +
        more +
      '</article>';
    }).join("");
    document.getElementById("newsList").innerHTML = html;
    /* 立即让新闻卡片可见（不依赖 IO 时序） */
    document.querySelectorAll("#newsList .reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ===== 新闻详情（点击卡片进入） ===== */
  function openNews(idx) {
    var n = NEWS_DATA[idx];
    if (!n) return;
    var detail = document.getElementById("newsDetail");
    if (!detail) return;
    var tag = n.tag || "动态";
    var tc = NEWS_TAG_CLS[tag] || "tag--team";

    var metaParts = [];
    if (n.team) metaParts.push(esc(n.team));
    if (n.comp) metaParts.push(esc(n.comp));
    var meta = metaParts.length
      ? '<div class="news-detail__meta">' + metaParts.map(function (m) {
          return '<span class="tag ' + tc + '">' + m + '</span>';
        }).join(" ") + '</div>'
      : '';

    var bodyHtml = n.body
      ? n.body.split(/\n{2,}/).map(function (p) {
          return '<p>' + esc(p).replace(/\n/g, "<br>") + '</p>';
        }).join("")
      : '<p>' + esc(n.summary) + '</p>';

    var videoHtml = n.video
      ? '<div class="news-detail__video"><video controls preload="metadata" src="' + esc(n.video) + '"></video></div>'
      : '';

    var imgs = (n.images && n.images.length)
      ? '<div class="news-detail__gallery">' + n.images.map(function (src) {
          return '<figure class="news-detail__figure"><img src="' + esc(src) + '" alt="' + esc(n.title) + '" loading="lazy"></figure>';
        }).join("") + '</div>'
      : '';

    detail.innerHTML =
      '<div class="news-detail__panel" role="dialog" aria-modal="true" aria-label="' + esc(n.title) + '">' +
        '<div class="news-detail__bar">' +
          '<button class="news-detail__close" type="button">← 返回新闻列表</button>' +
          '<button class="news-detail__copy" type="button">复制链接</button>' +
        '</div>' +
        '<div class="news-detail__header">' +
          '<span class="tag ' + tc + '">' + esc(tag) + '</span>' +
          '<time class="news-detail__date mono">' + esc(n.date) + '</time>' +
        '</div>' +
        '<h2 class="news-detail__title">' + esc(n.title) + '</h2>' +
        meta +
        videoHtml +
        '<div class="news-detail__body">' + bodyHtml + '</div>' +
        imgs +
      '</div>';

    detail.classList.add("is-open");
    detail.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    detail.querySelector(".news-detail__close").addEventListener("click", closeNews);
    var copyBtn = detail.querySelector(".news-detail__copy");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var url = location.href;
      var done = function () {
        copyBtn.textContent = "已复制";
        setTimeout(function () { copyBtn.textContent = "复制链接"; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
      } else { fallbackCopy(url, done); }
    });
    detail.scrollTop = 0;
    var panel = detail.querySelector(".news-detail__panel");
    if (panel) panel.scrollTop = 0;
  }

  function closeNews() {
    var detail = document.getElementById("newsDetail");
    if (!detail) return;
    detail.classList.remove("is-open");
    detail.setAttribute("aria-hidden", "true");
    detail.innerHTML = "";
    document.body.classList.remove("no-scroll");
    /* 关闭时清掉 #/news/ 锚点（replaceState 不触发 hashchange，避免回环） */
    if (location.hash && location.hash.indexOf("#/news/") === 0) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  /* ===== 新闻深链：#/news/<id> 直接打开详情 ===== */
  function newsIndexById(id) {
    for (var i = 0; i < NEWS_DATA.length; i++) {
      if (NEWS_DATA[i] && NEWS_DATA[i].id === id) return i;
    }
    return -1;
  }

  function syncNewsFromHash() {
    var h = location.hash || "";
    var m = h.match(/^#\/news\/(.+)$/);
    if (m) {
      var idx = newsIndexById(decodeURIComponent(m[1]));
      if (idx >= 0) { openNews(idx); return; }
    }
    /* 无匹配的新闻锚点 → 确保详情关闭 */
    var nd = document.getElementById("newsDetail");
    if (nd && nd.classList.contains("is-open")) closeNews();
  }

  function fallbackCopy(text, cb) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      if (cb) cb();
    } catch (e) { /* 复制失败静默 */ }
  }

  function openNewsByCard(card) {
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var n = NEWS_DATA[idx];
    if (n && n.id) { location.hash = "#/news/" + encodeURIComponent(n.id); }
    else { openNews(idx); }
  }

  /* ===== 俱乐部（#club） ===== */
  function renderClub(club, story) {
    // 简介
    var introEl = document.getElementById("clubIntro");
    if (introEl && club.intro) {
      introEl.innerHTML = '<div class="club__intro-text">' + ml(club.intro) + '</div>';
    }

    // 荣誉墙
    if (club.honors && club.honors.length) {
      var rankMap = { "冠军": "gold", "亚军": "silver", "季军": "bronze" };
      var honorsHtml = club.honors.map(function (h, i) {
        var rank = h.rank || "荣誉";
        var rc = rankMap[rank] || "gold";
        var text = (h.comp || "") + (h.group ? " " + h.group : "") + " · " + rank;
        return '<div class="honor reveal rank--' + rc + '">' +
          '<div class="honor__icon">' + trophySvg(h.comp, h.group, rank, i) + '</div>' +
          '<div class="honor__body">' +
            '<span class="honor__year mono">' + esc(h.year) + '</span>' +
            '<span class="honor__text">' + esc(text) + '</span>' +
          '</div>' +
        '</div>';
      }).join("");
      document.getElementById("honorsGrid").innerHTML = honorsHtml;
    } else {
      var hw = document.getElementById("honorsWall");
      if (hw) hw.hidden = true;
    }

    // 时间线
    if (club.timeline && club.timeline.length) {
      var tlHtml = club.timeline.map(function (t) {
        return '<div class="timeline__item reveal">' +
          '<span class="timeline__year mono">' + esc(t.year || t.event ? t.year : "") + '</span>' +
          '<div class="timeline__dot"></div>' +
          '<p class="timeline__text">' + esc(t.text || t.event || "") + '</p>' +
        '</div>';
      }).join("");
      document.getElementById("timelineList").innerHTML = tlHtml;
    } else {
      var tw = document.getElementById("timelineWrap");
      if (tw) tw.hidden = true;
    }

    // 价值观（从 story.values 取）
    if (story && story.values) {
      var values = story.values.map(function (v) {
        return '<div class="value reveal">' +
          '<span class="value__k mono">' + esc(v.k) + '</span>' +
          '<div><h3>' + esc(v.title) + '</h3><p>' + ml(v.text) + '</p></div>' +
        '</div>';
      }).join("");
      document.getElementById("clubValues").innerHTML =
        '<h3 style="margin-bottom:1.5rem;">我们的精神</h3>' + values;
    }
  }

  /* 卡片背面：人物图片，未上传则显示「暂无图片」 */
  function cardBack(obj) {
    var img = obj.img;
    var back = img
      ? '<img class="player__photo" src="' + esc(img) + '" alt="' + esc(obj.name || obj.role || "") + '" loading="lazy">'
      : '<div class="player__noimg">暂无图片</div>';
    return '<div class="player__face player__face--back">' + back + '</div>';
  }

  /* 教练 / 领队卡片：与球员完全相同的 .player 大卡片（深蓝 + 细弧线），可翻转 */
  function staffCard(s) {
    var role = s.role ? '<span class="player__role-top">' + esc(s.role) + '</span>' : "";
    var front = '<div class="player__face player__face--front">' +
      '<div class="player__visual">' +
        (role ? role : '') +
        '<div class="player__center">' +
          '<span class="player__name">' + esc(s.name) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
    return '<article class="player reveal" tabindex="0">' +
      '<div class="player__inner">' + front + cardBack(s) + '</div>' +
    '</article>';
  }

  /* ===== 阵容（#team）—— 按钮切换男足/女足 ===== */
  function renderSquad(squad, teams, seasonsIn) {
    var teamsArr = teams && teams.length ? teams : [{ id: "men", name: "阵容", short: "", group: "" }];

    /* 可用赛季：优先用数据里声明的 squadSeasons，否则从球员 season 字段汇总 */
    var present = {};
    for (var tk in squad) (squad[tk] || []).forEach(function (p) { if (p.season) present[p.season] = 1; });
    var seasons = (seasonsIn && seasonsIn.length) ? seasonsIn.slice() : Object.keys(present);
    seasons.sort(); seasons.reverse(); // 降序：最新赛季在最前面
    var currentSeason = seasons[0] || ""; // 默认：当前赛季（第一个/最新）

    /* 切换按钮栏 */
    var tabsEl = document.getElementById("squadTabs");
    if (tabsEl) {
      var btns = teamsArr.map(function (t, i) {
        return '<button class="squad__tab' + (i === 0 ? ' is-active' : '') + '" data-squad="' + esc(t.id) + '">' +
          esc(t.name || t.short) +
          '</button>';
      }).join("");

      tabsEl.innerHTML = '<div class="squad__tab-bar">' + btns + '</div>';
    }

    /* 赛季选择器 */
    var seasonSel = document.getElementById("squadSeason");
    if (seasonSel) {
        if (seasons.length) {
        seasonSel.innerHTML = seasons.map(function (s) {
            return '<option value="' + esc(s) + '">' + esc(s + '赛季') + '</option>';
          }).join("");
        seasonSel.value = currentSeason;
      } else {
        var wrap = seasonSel.closest(".squad__season-wrap");
        if (wrap) wrap.style.display = "none";
      }
    }

    /* 渲染所有面板（初始只显示第一个） */
    var gridEl = document.getElementById("squadGrid");
    if (!gridEl) return;

    /* 位置分类：守门员 / 后卫 / 中场 / 前锋 */
    var POS_GROUPS = [
      { key: "GK", label: "守门员" },
      { key: "DF", label: "后卫" },
      { key: "MF", label: "中场" },
      { key: "FW", label: "前锋" }
    ];
    function posKey(pos) {
      var k = (pos || "").split("·")[0].trim().toUpperCase();
      /* 细分位置映射到主分组，保证归类正确 */
      var MAP = { RB: "DF", LB: "DF", CB: "DF", RWB: "DF", LWB: "DF",
                  CDM: "MF", DM: "MF", CM: "MF", CAM: "MF", LM: "MF", RM: "MF",
                  ST: "FW", CF: "FW", LW: "FW", RW: "FW" };
      if (MAP[k]) return MAP[k];
      return POS_GROUPS.some(function (g) { return g.key === k; }) ? k : "FW";
    }

    function buildPanels(season) {
      var panelsHtml = teamsArr.map(function (t, i) {
        var all = (squad && squad[t.id]) || [];
        var players = season
          ? all.filter(function (p) {
              /* 支持逗号分隔的多赛季标签，也兼容单赛季精确匹配 */
              return !p.season || p.season === season || p.season.indexOf(season) >= 0;
            })
          : all;

        /* 按位置分组 */
        var grouped = {};
        POS_GROUPS.forEach(function (g) { grouped[g.key] = []; });
        players.forEach(function (p) { grouped[posKey(p.pos)].push(p); });

        var groupsHtml = POS_GROUPS.map(function (g) {
          var list = grouped[g.key];
          if (!list.length) return "";
          list.sort(function (a, b) {
            return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
          });
          var cards = list.map(function (p) {
            var cap = p.captain ? '<span class="player__cap">C</span>' : "";
            var front = '<div class="player__face player__face--front">' +
              '<div class="player__visual">' +
                '<span class="player__num">' + esc(p.num) + '</span>' +
                cap +
                '<div class="player__center"><span class="player__name">' + esc(p.name) + '</span></div>' +
              '</div>' +
              '<div class="player__info"><span class="player__pos">' + esc(p.pos) + '</span></div>' +
            '</div>';
            return '<article class="player reveal" tabindex="0">' +
              '<div class="player__inner">' + front + cardBack(p) + '</div>' +
            '</article>';
          }).join("");
          return '<div class="pos-group reveal">' +
            '<h4 class="pos-group__title"><span class="pos-group__dot"></span>' + esc(g.label) +
            '<small>' + list.length + ' 人</small></h4>' +
            '<div class="squad__grid-inner">' + cards + '</div>' +
          '</div>';
        }).join("");

        var teamStaff = (t.staff && t.staff.length) ? t.staff : [];
        var staffOrdered = teamStaff.slice().sort(function (a, b) {
          return (a.role === "领队" ? -1 : 0) - (b.role === "领队" ? -1 : 0);
        });
        var staffHtml = staffOrdered.length
          ? '<h4 class="squad__staff-title">球队官员</h4><div class="squad__staff">' + staffOrdered.map(staffCard).join("") + '</div>'
          : '';
        return '<div class="squad__panel' + (i === 0 ? '' : ' is-hidden') + '" data-panel="' + esc(t.id) + '">' +
          staffHtml + groupsHtml + '</div>';
      }).join("");

      gridEl.innerHTML = panelsHtml;

      /* 立即让所有新渲染的 reveal 元素可见（不依赖 IO 时序） */
      gridEl.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-in"); });

      /* 点击卡片翻转，显示人物图片（键盘 Enter/Space 亦可） */
      gridEl.querySelectorAll(".player").forEach(function (card) {
        card.addEventListener("click", function () {
          this.classList.toggle("is-flipped");
        });
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.classList.toggle("is-flipped");
          }
        });
      });
    }

    buildPanels(currentSeason);

    /* 点击切换 */
    if (tabsEl) {
      tabsEl.querySelectorAll(".squad__tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var target = this.getAttribute("data-squad");
          tabsEl.querySelectorAll(".squad__tab").forEach(function (b) { b.classList.remove("is-active"); });
          this.classList.add("is-active");
          showSquad(target);
        });
      });
    }

    /* 切换赛季 -> 重新渲染面板 */
    if (seasonSel && seasons.length) {
      seasonSel.addEventListener("change", function () {
        buildPanels(this.value);
        var active = tabsEl ? tabsEl.querySelector(".squad__tab.is-active") : null;
        showSquad(active ? active.getAttribute("data-squad") : teamsArr[0].id);
      });
    }
  }

  function showSquad(id) {
    var gridEl = document.getElementById("squadGrid");
    if (!gridEl) return;
    gridEl.querySelectorAll(".squad__panel").forEach(function (panel) {
      panel.classList.toggle("is-hidden", panel.getAttribute("data-panel") !== id);
    });
  }

  /* ===== 赛事筛选标签（可点击） ===== */
  function renderCompetitions(comps) {
    var el = document.getElementById("compsStrip");
    if (!el) return;
    var all = '<button class="comp comp--tab is-active" data-comp="" data-team="">全部</button>';
    var html = comps.map(function (c) {
      /* 有 teams 子项的（如华科杯）渲染为可展开按钮 */
      if (c.teams && c.teams.length) {
        return '<div class="comp comp--group">' +
          '<button class="comp comp--tab" data-comp="' + esc(c.name) + '" data-team="" aria-expanded="false">' +
            '<strong>' + esc(c.name) + '</strong>' +
            (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') +
            '<span class="comp__chev">▾</span></button>' +
          '<div class="comp__subs">' +
            c.teams.map(function (t) {
              return '<button class="comp comp--sub" data-comp="' + esc(c.name) + '" data-team="' + esc(t) + '">' + esc(t) + '</button>';
            }).join("") +
          '</div></div>';
      }
      return '<button class="comp comp--tab" data-comp="' + esc(c.name) + '" data-team="">' +
        '<strong>' + esc(c.name) + '</strong>' +
        (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') +
        '</button>';
    }).join("");
    el.innerHTML = all + html;

    el.querySelectorAll(".comp--tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var isGroup = this.closest(".comp--group");
        if (isGroup && this.getAttribute("data-team") === "") {
          // 可展开的主按钮：切换子菜单显隐
          var expanded = this.getAttribute("aria-expanded") === "true";
          this.setAttribute("aria-expanded", String(!expanded));
          isGroup.classList.toggle("is-open");
          return;
        }
        // 普通按钮：激活并筛选
        el.querySelectorAll(".comp--tab, .comp--sub").forEach(function (b) { b.classList.remove("is-active"); });
        this.classList.add("is-active");
        MATCH_FILTER.comp = this.getAttribute("data-comp") || "";
        MATCH_FILTER.team = this.getAttribute("data-team") || "";
        applyMatchFilter();
      });
    });

    /* 子选项点击 */
    el.querySelectorAll(".comp--sub").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(".comp--tab, .comp--sub").forEach(function (b) { b.classList.remove("is-active"); });
        this.classList.add("is-active");
        MATCH_FILTER.comp = this.getAttribute("data-comp") || "";
        MATCH_FILTER.team = this.getAttribute("data-team") || "";
        applyMatchFilter();
      });
    });
  }

  /* ===== 比赛行 ===== */
  var COMP_CLS = { "华科杯": "comp--hust", "新生杯": "comp--freshman", "毕业杯": "comp--graduation", "友谊赛": "comp--friendly" };
  var TEAM_CLS = { "男足": "team--men", "女足": "team--women" };

  /* 进球 / 红黄牌 明细：仅有数据时渲染，合并到对阵信息同一行 */
  function hasEvents(m) {
    return ((m.goals && m.goals.length) || (m.cards && m.cards.length) || m.note) ? true : false;
  }
  function matchEvents(m) {
    var goals = m.goals || [];
    var cards = m.cards || [];
    var note = m.note || "";
    if (!goals.length && !cards.length && !note) return "";
    /* 取时间字符串中的分钟数用于排序（如 "33' (P)" → 33） */
    function minOf(t) {
      var n = parseInt(String(t).replace(/[^0-9]/g, ""), 10);
      return isNaN(n) ? 9999 : n;
    }
    var html = '<div class="match__events">';
    if (note) {
      html += '<div class="match__note">' + esc(note) + '</div>';
      if (!goals.length && !cards.length) { html += '</div>'; return html; }
    }
    /* 按球员分组 + 统一排序（进球和红黄牌混合按时间升序，早在上） */
    var gBest = {};
    goals.forEach(function (g) {
      var name = g.player || "未知";
      var min = minOf(g.time);
      if (!gBest[name]) gBest[name] = { min: min, times: [], type: "goal", og: false };
      gBest[name].times.push(g.time || "");
      if (g.og) gBest[name].og = true;
      if (min < gBest[name].min) gBest[name].min = min;
    });
    /* 合并成统一事件列表 */
    var allEvents = [];
    Object.keys(gBest).forEach(function (name) {
      allEvents.push({ name: name, min: gBest[name].min, times: gBest[name].times, type: "goal", og: gBest[name].og });
    });
    /* 每张牌单独显示（同一球员可能有多张，如两黄变一红） */
    cards.forEach(function (c) {
      var name = c.player || "未知";
      allEvents.push({ name: name, min: minOf(c.time), card: c, type: "card" });
    });
    allEvents.sort(function (a, b) { return a.min - b.min; });
    /* 每 3 条一行成一列，超出换右列（确定性，不依赖行高） */
    var PER_COL = 3;
    for (var ci = 0; ci < allEvents.length; ci += PER_COL) {
      var chunk = allEvents.slice(ci, ci + PER_COL);
      html += '<div class="match__col">';
      chunk.forEach(function (ev) {
        if (ev.type === "goal") {
          var times = ev.times.join(" ");
          html += '<div class="match__line match__goals">' +
            '<span class="ev__tag ev__tag--goal">⚽</span>' +
            '<span class="ev__item">' + esc(ev.name) +
            (times ? ' <span class="ev__time mono">' + esc(times) + (ev.og ? ' (OG)' : '') + '</span>' : '') + '</span></div>';
        } else {
          var isRed = ev.card.type === "R";
          var badge = '<span class="ev__card ' + (isRed ? 'ev__card--r' : 'ev__card--y') + '"></span>';
          html += '<div class="match__line match__cards">' +
            '<span class="ev__tag ev__tag--goal" style="position:relative;color:transparent;user-select:none">⚽<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">' + badge + '</span></span>' +
            '<span class="ev__item">' + esc(ev.name) +
            (ev.card.time ? ' <span class="ev__time mono">' + esc(ev.card.time) + (ev.card.note ? '（' + esc(ev.card.note) + '）' : '') + '</span>' : '') + '</span></div>';
        }
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function matchRow(m, isRecent) {
    var compCls = (m.comp && COMP_CLS[m.comp]) ? " " + COMP_CLS[m.comp] : "";
    var teamCls = (m.team && TEAM_CLS[m.team]) ? " " + TEAM_CLS[m.team] : "";
    /* 华科杯加组别标签：男足→乙组，女足→女子组；按赛季 groupHistory 覆盖 */
    var groupTag = "";
    if (m.comp === "华科杯" && m.team) {
      var grp = GROUP_HISTORY[seasonOf(m)] && GROUP_HISTORY[seasonOf(m)][m.comp] && GROUP_HISTORY[seasonOf(m)][m.comp][m.team];
      var groupLabel = grp || (m.team === "男足" ? "乙组" : "女子组");
      var groupCls = m.team === "男足" ? "team--men" : "team--women";
      groupTag = '<span class="tag tag--team ' + groupCls + '">' + esc(groupLabel) + '</span>';
    }
    var tags = '<span class="match__tags">' +
      (m.comp ? '<span class="tag tag--comp' + compCls + '">' + esc(m.comp) + '</span>' : '') +
      groupTag +
      (m.team ? '<span class="tag tag--team' + teamCls + '">' + esc(m.team) + '</span>' : '') +
      '</span>';
    if (isRecent) {
      var resMap = { "W": "胜", "D": "平", "L": "负" };
      var resCls = { "W": "res--W", "D": "res--D", "L": "res--L" };
      return '<div class="match">' + tags +
        '<span class="match__date mono">' + esc((m.year ? m.year + '.' : '') + m.date) + '</span>' +
        '<span class="match__teams">' +
          '<span class="match__vs">' + (m.home === HOME ? '<b>' + esc(m.home) + '</b>' : esc(m.home)) + ' vs ' + (m.away === HOME ? '<b>' + esc(m.away) + '</b>' : esc(m.away)) + '</span>' +
          '<span class="match__info">' + esc(m.round) + (m.venue ? ' · ' + esc(m.venue) : '') + (m.format ? ' · ' + esc(m.format) : '') + (m.video ? ' · <a class="match__video" href="' + esc(m.video) + '" target="_blank" rel="noopener" title="观看全场视频">视频</a>' : '') + '</span>' +
          (hasEvents(m) ? matchEvents(m) : '') +
        '</span>' +
        '<span class="match__score mono ' + (resCls[m.result] || "") + '">' + esc(m.score) +
          '<span class="res ' + (resCls[m.result] || "") + '">' + (resMap[m.result] || esc(m.result)) + '</span></span>' +
      '</div>';
    }
    return '<div class="match">' + tags +
      '<span class="match__date mono">' + esc((m.year ? m.year + '.' : '') + m.date) + '</span>' +
      '<span class="match__teams">' +
        '<span class="match__vs">' + (m.home === HOME ? '<b>' + esc(m.home) + '</b>' : esc(m.home)) + ' vs ' + (m.away === HOME ? '<b>' + esc(m.away) + '</b>' : esc(m.away)) + '</span>' +
        '<span class="match__info">' + esc(m.round) + (m.format ? ' · ' + esc(m.format) : '') + '</span>' +
          (hasEvents(m) ? matchEvents(m) : '') +
      '</span>' +
      '<span class="match__meta mono">' + esc(m.time) + '<br>' + esc(m.venue) + '</span>' +
    '</div>';
  }

  /* ===== 比赛（#matches）—— 支持赛事 + 年份筛选 + 分页 ===== */
  var MATCH_DATA = { recent: [], upcoming: [] };
  var GROUP_HISTORY = {};
  var MATCH_FILTER = { comp: "", season: "", team: "" };
  var MATCH_PAGE = 1;
  var MATCH_PAGE_SIZE = 10;

  /* 按时间倒序：年份大的在前，同年按 MM.DD 降序 */
  function sortMatches(a, b) {
    var ya = parseInt(a.year, 10) || 0, yb = parseInt(b.year, 10) || 0;
    if (ya !== yb) return yb - ya;
    return (b.date || "").localeCompare(a.date || "");
  }

  /* 赛季 = 学年制：当年 9.1 ~ 次年 8.31 为「YYYY-(YYYY+1) 赛季」。
     由完整日期（year + MM.DD）推断，9 月及以后归属当年起的学年。 */
  function seasonOf(m) {
    var y = parseInt(m.year, 10);
    if (!y) return "";
    var mo = parseInt((m.date || "").split(".")[0], 10) || 1;
    return mo >= 9 ? (y + "-" + (y + 1)) : ((y - 1) + "-" + y);
  }

  function renderFixtures(f) {
    MATCH_DATA.recent = (f.recent || []).slice().sort(sortMatches);
    MATCH_DATA.upcoming = f.upcoming || [];
    MATCH_PAGE = 1;

    /* 赛季下拉：由每场比赛完整日期推断学年赛季，降序 */
    var seasons = {};
    MATCH_DATA.recent.concat(MATCH_DATA.upcoming).forEach(function (m) { var s = seasonOf(m); if (s) seasons[s] = true; });
    var seasonList = Object.keys(seasons).sort().reverse();
    var sel = document.getElementById("matchYear");
    if (sel) {
      sel.innerHTML = '<option value="">全部赛季</option>' +
        seasonList.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s + '赛季') + '</option>'; }).join("");
      sel.onchange = function () {
        MATCH_FILTER.season = this.value;
        MATCH_PAGE = 1;
        applyMatchFilter();
      };
    }
    applyMatchFilter();
  }

  function applyMatchFilter() {
    var comp = MATCH_FILTER.comp, season = MATCH_FILTER.season, team = MATCH_FILTER.team;
    function pass(m) {
      if (comp && m.comp !== comp) return false;
      if (season && seasonOf(m) !== season) return false;
      if (team && m.team !== team) return false;
      return true;
    }
    var recentAll = MATCH_DATA.recent.filter(pass);
    var upcoming = MATCH_DATA.upcoming.filter(pass);

    /* 分页：每页 MATCH_PAGE_SIZE 条 */
    var totalPages = Math.max(1, Math.ceil(recentAll.length / MATCH_PAGE_SIZE));
    if (MATCH_PAGE > totalPages) MATCH_PAGE = totalPages;
    var start = (MATCH_PAGE - 1) * MATCH_PAGE_SIZE;
    var recent = recentAll.slice(start, start + MATCH_PAGE_SIZE);

    document.getElementById("fixRecent").innerHTML = recent.length
      ? recent.map(function (m) { return matchRow(m, true); }).join("")
      : '<p class="match__empty">该筛选条件下暂无战报。</p>';

    /* 分页控件 */
    var pager = document.getElementById("fixRecentPager");
    if (pager) {
      if (recentAll.length > MATCH_PAGE_SIZE) {
        pager.innerHTML =
          '<div class="match__pager">' +
            '<button class="match__pager-btn" data-page="' + (MATCH_PAGE - 1) + '"' + (MATCH_PAGE <= 1 ? ' disabled' : '') + '>上一页</button>' +
            '<span class="match__pager-info">第 ' + MATCH_PAGE + ' / ' + totalPages + ' 页</span>' +
            '<button class="match__pager-btn" data-page="' + (MATCH_PAGE + 1) + '"' + (MATCH_PAGE >= totalPages ? ' disabled' : '') + '>下一页</button>' +
          '</div>';
        pager.querySelectorAll(".match__pager-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var p = parseInt(this.getAttribute("data-page"), 10);
            if (p >= 1 && p <= totalPages) { MATCH_PAGE = p; applyMatchFilter(); }
          });
        });
      } else {
        pager.innerHTML = "";
      }
    }

    document.getElementById("fixUpcoming").innerHTML = upcoming.length
      ? upcoming.map(function (m) { return matchRow(m, false); }).join("")
      : '<p class="match__empty">该筛选条件下暂无赛程。</p>';
  }

  /* ===== 队长引语（保留在比赛之后） ===== */
  function renderStoryQuote(s) {
    var html =
      '<div class="reveal">' +
        '<blockquote class="story__quote">' + ml(s.quote) +
          '<cite>' + esc(s.cite) + '</cite></blockquote>' +
      '</div>';
    document.getElementById("storyGrid").innerHTML = html;
  }

  /* ===== 页脚 / 联系我们 ===== */
  function renderFooter(ft) {
    if (ft.intro) document.getElementById("footerIntro").textContent = ft.intro;
    if (ft.copyright) document.getElementById("footerCopyright").textContent = ft.copyright;
    if (ft.links) document.getElementById("footerLinks").innerHTML =
      ft.links.map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>'; }).join("");
    if (ft.social && document.getElementById("footerSocial")) document.getElementById("footerSocial").innerHTML =
      ft.social.map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>'; }).join("");
    if (ft.contact) {
      var wrap = document.getElementById("footerContactWrap");
      if (wrap) wrap.innerHTML =
        ft.contact.map(function (c) {
          var val = esc(c.value).replace(/\n/g, '<br>&nbsp;&nbsp;');
          return '<p><strong>' + esc(c.label) + '：</strong>' + val + '</p>';
        }).join("");
    }
  }

  /* ---------- 主题 ---------- */
  function initTheme() {
    var root = document.documentElement;
    var toggle = document.getElementById("themeToggle");
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

  /* ---------- 滚动渐显 ---------- */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 导航描边 + 汉堡菜单 + 年份 ---------- */
  function initChrome() {
    var nav = document.getElementById("nav");
    if (nav) {
      var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    // 回到顶部按钮：滚动超过一屏高度时显示，点击平滑回到 #top
    var toTop = document.getElementById("toTop");
    if (toTop) {
      var onScrollTop = function () {
        toTop.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
      };
      onScrollTop();
      window.addEventListener("scroll", onScrollTop, { passive: true });
      toTop.addEventListener("click", function () {
        var target = document.getElementById("top");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // 汉堡菜单
    var burger = document.getElementById("navBurger");
    var dropdown = document.getElementById("navDropdown");
    if (burger && dropdown) {
      burger.addEventListener("click", function () {
        var open = dropdown.hidden;
        dropdown.hidden = !open;
        burger.setAttribute("aria-expanded", String(open));
      });
      // 点击链接后关闭
      dropdown.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          dropdown.hidden = true;
          burger.setAttribute("aria-expanded", "false");
        });
      });
    }

    // 新闻卡片：点击 / 回车进入详情（通过设置 #/news/<id> 锚点，统一走深链）
    var newsList = document.getElementById("newsList");
    if (newsList) {
      newsList.addEventListener("click", function (e) {
        var card = e.target.closest(".news-card");
        if (card) openNewsByCard(card);
      });
      newsList.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          var card = e.target.closest(".news-card");
          if (card) { e.preventDefault(); openNewsByCard(card); }
        }
      });
    }
    // 监听锚点变化，支持浏览器前进/后退与分享链接直达
    window.addEventListener("hashchange", syncNewsFromHash);
    // 点击遮罩 / 按 Esc 关闭详情
    var newsDetail = document.getElementById("newsDetail");
    if (newsDetail) {
      newsDetail.addEventListener("click", function (e) {
        if (e.target === newsDetail) closeNews();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var nd = document.getElementById("newsDetail");
        if (nd && nd.classList.contains("is-open")) closeNews();
      }
    });
  }

  /* ---------- 点击放大（队徽 + 新闻图片，支持上一张/下一张，事件委托） ---------- */
  function initLightbox() {
    var list = [];      // 当前图集 [{src, alt}]
    var idx = 0;        // 当前索引
    var overlay = null; // 当前遮罩

    function render() {
      if (!overlay || !list.length) return;
      var item = list[idx];
      var img = overlay.querySelector("img");
      img.src = item.src;
      img.alt = item.alt || "";
      var counter = overlay.querySelector(".ll-counter");
      if (counter) counter.textContent = (list.length > 1) ? (idx + 1) + " / " + list.length : "";
      var nav = overlay.querySelector(".ll-nav");
      if (nav) nav.style.display = (list.length > 1) ? "flex" : "none";
    }

    function close() {
      if (overlay && overlay.parentNode) document.body.removeChild(overlay);
      document.body.classList.remove("no-scroll");
      overlay = null; list = []; idx = 0;
    }

    function open(items, start) {
      list = items; idx = start || 0;
      overlay = document.createElement("div");
      overlay.className = "logo-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "图片放大查看");
      overlay.innerHTML =
        '<button class="ll-close" type="button" aria-label="关闭">×</button>' +
        '<button class="ll-nav ll-prev" type="button" aria-label="上一张">‹</button>' +
        '<img src="" alt="" loading="eager" />' +
        '<button class="ll-nav ll-next" type="button" aria-label="下一张">›</button>' +
        '<span class="ll-counter"></span>';
      /* 点击背景或图片关闭；按钮已 stopPropagation，不会触发关闭 */
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay || e.target.tagName === "IMG") close();
      });
      overlay.querySelector(".ll-close").addEventListener("click", function (e) { e.stopPropagation(); close(); });
      overlay.querySelector(".ll-prev").addEventListener("click", function (e) {
        e.stopPropagation();
        idx = (idx - 1 + list.length) % list.length;
        render();
      });
      overlay.querySelector(".ll-next").addEventListener("click", function (e) {
        e.stopPropagation();
        idx = (idx + 1) % list.length;
        render();
      });
      document.body.appendChild(overlay);
      document.body.classList.add("no-scroll");
      render();
    }

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.matches) return;
      if (t.matches(".brand__logo")) {
        e.preventDefault(); e.stopPropagation();
        open([{ src: t.getAttribute("src"), alt: t.getAttribute("alt") || "" }], 0);
      } else if (t.matches(".news-detail__figure img")) {
        e.preventDefault(); e.stopPropagation();
        var gallery = t.closest(".news-detail__gallery");
        var items = [], start = 0;
        if (gallery) {
          gallery.querySelectorAll("img").forEach(function (im, i) {
            items.push({ src: im.getAttribute("src"), alt: im.getAttribute("alt") || "" });
            if (im === t) start = i;
          });
        } else {
          items = [{ src: t.getAttribute("src"), alt: t.getAttribute("alt") || "" }];
        }
        open(items, start);
      }
    });

    /* ESC 关闭；左右方向键切换 */
    document.addEventListener("keydown", function (e) {
      if (!overlay) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && list.length > 1) { idx = (idx - 1 + list.length) % list.length; render(); }
      else if (e.key === "ArrowRight" && list.length > 1) { idx = (idx + 1) % list.length; render(); }
    });
  }

  /* ---------- 启动 ---------- */
  initReveal();

  var TIMEOUT_MS = 8000;
  Promise.race([
    fetch("assets/data/content.json", { cache: "no-store" }),
    new Promise(function (_, reject) { setTimeout(function () { reject("timeout"); }, TIMEOUT_MS); })
  ])
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      render(data);
      initReveal();
      /* 安全兜底：1.5s 后强制所有 .reveal 可见（防止 IO 未触发） */
      setTimeout(function () {
        document.querySelectorAll(".reveal:not(.is-in)").forEach(function (el) { el.classList.add("is-in"); });
      }, 1500);
    })
    .catch(function (err) {
      console.warn("内容加载失败（页面仍可浏览）：", err);
      var c = document.getElementById("heroCopy");
      if (c && !c.innerHTML.trim()) {
        c.innerHTML = '<p class="lead">内容暂时无法加载，请稍后刷新重试。</p>';
      }
    });

  initTheme();
  initChrome();
  initLightbox();
})();
