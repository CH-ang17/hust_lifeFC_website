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
    } else if (comp === "华科杯" && group === "女子组") {
      // 华科杯女子组：足总杯式奖杯（高身宽口 + 双耳 + 顶盖 + 红绶带）
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
      // 华科杯乙组（默认）：双耳杯
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
    console.log("[HUST FC] app.js version: 20260712c");
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
    if (data.teams && data.squad) renderSquad(data.squad, data.teams, data.squadSeasons);
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

    var imgs = (n.images && n.images.length)
      ? '<div class="news-detail__gallery">' + n.images.map(function (src) {
          return '<figure class="news-detail__figure"><img src="' + esc(src) + '" alt="' + esc(n.title) + '" loading="lazy"></figure>';
        }).join("") + '</div>'
      : '';

    detail.innerHTML =
      '<div class="news-detail__panel" role="dialog" aria-modal="true" aria-label="' + esc(n.title) + '">' +
        '<button class="news-detail__close" type="button">← 返回新闻列表</button>' +
        '<div class="news-detail__header">' +
          '<span class="tag ' + tc + '">' + esc(tag) + '</span>' +
          '<time class="news-detail__date mono">' + esc(n.date) + '</time>' +
        '</div>' +
        '<h2 class="news-detail__title">' + esc(n.title) + '</h2>' +
        meta +
        '<div class="news-detail__body">' + bodyHtml + '</div>' +
        imgs +
      '</div>';

    detail.classList.add("is-open");
    detail.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    detail.querySelector(".news-detail__close").addEventListener("click", closeNews);
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
  var MATCH_FILTER = { comp: "", year: "", team: "" };

  function renderFixtures(f) {
    MATCH_DATA.recent = f.recent || [];
    MATCH_DATA.upcoming = f.upcoming || [];

    /* 年份下拉：从数据中提取可用年份，降序 */
    var years = {};
    MATCH_DATA.recent.concat(MATCH_DATA.upcoming).forEach(function (m) { if (m.year) years[m.year] = true; });
    var yearList = Object.keys(years).sort().reverse();
    var sel = document.getElementById("matchYear");
    if (sel) {
      sel.innerHTML = '<option value="">全部赛季</option>' +
        yearList.map(function (y) { var s = String(y); return '<option value="' + esc(y) + '">' + esc((parseInt(s)-1) + '-' + s + '赛季') + '</option>'; }).join("");
      sel.onchange = function () {
        MATCH_FILTER.year = this.value;
        applyMatchFilter();
      };
    }
    applyMatchFilter();
  }

  function applyMatchFilter() {
    var comp = MATCH_FILTER.comp, year = MATCH_FILTER.year, team = MATCH_FILTER.team;
    function pass(m) {
      if (comp && m.comp !== comp) return false;
      if (year && m.year !== year) return false;
      if (team && m.team !== team) return false;
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
      ft.contact.map(function (c) {
        var val = esc(c.value).replace(/\n/g, '<br>&nbsp;&nbsp;');
        return '<p><strong>' + esc(c.label) + '</strong> ' + val + '</p>';
      }).join("");
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

    // 新闻卡片：点击 / 回车进入详情
    var newsList = document.getElementById("newsList");
    if (newsList) {
      newsList.addEventListener("click", function (e) {
        var card = e.target.closest(".news-card");
        if (card) openNews(parseInt(card.getAttribute("data-idx"), 10));
      });
      newsList.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          var card = e.target.closest(".news-card");
          if (card) { e.preventDefault(); openNews(parseInt(card.getAttribute("data-idx"), 10)); }
        }
      });
    }
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
