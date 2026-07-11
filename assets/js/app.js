/* HUST Life FC 网站 · 前台渲染 + 交互
   - 从 assets/data/content.json 读取内容并渲染（设计样式完全复用 styles.css）
   - 主题切换（localStorage + 系统偏好）
   - 滚动渐显（IntersectionObserver，尊重 prefers-reduced-motion）
   - 导航汉堡菜单 + 年份
*/
(function () {
  "use strict";

  var CREST = '<img class="hv__crest brand__logo" src="assets/images/logo-transparent.png" alt="HUST Life FC" width="64" height="72" />';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ml(s) { return esc(s).replace(/\n/g, "<br>"); }

  /* 人物剪影 SVG（无照片时的占位） */
  var SILHOUETTE = '<svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="60" cy="118" rx="36" ry="14" fill="rgba(0,0,0,.15)"/>' +
    '<path d="M60 8c-10 0-18 7-18 17 0 6 3 12 7 15l-2 9h26l-2-9c4-3 7-9 7-15 0-10-8-17-18-17z" fill="rgba(255,255,255,.20)"/>' +
    '<path d="M30 78c0-16 13-28 30-28s30 12 30 28v38H30V78z" fill="rgba(255,255,255,.16)"/>' +
    '</svg>';

  /* ---------- 渲染 ---------- */
  function render(data) {
    if (!data) return;

    // 站点名 / 页脚
    setText("brandName", data.site && data.site.name);
    setText("brandAbbr", data.site && data.site.abbr);
    setText("footerBrandName", data.site && data.site.name);
    setText("footerBrandAbbr", data.site && data.site.abbr);

    if (data.hero) renderHero(data.hero, data.teams);
    if (data.stats) renderStats(data.stats);
    if (data.news) renderNews(data.news);
    if (data.club) renderClub(data.club, data.story);
    if (data.teams && data.squad) renderSquad(data.squad, data.teams, data.staff);
    if (data.competitions) renderCompetitions(data.competitions);
    if (data.fixtures) renderFixtures(data.fixtures);
    if (data.footer) renderFooter(data.footer);
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
      '<p class="eyebrow hero__eyebrow reveal">' + esc(h.eyebrow) + '</p>' +
      '<h1 class="display hero__title reveal">' + esc(h.titleA) + '<br>' +
        '<span class="accent">' + esc(h.titleB) + '</span>' +
        '<span class="outline">' + esc(h.titleC) + '</span></h1>' +
      '<p class="lead hero__lead reveal">' + ml(h.lead) + '</p>' +
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
      '<div class="hv__top">' +
        '<span class="hv__tag">Season</span>' +
      '</div>' +
      '<div class="hv__season">' +
        '<div class="num mono">' + esc(h.season && h.season.num) + '</div>' +
        '<div class="lbl">' + esc(h.season && h.season.label) + '</div>' +
      '</div>' +
      '<div class="hv__bottom">' + (teamsHtml || '<div><strong>—</strong></div>') + '</div>';
    document.getElementById("heroVisual").innerHTML = visual;
  }

  /* ===== Stats Bar ===== */
  function renderStats(stats) {
    var html = stats.map(function (s) {
      var unit = s.unit ? '<span class="unit">' + esc(s.unit) + '</span>' : "";
      return '<div class="stat reveal"><span class="stat__num mono">' + esc(s.num) + unit +
        '</span><span class="stat__lbl">' + esc(s.label) + '</span></div>';
    }).join("");
    document.getElementById("statsGrid").innerHTML = html;
  }

  /* ===== 新闻（#news） ===== */
  function renderNews(news) {
    var tagCls = {
      "战报": "tag--comp",
      "公告": "tag--team",
      "荣誉": "tag--win",
      "动态": ""
    };
    var html = news.map(function (n) {
      var tag = n.tag || "动态";
      var tc = tagCls[tag] || "tag--team";
      var metaParts = [];
      if (n.team) metaParts.push(esc(n.team));
      if (n.comp) metaParts.push(esc(n.comp));
      var meta = metaParts.length ? ' <small class="match__tags">' + metaParts.join(" / ") + '</small>' : '';
      return '<article class="news-card reveal">' +
        '<div class="news-card__header">' +
          '<span class="tag ' + tc + '">' + esc(tag) + '</span>' +
          '<time class="news-card__date mono">' + esc(n.date) + '</time>' +
        '</div>' +
        '<h3 class="news-card__title"><a href="#matches">' + esc(n.title) + meta + '</a></h3>' +
        '<p class="news-card__summary">' + esc(n.summary) + '</p>' +
      '</article>';
    }).join("");
    document.getElementById("newsList").innerHTML = html;
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
      var honorsHtml = club.honors.map(function (h) {
        return '<div class="honor reveal">' +
          '<span class="honor__year mono">' + esc(h.year) + '</span>' +
          '<span class="honor__text">' + esc(h.text) + '</span>' +
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
        '<p class="eyebrow" style="margin-bottom:var(--space-8);">我们的精神</p>' + values;
    }
  }

  /* 教练 / 领队卡片：与球员完全相同的 .player 大卡片（深蓝 + 细弧线），不单独分区 */
  function staffCard(s) {
    var role = s.role ? '<span class="player__role-top">' + esc(s.role) + '</span>' : "";
    return '<article class="player reveal" tabindex="0">' +
      '<div class="player__visual">' +
        (role ? role : '') +
        '<div class="player__silhouette">' + SILHOUETTE + '</div>' +
        '<div class="player__center">' +
          '<span class="player__name">' + esc(s.name) + '</span>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ===== 阵容（#team）—— 按钮切换男足/女足 ===== */
  function renderSquad(squad, teams, staff) {
    var teamsArr = teams && teams.length ? teams : [{ id: "men", name: "阵容", short: "", group: "" }];

    /* 切换按钮栏 */
    var tabsEl = document.getElementById("squadTabs");
    if (tabsEl) {
      var btns = teamsArr.map(function (t, i) {
        return '<button class="squad__tab' + (i === 0 ? ' is-active' : '') + '" data-squad="' + esc(t.id) + '">' +
          esc(t.name || t.short) +
          '</button>';
      }).join("");
      tabsEl.innerHTML = '<div class="squad__tab-bar">' + btns + '</div>';

      /* 点击切换 */
      tabsEl.querySelectorAll(".squad__tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var target = this.getAttribute("data-squad");
          tabsEl.querySelectorAll(".squad__tab").forEach(function (b) { b.classList.remove("is-active"); });
          this.classList.add("is-active");
          showSquad(target);
        });
      });
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
      return POS_GROUPS.some(function (g) { return g.key === k; }) ? k : "FW";
    }

    var panelsHtml = teamsArr.map(function (t, i) {
      var players = (squad && squad[t.id]) || [];

      /* 按位置分组 */
      var grouped = {};
      POS_GROUPS.forEach(function (g) { grouped[g.key] = []; });
      players.forEach(function (p) { grouped[posKey(p.pos)].push(p); });

      var groupsHtml = POS_GROUPS.map(function (g) {
        var list = grouped[g.key];
        if (!list.length) return "";
        var cards = list.map(function (p) {
          var cap = p.captain ? '<span class="player__cap">C</span>' : "";
          return '<article class="player reveal" tabindex="0">' +
            '<div class="player__visual">' +
              '<div class="player__silhouette">' + SILHOUETTE + '</div>' +
              '<span class="player__num">' + esc(p.num) + '</span>' +
              cap +
              '<div class="player__center"><span class="player__name">' + esc(p.name) + '</span></div>' +
            '</div>' +
            '<div class="player__info"><span class="player__pos">' + esc(p.pos) + '</span></div>' +
          '</article>';
        }).join("");
        return '<div class="pos-group reveal">' +
          '<h4 class="pos-group__title"><span class="pos-group__dot"></span>' + esc(g.label) +
          '<small>' + list.length + ' 人</small></h4>' +
          '<div class="squad__grid-inner">' + cards + '</div>' +
        '</div>';
      }).join("");

      var staffHtml = (staff && staff.length)
        ? '<div class="squad__staff">' + staff.map(staffCard).join("") + '</div>'
        : '';
      return '<div class="squad__panel' + (i === 0 ? '' : ' is-hidden') + '" data-panel="' + esc(t.id) + '">' +
        staffHtml + groupsHtml + '</div>';
    }).join("");

    gridEl.innerHTML = panelsHtml;
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
    var all = '<button class="comp comp--tab is-active" data-comp="">全部</button>';
    var html = comps.map(function (c) {
      return '<button class="comp comp--tab" data-comp="' + esc(c.name) + '">' +
        '<strong>' + esc(c.name) + '</strong>' +
        (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') +
        '</button>';
    }).join("");
    el.innerHTML = all + html;

    el.querySelectorAll(".comp--tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(".comp--tab").forEach(function (b) { b.classList.remove("is-active"); });
        this.classList.add("is-active");
        MATCH_FILTER.comp = this.getAttribute("data-comp") || "";
        applyMatchFilter();
      });
    });
  }

  /* ===== 比赛行 ===== */
  function matchRow(m, isRecent) {
    var tags = '<span class="match__tags">' +
      (m.team ? '<span class="tag tag--team">' + esc(m.team) + '</span>' : '') +
      (m.comp ? '<span class="tag tag--comp">' + esc(m.comp) + '</span>' : '') +
      '</span>';
    if (isRecent) {
      var resMap = { "W": "胜", "D": "平", "L": "负" };
      var resCls = { "W": "res--W", "D": "res--D", "L": "res--L" };
      return '<div class="match">' + tags +
        '<span class="match__date mono">' + esc(m.date) + '</span>' +
        '<span class="match__teams"><b>' + esc(m.home) + ' ' + esc(m.score) + ' ' + esc(m.away) +
          '</b><span>' + esc(m.round) + '</span></span>' +
        '<span class="match__score mono">' + esc(m.score) +
          '<span class="res ' + (resCls[m.result] || "") + '">' + (resMap[m.result] || esc(m.result)) + '</span></span>' +
      '</div>';
    }
    return '<div class="match">' + tags +
      '<span class="match__date mono">' + esc(m.date) + '</span>' +
      '<span class="match__teams"><b>' + esc(m.home) + ' vs ' + esc(m.away) +
        '</b><span>' + esc(m.round) + '</span></span>' +
      '<span class="match__meta mono">' + esc(m.time) + '<br>' + esc(m.venue) + '</span>' +
    '</div>';
  }

  /* ===== 比赛（#matches）—— 支持赛事 + 年份筛选 ===== */
  var MATCH_DATA = { recent: [], upcoming: [] };
  var MATCH_FILTER = { comp: "", year: "" };

  function renderFixtures(f) {
    MATCH_DATA.recent = f.recent || [];
    MATCH_DATA.upcoming = f.upcoming || [];

    /* 年份下拉：从数据中提取可用年份，降序 */
    var years = {};
    MATCH_DATA.recent.concat(MATCH_DATA.upcoming).forEach(function (m) { if (m.year) years[m.year] = true; });
    var yearList = Object.keys(years).sort().reverse();
    var sel = document.getElementById("matchYear");
    if (sel) {
      sel.innerHTML = '<option value="">全部年份</option>' +
        yearList.map(function (y) { return '<option value="' + esc(y) + '">' + esc(y) + ' 赛季</option>'; }).join("");
      sel.onchange = function () {
        MATCH_FILTER.year = this.value;
        applyMatchFilter();
      };
    }
    applyMatchFilter();
  }

  function applyMatchFilter() {
    var comp = MATCH_FILTER.comp, year = MATCH_FILTER.year;
    function pass(m) {
      if (comp && m.comp !== comp) return false;
      if (year && m.year !== year) return false;
      return true;
    }
    var recent = MATCH_DATA.recent.filter(pass);
    var upcoming = MATCH_DATA.upcoming.filter(pass);
    document.getElementById("fixRecent").innerHTML = recent.length
      ? recent.map(function (m) { return matchRow(m, true); }).join("")
      : '<p class="match__empty">该筛选条件下暂无战报。</p>';
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
    if (ft.social) document.getElementById("footerSocial").innerHTML =
      ft.social.map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>'; }).join("");
    if (ft.contact) document.getElementById("footerContact").innerHTML =
      ft.contact.map(function (c) { return '<p><strong>' + esc(c.label) + '</strong> ' + esc(c.value) + '</p>'; }).join("");
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
})();
