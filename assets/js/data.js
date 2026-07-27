/* HUST Life FC · 数据页面 (data.html)
   从 content.json 读取赛程与阵容数据，按赛季聚合展示战绩与参赛人员。
*/
(function () {
  "use strict";

  var CREST = '<img class="brand__logo" src="assets/images/logo-transparent.png" alt="HUST Life FC" width="64" height="72" />';
  var HOME = "生命科学与技术学院";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 赛季推断（与 app.js 一致） ---------- */
  function seasonOf(m) {
    var y = parseInt(m.year, 10);
    if (!y) return "";
    var mo = parseInt((m.date || "").split(".")[0], 10) || 1;
    return mo >= 9 ? (y + "-" + (y + 1)) : ((y - 1) + "-" + y);
  }

  /* ---------- 统计计算 ---------- */
  function calcStats(matches) {
    var W = 0, D = 0, L = 0, GF = 0, GA = 0;
    matches.forEach(function (m) {
      if (m.result === "W") W++;
      else if (m.result === "D") D++;
      else if (m.result === "L") L++;

      /* 解析比分（awayFC 决定主客场，确保进球/失球归属生命学院） */
      var g = parseScore(m.score, m.away === HOME);
      GF += g.gf; GA += g.ga;
    });
    return { total: matches.length, wins: W, draws: D, losses: L, gf: GF, ga: GA };
  }

  function parseScore(score, awayFC) {
    var gf = 0, ga = 0;
    if (!score) return { gf: 0, ga: 0 };
    if (score.indexOf("(") !== -1) {
      /* 点球格式：如 0(3–4)0 — 只取括号外常规比分，点球不计入进球 */
      var rh = score.match(/^(\d+)\(/);
      var ra = score.match(/\)(\d+)$/);
      gf = rh ? parseInt(rh[1], 10) || 0 : 0;
      ga = ra ? parseInt(ra[1], 10) || 0 : 0;
      if (awayFC) { var _t = gf; gf = ga; ga = _t; }
    } else {
      var parts = score.split("–");
      if (parts.length === 2) {
        var h = parseInt(parts[0], 10) || 0;
        var a = parseInt(parts[1], 10) || 0;
        if (awayFC) { gf = a; ga = h; } else { gf = h; ga = a; }
      }
    }
    return { gf: gf, ga: ga };
  }

  /* ---------- 球员聚合：各赛事 进球 / 红黄牌 ---------- */
  var STAT_COMPS = ["新生杯", "华科杯", "毕业杯"];
  function aggregatePlayerStats(matches) {
    var map = {};
    function ensure(n) {
      if (!map[n]) {
        map[n] = { name: n, comps: {}, g: 0, y: 0, r: 0, pen: 0 };
        STAT_COMPS.forEach(function (c) { map[n].comps[c] = { g: 0, y: 0, r: 0, pen: 0 }; });
      }
      return map[n];
    }
    matches.forEach(function (m) {
      (m.goals || []).forEach(function (g) {
        if (g.og) return; /* 乌龙球不计入本方球员进球 */
        var p = ensure(g.player); p.g++;
        var isPen = /\(P\)/.test(g.time);
        if (isPen) { p.pen++; }
        if (p.comps[m.comp]) {
          p.comps[m.comp].g++;
          if (isPen) { p.comps[m.comp].pen++; }
        }
      });
      (m.cards || []).forEach(function (c) {
        var p = ensure(c.player);
        var t = c.type === "R" ? "r" : "y"; p[t]++;
        if (p.comps[m.comp]) p.comps[m.comp][t]++;
      });
    });
    return map;
  }

  /* ===== 射手榜（不计入对手乌龙） ===== */
  function fmtGoals(g, pen) { return (pen > 0) ? g + '(' + pen + ')' : String(g); }

  function renderScorers(map) {
    var el = document.getElementById("dataScorersGrid");
    if (!el) return;
    var players = Object.keys(map).map(function (n) { return map[n]; })
      .filter(function (p) { return p.name !== "乌龙" && p.g > 0; });
    players.sort(function (a, b) {
      return b.g - a.g || (b.y + b.r) - (a.y + a.r) || a.pen - b.pen || a.name.localeCompare(b.name);
    });
    if (!players.length) { el.innerHTML = '<p class="match__empty">该筛选条件下暂无进球记录。</p>'; return; }

    /* 并列排名：进球数相同的球员共享同一名次，下一不同进球数顺延 */
    var prevG = null, rank = 0;
    players.forEach(function (p, i) {
      if (p.g !== prevG) { rank = i + 1; prevG = p.g; }
      p.rank = rank;
    });

    /* 始终只显示前 10 名（含并列名次档） */
    var top10Ranks = [];
    players.slice(0, 10).forEach(function (p) { if (top10Ranks.indexOf(p.rank) < 0) top10Ranks.push(p.rank); });
    /* 取完整名次档：如果第 10 人与第 11+ 人并列则一并包含 */
    var lastRank = (players[Math.min(9, players.length - 1)] || {}).rank;
    if (lastRank) players = players.filter(function (p) { return p.rank <= lastRank; });

    /* 领奖台：取排名 ≤ 3 的名次档（并列跳号时避免第8名等挤入铜牌位），其余进列表 */
    var allRanks = [];
    players.forEach(function (p) { if (allRanks.indexOf(p.rank) < 0) allRanks.push(p.rank); });
    var topRanks = allRanks.filter(function (r) { return r <= 3; });
    var podium = {};
    var restList = [];
    players.forEach(function (p) {
      if (topRanks.indexOf(p.rank) >= 0) { (podium[p.rank] = podium[p.rank] || []).push(p); }
      else { restList.push(p); }
    });
    var topHtml = '<div class="scorer__top">';
    var medalClass = ['scorer__card--gold', 'scorer__card--silver', 'scorer__card--bronze'];
    topRanks.forEach(function (rk, idx) {
      var grp = podium[rk];
      if (!grp || !grp.length) return;
      var names = grp.map(function (p) {
        return '<span class="scorer__name">' + esc(p.name) + '</span>';
      }).join('<span class="scorer__sep"> / </span>');
      topHtml += '<div class="scorer__card ' + (medalClass[idx] || '') + '">' +
        '<span class="scorer__rank">' + rk + '</span>' +
        '<div class="scorer__names">' + names + '</div>' +
        '<span class="scorer__goals">' + fmtGoals(grp[0].g, grp[0].pen) + '</span>' +
        '<span class="scorer__unit">进球</span>' +
      '</div>';
    });
    topHtml += '</div>';
    var listHtml = restList.length ? '<ol class="scorer__list">' + restList.map(function (p) {
      return '<li><span class="scorer__pos">' + p.rank + '</span>' +
        '<span class="scorer__name">' + esc(p.name) + '</span>' +
        '<span class="scorer__goals">' + fmtGoals(p.g, p.pen) + '</span></li>';
    }).join("") + '</ol>' : '';
    el.innerHTML = topHtml + listHtml;
  }

  /* ===== 球员数据 · 进球（含排名列 + 分页） ===== */
  var PLAYER_PAGE_SIZE = 12;
  window.__playerPage = window.__playerPage || 1;

  function renderPlayerStats(map) {
    var el = document.getElementById("dataPlayerStatsGrid");
    if (!el) return;
    var rows = Object.keys(map).map(function (n) { return map[n]; })
      .filter(function (p) { return p.g > 0; });
    rows.sort(function (a, b) {
      return b.g - a.g || (b.y + b.r) - (a.y + a.r) || a.pen - b.pen || a.name.localeCompare(b.name);
    });
    if (!rows.length) { el.innerHTML = '<p class="match__empty">该筛选条件下暂无球员进球数据。</p>'; return; }

    /* 并列排名：进球数相同共享同一名次 */
    var prevG = null, rank = 0;
    rows.forEach(function (p, i) {
      if (p.g !== prevG) { rank = i + 1; prevG = p.g; }
      p._rank = rank;
    });

    /* 分页 */
    var totalPages = Math.ceil(rows.length / PLAYER_PAGE_SIZE);
    var page = Math.max(1, Math.min(window.__playerPage || 1, totalPages));
    window.__playerPage = page;
    var start = (page - 1) * PLAYER_PAGE_SIZE;
    var pageRows = rows.slice(start, start + PLAYER_PAGE_SIZE);

    var head = '<thead><tr><th>排名</th><th>球员</th>' +
      STAT_COMPS.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") +
      '<th>合计</th></tr></thead>';
    var body = pageRows.map(function (p) {
      var cells = STAT_COMPS.map(function (c) {
        var o = p.comps[c] || { g: 0, pen: 0 };
        return '<td class="mono">' + (o.g > 0 ? fmtGoals(o.g, o.pen) : "–") + '</td>';
      }).join("");
      var note = p.name === "乌龙" ? ' <span class="pstats__note">(对手)</span>' : '';
      return '<tr><td class="mono pstats__rank">' + p._rank + '</td><td class="pstats__name">' + esc(p.name) + note + '</td>' +
        cells + '<td class="mono pstats__total">' + fmtGoals(p.g, p.pen) + '</td></tr>';
    }).join("");

    /* 分页控件 */
    var pagHtml = '';
    if (totalPages > 1) {
      pagHtml = '<div class="table__pagination">' +
        '<button class="pag__btn' + (page <= 1 ? ' pag__btn--disabled' : '') + '" data-pg="' + (page - 1) + '">‹</button>' +
        '<span class="pag__info">' + page + ' / ' + totalPages + '</span>' +
        '<button class="pag__btn' + (page >= totalPages ? ' pag__btn--disabled' : '') + '" data-pg="' + (page + 1) + '">›</button></div>';
    }

    el.innerHTML = '<div class="comp-table-wrap"><table class="comp-table pstats-table">' +
      head + '<tbody>' + body + '</tbody></table></div>' + pagHtml;
    /* 翻页由 #dataPlayerStatsGrid 上的事件委托统一处理（见初始化处） */
  }

  /* ---------- 筛选状态（IIFE 顶层，供 render 与 applyFilters 共享） ---------- */
  var state = { season: "", comp: "all", team: "all" };

  /* ---------- 渲染 ---------- */
  function render(data) {
    console.log("[HUST FC] data.js loaded");
    if (!data) return;

    var fixtures = data.fixtures && data.fixtures.recent ? data.fixtures.recent.slice() : [];
    var squad = data.squad || {};
    var seasonsIn = data.squadSeasons || [];

    /* 按赛季分组比赛 */
    fixtures.sort(function (a, b) {
      var ya = parseInt(a.year, 10) || 0, yb = parseInt(b.year, 10) || 0;
      if (ya !== yb) return yb - ya;
      return (b.date || "").localeCompare(a.date || "");
    });

    var bySeason = {};
    fixtures.forEach(function (m) {
      var s = seasonOf(m); if (!s) return;
      if (!bySeason[s]) bySeason[s] = [];
      bySeason[s].push(m);
    });

    /* 可用赛季：合并 squadSeasons 和有比赛的赛季 */
    var allSeasons = {};
    seasonsIn.forEach(function (s) { allSeasons[s] = true; });
    Object.keys(bySeason).forEach(function (s) { allSeasons[s] = true; });
    var seasonList = Object.keys(allSeasons).sort().reverse();

    /* 默认显示全部 */
    var defaultSeason = "all";

    /* 各赛季各赛事最终成绩 */
    var achievements = data.achievements || {};
    /* 各赛季华科杯组别（甲组/乙组），未记录则按默认回退 */
    var groupHistory = data.groupHistory || {};

    /* 筛选状态：赛季 / 赛事 / 男女足（state 已在 IIFE 顶层声明） */
    state = { season: defaultSeason || "", comp: "all", team: "all", ach: achievements, groupHistory: groupHistory };

    buildFilters(seasonList, defaultSeason);
    if (defaultSeason) applyFilters(data, bySeason, squad);

    /* 一次性事件委托：处理赛事战绩表格 + 球员数据表格的分页点击 */
    (function () {
      var ccEl = document.getElementById("dataCompCards");
      var psEl = document.getElementById("dataPlayerStatsGrid");
      if (ccEl) ccEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".pag__btn:not(.pag__btn--disabled)");
        if (!btn) return;
        e.preventDefault();
        var pg = btn.getAttribute("data-pg");
        var p = parseInt(btn.getAttribute("data-page"), 10);
        if (!window.__tablePage) window.__tablePage = {};
        if (pg) { window.__tablePage[pg] = p; applyFilters(data, bySeason, squad); }
        else { window.__tablePage["__allTable__"] = p; applyFilters(data, bySeason, squad); }
      });
      if (psEl) psEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".pag__btn:not(.pag__btn--disabled)");
        if (!btn) return;
        e.preventDefault();
        var p = parseInt(btn.getAttribute("data-pg"), 10);
        if (p) { window.__playerPage = p; applyFilters(data, bySeason, squad); }
      });
    })();

    /* ---------- 构建筛选栏（赛季 / 赛事 / 男女足） ---------- */
    function buildFilters(seasons, def) {
      var f = document.getElementById("dataFilters");
      if (!f) return;
      var seasonSel = f.querySelector("#dataSeasonSelect");
      var compSel = f.querySelector("#dataCompSelect");
      var teamFilter = document.getElementById("dataTeamFilter"); /* 包含 label + select 的容器 */
      var teamSel = f.querySelector("#dataTeamSelect");

      /* 只有华科杯区分男女足，其他赛事隐藏男女足筛选 */
      function syncTeamFilter() {
        var show = (state.comp === "all" || state.comp === "华科杯");
        if (teamFilter) { teamFilter.style.display = show ? "" : "none"; }
        if (!show) { state.team = "all"; if (teamSel) teamSel.value = "all"; }
      }

      if (seasonSel) {
        seasonSel.innerHTML = '<option value="all"' + (def === "all" ? " selected" : "") + '>全部</option>' +
          seasons.map(function (s) {
            return '<option value="' + esc(s) + '"' + (s === def ? " selected" : "") + '>' + esc(s) + ' 赛季</option>';
          }).join("");
        seasonSel.addEventListener("change", function () { state.season = this.value; window.__playerPage = 1; applyFilters(data, bySeason, squad); });
      }
      if (compSel) {
        compSel.addEventListener("change", function () {
          state.comp = this.value;
          window.__playerPage = 1;
          syncTeamFilter();
          applyFilters(data, bySeason, squad);
        });
      }
      if (teamSel) {
        teamSel.addEventListener("change", function () { window.__playerPage = 1; state.team = this.value; applyFilters(data, bySeason, squad); });
      }

      /* 初始状态 */
      syncTeamFilter();
    }
  }

  /* ---------- 按当前筛选（赛季 / 赛事 / 男女足）渲染全部内容 ---------- */
  function applyFilters(data, bySeason, squad) {
    var seasonMatches;
    if (state.season === "all") {
      /* 全部赛季：合并所有赛季的比赛 */
      seasonMatches = [];
      Object.keys(bySeason).forEach(function (s) { seasonMatches = seasonMatches.concat(bySeason[s]); });
      /* 按日期排序（最新的在前） */
      seasonMatches.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    } else {
      seasonMatches = bySeason[state.season] || [];
    }
    /* 数据页只统计正式赛事（华科杯 / 新生杯 / 毕业杯），排除友谊赛 */
    var official = seasonMatches.filter(function (m) {
      return ["华科杯", "新生杯", "毕业杯"].indexOf(m.comp) !== -1;
    });

    var matches = official;
    /* 赛事筛选 */
    if (state.comp !== "all") matches = matches.filter(function (m) { return m.comp === state.comp; });
    /* 男女足筛选 */
    if (state.team !== "all") {
      var tn = state.team === "men" ? "男足" : "女足";
      matches = matches.filter(function (m) { return m.team === tn; });
    }

    /* 1. 统计概览 */
    renderStats(calcStats(matches));

    /* 2. 各赛事战绩卡片 */
    renderCompCards(matches, state.comp, (state.ach && state.ach[state.season]) || null, state);

    /* 2b. 射手榜 / 球员数据(各赛事进球) */
    var pstats = aggregatePlayerStats(matches);
    renderScorers(pstats);
    renderPlayerStats(pstats);

    /* 3. 参赛人员（仅单赛季+单赛事时显示，选"全部赛季"或"全部赛事"时隐藏） */
    var squadEl = document.getElementById("dataSquad");
    if (squadEl) { squadEl.style.display = (state.season === "all" || state.comp === "all") ? "none" : ""; }
    if (state.season !== "all" && state.comp !== "all") renderSquad(data.squadHistory, state.season, state.comp, state.team, data.teams, data.staffHistory);

    /* 触发 reveal */
    document.querySelectorAll("#dataStats .reveal,#dataCompetitions .reveal,#dataSquad .reveal,#dataScorers .reveal,#dataPlayerStats .reveal")
      .forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ===== 统计概览 ===== */
  function renderStats(st) {
    var el = document.getElementById("dataStatsGrid");
    if (!el) return;
    el.innerHTML =
      '<div class="stat"><span class="stat__num mono">' + st.total + '</span><span class="stat__lbl">总场次</span></div>' +
      '<div class="stat"><span class="stat__num mono" style="color:var(--win)">' + st.wins + '</span><span class="stat__lbl">胜</span></div>' +
      '<div class="stat"><span class="stat__num mono" style="color:var(--draw)">' + st.draws + '</span><span class="stat__lbl">平</span></div>' +
      '<div class="stat"><span class="stat__num mono" style="color:var(--loss)">' + st.losses + '</span><span class="stat__lbl">负</span></div>' +
      '<div class="stat"><span class="stat__num mono">' + st.gf + '</span><span class="stat__lbl">进球</span></div>' +
      '<div class="stat"><span class="stat__num mono">' + st.ga + '</span><span class="stat__lbl">失球</span></div>';
  }

  /* ===== 全部全部全部 → 合并总表（按时间降序）===== */
  var PAGE_SIZE = 12;
  function renderAllMatchesTable(matches, seasonAch) {
    var el = document.getElementById("dataCompCards");
    if (!el) return;

    var COMP_CLS = { "华科杯": "comp--hust", "新生杯": "comp--freshman", "毕业杯": "comp--graduation", "友谊赛": "comp--friendly" };
    var RES = { "W": "胜", "D": "平", "L": "负" };

    /* 按年.月日 降序（近期在上） */
    var sorted = matches.slice().sort(function (a, b) {
      var da = (a.year || "") + "." + (a.date || "");
      var db = (b.year || "") + "." + (b.date || "");
      return da < db ? 1 : da > db ? -1 : 0;
    });

    var st = calcStats(sorted);
    var head =
      '<div class="comp-group-head">' +
        '<span class="gh-ach">全部比赛</span>' +
        '<span class="gh-stats">' + st.total + '场 · ' + st.wins + '胜 ' + st.draws + '平 ' + st.losses + '负 · 进球 ' + st.gf + ':' + st.ga + ' 失球</span>' +
      '</div>';

    function buildTableRows(arr) {
      return arr.map(function (m) {
        var time = esc(m.year) + "." + esc(m.date);
        var vs = (m.home === HOME ? "<b>生命科学与技术学院</b>" : esc(m.home)) + " <b>vs</b> " + (m.away === HOME ? "<b>生命科学与技术学院</b>" : esc(m.away));
        var resCls = "res--" + (m.result || "");
        var resLabel = RES[m.result] || "";
        var cc = m.comp && COMP_CLS[m.comp] ? " " + COMP_CLS[m.comp] : "";

        /* 组别显示：华科杯用映射，其余直接取 team */
        var groupLabel = "";
        if (m.comp === "华科杯" && m.team) {
          groupLabel = m.team === "男足" ? "乙组" : "女子组";
        } else {
          groupLabel = m.team || "—";
        }

        return "<tr>" +
          '<td class="c-time">' + time + "</td>" +
          '<td><span class="tag tag--comp' + cc + '">' + esc(m.comp) + "</span></td>" +
          "<td>" + esc(groupLabel) + "</td>" +
          '<td class="c-format">' + esc(m.format) + "</td>" +
          "<td>" + esc(m.round) + "</td>" +
          "<td>" + esc(m.venue) + "</td>" +
          '<td class="c-vs">' + vs + "</td>" +
          '<td class="c-score ' + resCls + '">' + esc(m.score) + '<span class="res ' + resCls + '">' + resLabel + "</span></td>" +
          (m.video ? '<td><a class="c-video" href="' + esc(m.video) + '" target="_blank" rel="noopener" title="观看全场视频">▶</a></td>' : "<td></td>") +
        "</tr>";
      }).join("");
    }

    function buildPagination(total, current, onPageChange) {
      var totalPages = Math.ceil(total / PAGE_SIZE);
      if (totalPages <= 1) return "";
      var html = '<div class="table__pagination">';
      html += '<button class="pag__btn' + (current <= 1 ? ' pag__btn--disabled' : '') + '" data-page="' + (current - 1) + '" aria-label="上一页">‹</button>';
      html += '<span class="pag__info">' + current + ' / ' + totalPages + '</span>';
      html += '<button class="pag__btn' + (current >= totalPages ? ' pag__btn--disabled' : '') + '" data-page="' + (current + 1) + '" aria-label="下一页">›</button>';
      html += '</div>';
      return html;
    }

    var containerId = "__allTable__";
    var currentPage = window.__tablePage && window.__tablePage[containerId] ? window.__tablePage[containerId] : 1;
    var totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;

    var pageSlice = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    var body = buildTableRows(pageSlice);

    el.innerHTML = '<div class="comp-group">' + head +
      '<div class="comp-table-wrap"><table class="comp-table"><thead><tr>' +
        "<th>时间</th><th>赛事</th><th>组别</th><th>赛制</th><th>轮次</th><th>场地</th><th>对阵双方</th><th>比分</th><th>视频</th>" +
      "</tr></thead><tbody>" + body + "</tbody></table></div>" +
      buildPagination(sorted.length, currentPage, null) + '</div>';
    /* 翻页由 #dataCompCards 上的事件委托统一处理（见初始化处） */
  }

  /* ===== 各赛事战绩 · 分组表格 ===== */
  function renderCompCards(matches, compFilter, seasonAch, filterState) {
    var el = document.getElementById("dataCompCards");
    if (!el) return;
    if (!matches.length) { el.innerHTML = '<p class="match__empty">该筛选条件下暂无比赛记录。</p>'; return; }

    /* 全部/未选赛季 + 全部赛事 + 全部男女足 → 合并为一张表，按时间降序 */
    var isAll = (!filterState || !filterState.season || filterState.season === "all")
      && filterState && filterState.comp === "all" && filterState.team === "all";
    if (isAll) {
      return renderAllMatchesTable(matches, seasonAch);
    }

    var COMP_CLS = { "华科杯": "comp--hust", "新生杯": "comp--freshman", "毕业杯": "comp--graduation", "友谊赛": "comp--friendly" };
    var ORDER = ["新生杯", "华科杯", "毕业杯", "友谊赛"];
    var RES = { "W": "胜", "D": "平", "L": "负" };

    /* 按赛事分组 */
    var byComp = {};
    matches.forEach(function (m) { if (m.comp) (byComp[m.comp] = byComp[m.comp] || []).push(m); });

    var html = ORDER.filter(function (c) { return byComp[c]; }).map(function (c) {
      var ms = byComp[c];
      var compCls = COMP_CLS[c] ? " " + COMP_CLS[c] : "";

      /* 华科杯按 男足/女足 再分组；其余不分 */
      var subgroups;
      if (ms.some(function (m) { return m.team; })) {
        var g = {};
        ms.forEach(function (m) { var k = m.team || ""; (g[k] = g[k] || []).push(m); });
        subgroups = Object.keys(g).sort(function (a, b) {
          if (a === "女足") return -1; if (b === "女足") return 1;
          if (a === "男足") return -1; if (b === "男足") return 1;
          return a.localeCompare(b);
        }).map(function (k) { return { team: k, ms: g[k] }; });
      } else {
        subgroups = [{ team: null, ms: ms.slice().sort(function (a, b) {
          var da = (a.year || "") + "." + (a.date || "");
          var db = (b.year || "") + "." + (b.date || "");
          return da < db ? 1 : da > db ? -1 : 0;
        }) }];
      }

      return subgroups.map(function (sg, sgIdx) {
        /* 子组内按 year.date 降序（近期在上） */
        sg.ms.sort(function (a, b) {
          var da = (a.year || "") + "." + (a.date || "");
          var db = (b.year || "") + "." + (b.date || "");
          return da < db ? 1 : da > db ? -1 : 0;
        });
        var st = calcStats(sg.ms);
        var achTxt = "";
        if (seasonAch) achTxt = sg.team ? (seasonAch[c + "|" + sg.team] || "") : (seasonAch[c] || "");

        var groupLabel = (c === "华科杯" && sg.team)
          ? (function () {
              var gh = filterState.groupHistory && filterState.groupHistory[filterState.season];
              var grp = gh && gh[c] && gh[c][sg.team];
              return grp || (sg.team === "男足" ? "乙组" : "女子组");
            })()
          : (sg.team || "");
        var teamTagCls = (c === "华科杯" && sg.team)
          ? (sg.team === "男足" ? " team--men" : " team--women")
          : "";
        var head =
          '<div class="comp-group-head">' +
            '<span class="tag tag--comp' + compCls + '">' + esc(c) + '</span>' +
            (groupLabel ? '<span class="tag tag--team' + esc(teamTagCls) + '">' + esc(groupLabel) + '</span>' : '') +
            (achTxt ? '<span class="gh-ach">' + esc(achTxt) + '</span>' : '') +
            '<span class="gh-stats">' + st.total + '场 · ' + st.wins + '胜 ' + st.draws + '平 ' + st.losses + '负 · 进球 ' + st.gf + ':' + st.ga + ' 失球</span>' +
          '</div>';

        /* 分页：每表最多 PAGE_SIZE 条 */
        if (!window.__tablePage) window.__tablePage = {};
        var pgId = c + "|" + (sg.team || "_") + "|";
        var curPg = window.__tablePage[pgId] || 1;
        var totalPg = Math.ceil(sg.ms.length / PAGE_SIZE);
        if (curPg > totalPg) curPg = totalPg;
        if (curPg < 1) curPg = 1;

        var pageSlice = sg.ms.slice((curPg - 1) * PAGE_SIZE, curPg * PAGE_SIZE);

        function buildRows(arr) {
          return arr.map(function (m) {
            var time = esc(m.year) + "." + esc(m.date);
            var vs = (m.home === HOME ? "<b>生命科学与技术学院</b>" : esc(m.home)) + " <b>vs</b> " + (m.away === HOME ? "<b>生命科学与技术学院</b>" : esc(m.away));
            var resCls = "res--" + (m.result || "");
            var resLabel = RES[m.result] || "";
            return "<tr>" +
              '<td class="c-time">' + time + "</td>" +
              '<td><span class="tag tag--comp' + compCls + '">' + esc(m.comp) + "</span></td>" +
              "<td>" + esc(groupLabel || "—") + "</td>" +
              '<td class="c-format">' + esc(m.format) + "</td>" +
              "<td>" + esc(m.round) + "</td>" +
              "<td>" + esc(m.venue) + "</td>" +
              '<td class="c-vs">' + vs + "</td>" +
              '<td class="c-score ' + resCls + '">' + esc(m.score) + '<span class="res ' + resCls + '">' + resLabel + "</span></td>" +
            (m.video ? '<td><a class="c-video" href="' + esc(m.video) + '" target="_blank" rel="noopener" title="观看全场视频">▶</a></td>' : "<td></td>") +
              "</tr>";
          }).join("");
        }

        var pagHtml = "";
        if (totalPg > 1) {
          pagHtml = '<div class="table__pagination">' +
            '<button class="pag__btn' + (curPg <= 1 ? ' pag__btn--disabled' : '') + '" data-pg="' + pgId + '" data-page="' + (curPg - 1) + '" aria-label="上一页">‹</button>' +
            '<span class="pag__info">' + curPg + ' / ' + totalPg + '</span>' +
            '<button class="pag__btn' + (curPg >= totalPg ? ' pag__btn--disabled' : '') + '" data-pg="' + pgId + '" data-page="' + (curPg + 1) + '" aria-label="下一页">›</button>' +
            '</div>';
        }

        return '<div class="comp-group" data-pg-id="' + esc(pgId) + '">' + head +
          '<div class="comp-table-wrap"><table class="comp-table"><thead><tr>' +
            "<th>时间</th><th>赛事</th><th>组别</th><th>赛制</th><th>轮次</th><th>场地</th><th>对阵双方</th><th>比分</th><th>视频</th>" +
          "</tr></thead><tbody>" + buildRows(pageSlice) + "</tbody></table></div>" +
          pagHtml + '</div>';
      }).join("");
    }).join("");

    el.innerHTML = html;
    /* 翻页由 #dataCompCards 上的事件委托统一处理（见初始化处） */
  }

  function renderMatchRow(m) {
    var compClsMap = { "华科杯": "comp--hust", "新生杯": "comp--freshman", "毕业杯": "comp--graduation", "友谊赛": "comp--friendly" };
    var teamClsMap = { "男足": "team--men", "女足": "team--women" };
    var cc = m.comp && compClsMap[m.comp] ? " " + compClsMap[m.comp] : "";
    var tc = m.team && teamClsMap[m.team] ? " " + teamClsMap[m.team] : "";
    /* 华科杯加组别标签 */
    var groupTag = "";
    if (m.comp === "华科杯" && m.team) {
      var groupLabel = m.team === "男足" ? "乙组" : "女子组";
      var gc = m.team === "男足" ? "team--men" : "team--women";
      groupTag = '<span class="tag tag--team ' + gc + '">' + esc(groupLabel) + '</span>';
    }

    var resMap = { "W": "胜", "D": "平", "L": "负" };
    var resClsMap = { "W": "res--W", "D": "res--D", "L": "res--L" };

    return '<div class="match">' +
      '<span class="match__tags">' +
        (m.comp ? '<span class="tag tag--comp' + cc + '">' + esc(m.comp) + '</span>' : '') +
        groupTag +
        (m.team ? '<span class="tag tag--team' + tc + '">' + esc(m.team) + '</span>' : '') +
      '</span>' +
      '<span class="match__date mono">' + esc((m.year ? m.year + '.' : '') + m.date) + '</span>' +
      '<span class="match__teams"><b>' + esc(m.home) + ' vs ' + esc(m.away) +
        '</b><span>' + esc(m.round) + (m.venue ? ' · ' + esc(m.venue) : '') + '</span></span>' +
      '<span class="match__score mono ' + (resClsMap[m.result] || "") + '">' + esc(m.score) +
        '<span class="res ' + (resClsMap[m.result] || "") + '">' + (resMap[m.result] || "") + '</span></span>' +
    '</div>';
  }

  /* ===== 参赛人员 ===== */
  function renderSquad(squadHistory, season, compFilter, teamFilter, teamsData, staffHistory) {
    var tabsEl = document.getElementById("dataSquadTabs");
    var gridEl = document.getElementById("dataSquadGrid");
    if (!tabsEl || !gridEl) return;

    /* 该赛季的赛事名单库（独立于首页 squad） */
    var seasonData = (squadHistory && squadHistory[season]) || {};
    /* 取名单的赛事范围：特定赛事 or 全部赛事（取并集） */
    var compKeys = compFilter === "all" ? Object.keys(seasonData) : [compFilter];
    /* 取队伍范围 */
    var teamIds = teamFilter === "all" ? ["men", "women"] : [teamFilter];

    function rosterFor(teamId) {
      /* 合并所选赛事的名单，按 号码+姓名 去重 */
      var seen = {}; var merged = [];
      compKeys.forEach(function (ck) {
        var r = (seasonData[ck] && seasonData[ck][teamId]) || [];
        r.forEach(function (p) {
          var key = (p.num || "") + "|" + p.name;
          if (!seen[key]) { seen[key] = 1; merged.push(p); }
        });
      });
      return merged;
    }

    /* 标签栏：仅在「华科杯 + 男女足全部」时显示男足/女足切换；其他情况直接渲染单一面板 */
    var showTabs = (compFilter === "华科杯" && teamFilter === "all");
    var teamsArr = teamIds.filter(function (tid) {
      return rosterFor(tid).length > 0;
    }).map(function (tid) { return { id: tid, name: tid === "men" ? "男足" : "女足" }; });

    if (!teamsArr.length) { gridEl.innerHTML = '<p class="match__empty">该筛选条件下暂无参赛人员。</p>'; tabsEl.innerHTML = ""; return; }

    if (showTabs && teamsArr.length > 1) {
      /* 多队 → 渲染标签栏 + 面板 */
      tabsEl.innerHTML = '<div class="squad__tab-bar">' +
        teamsArr.map(function (t, i) {
          return '<button class="squad__tab' + (i === 0 ? ' is-active' : '') + '" data-squad="' + t.id + '">' + t.name + '</button>';
        }).join("") + '</div>';

      gridEl.innerHTML = teamsArr.map(function (t, i) {
        return '<div class="squad__panel' + (i === 0 ? '' : ' is-hidden') + '" data-panel="' + t.id + '">' + buildPanel(t.id) + '</div>';
      }).join("");

      /* 切换事件 */
      tabsEl.querySelectorAll(".squad__tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          tabsEl.querySelectorAll(".squad__tab").forEach(function (b) { b.classList.remove("is-active"); });
          this.classList.add("is-active");
          var target = this.getAttribute("data-squad");
          gridEl.querySelectorAll(".squad__panel").forEach(function (panel) {
            panel.classList.toggle("is-hidden", panel.getAttribute("data-panel") !== target);
          });
        });
      });
    } else {
      /* 单一队伍（或非华科杯）→ 不显示标签，直接渲染内容 */
      tabsEl.innerHTML = "";
      gridEl.innerHTML = '<div class="squad__panel" data-panel="' + (teamsArr[0] ? teamsArr[0].id : "") + '">' +
        (teamsArr[0] ? buildPanel(teamsArr[0].id) : '') + '</div>';
    }

    function buildPanel(teamId) {
      var regs = rosterFor(teamId);

      /* 球员不再按位置分区：统一按号码排序，平铺于一个网格 */
      var players = regs.slice().sort(function (a, b) {
        return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
      });
      var cards = players.map(function (p) {
        var cap = p.captain ? '<span class="player__cap">C</span>' : '';
        var front = '<div class="player__face player__face--front">' +
          '<div class="player__visual">' +
            '<span class="player__num">' + esc(p.num) + '</span>' +
            cap +
            '<div class="player__center"><span class="player__name">' + esc(p.name) + '</span></div>' +
          '</div>' +
          '<div class="player__info"><span class="player__pos">' + esc(p.pos) + '</span></div>' +
        '</div>';
        return '<article class="player reveal" tabindex="0">' +
          '<div class="player__inner">' + front + '</div>' +
        '</article>';
      }).join("");
      var playersHtml = players.length
        ? '<h4 class="squad__staff-title">球员 <small>' + players.length + ' 人</small></h4><div class="squad__grid-inner">' + cards + '</div>'
        : '';

      /* 球队官员：优先取该赛季·赛事·队伍专用的 staffHistory，否则回退到 teams[].staff（按赛季不变），排成一行 */
      var teamInfo = (teamsData && teamsData.find ? teamsData.find(function (t) { return t.id === teamId; }) : null);
      var seasonStaff = (staffHistory && staffHistory[season]) || {};
      var staffMerged = [], staffSeen = {};
      compKeys.forEach(function (ck) {
        var s = (seasonStaff[ck] && seasonStaff[ck][teamId]) || [];
        s.forEach(function (x) {
          var key = (x.role || "") + "|" + x.name;
          if (!staffSeen[key]) { staffSeen[key] = 1; staffMerged.push(x); }
        });
      });
      var teamStaff = staffMerged.length ? staffMerged : ((teamInfo && teamInfo.staff) || []);
      var staffOrdered = teamStaff.slice().sort(function (a, b) {
        return (a.role === "领队" ? -1 : 0) - (b.role === "领队" ? -1 : 0);
      });
      var staffHtml = staffOrdered.length
        ? '<h4 class="squad__staff-title">球队官员</h4><div class="squad__staff squad__staff--row">' +
            staffOrdered.map(function (s) {
              var role = s.role ? '<span class="player__role-top">' + esc(s.role) + '</span>' : "";
              var front = '<div class="player__face player__face--front">' +
                '<div class="player__visual">' +
                  (role || '') +
                  '<div class="player__center"><span class="player__name">' + esc(s.name) + '</span></div>' +
                '</div>' +
              '</div>';
              return '<article class="player reveal" tabindex="0">' +
                '<div class="player__inner">' + front + '</div>' +
              '</article>';
            }).join("") + '</div>'
        : '';

      if (!regs.length && !teamStaff.length) return '<p class="match__empty">该赛季暂无参赛人员。</p>';

      return staffHtml + playersHtml;
    }

    gridEl.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- 主题 / 导航 / 回顶部 ---------- */
  function initTheme() {
    var root = document.documentElement;
    var toggle = document.getElementById("themeToggle");
    var saved = null;
    try { saved = localStorage.getItem("lsfc-theme"); } catch (e) {}
    if (!saved) saved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    root.setAttribute("data-theme", saved);
    if (toggle) {
      toggle.setAttribute("aria-pressed", saved === "dark" ? "true" : "false");
      toggle.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        toggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
        try { localStorage.setItem("lsfc-theme", next); } catch (e) {}
      });
    }
  }

  function initChrome() {
    var nav = document.getElementById("nav");
    if (nav) {
      var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    var toTop = document.getElementById("toTop");
    if (toTop) {
      var onST = function () { toTop.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6); };
      onST();
      window.addEventListener("scroll", onST, { passive: true });
      toTop.addEventListener("click", function () {
        var t = document.getElementById("top"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    /* 汉堡菜单 */
    var burger = document.getElementById("navBurger");
    var dropdown = document.getElementById("navDropdown");
    if (burger && dropdown) {
      burger.addEventListener("click", function () {
        var open = dropdown.hidden;
        dropdown.hidden = !open;
        burger.setAttribute("aria-expanded", String(open));
      });
      dropdown.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () { dropdown.hidden = true; burger.setAttribute("aria-expanded", "false"); });
      });
    }
  }

  /* ---------- 滚动渐显（与首页一致，含安全兜底） ---------- */
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

    /* 安全兜底：1.5s 后强制所有 .reveal 可见（防止 IO 未触发） */
    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.is-in)").forEach(function (el) { el.classList.add("is-in"); });
    }, 1500);
  }

  /* ---------- 启动 ---------- */
  initTheme();
  initChrome();
  initReveal();

  fetch("assets/data/content.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) { render(data); })
    .catch(function (err) { console.warn("[Data] 内容加载失败：", err); });
})();
