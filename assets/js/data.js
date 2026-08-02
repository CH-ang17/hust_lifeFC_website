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
        var isPen = !!g.penalty || /\(P\)/.test(g.time);
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
      return b.g - a.g || a.pen - b.pen || a.name.localeCompare(b.name);
    });
    if (!players.length) { el.innerHTML = '<p class="match__empty">该筛选条件下暂无进球记录。</p>'; return; }

    /* 并列排名：进球数相同且点球数也相同的球员共享同一名次 */
    var prevG = null, prevPen = null, rank = 0;
    players.forEach(function (p, i) {
      if (p.g !== prevG || p.pen !== prevPen) { rank = i + 1; prevG = p.g; prevPen = p.pen; }
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
      return b.g - a.g || a.pen - b.pen || a.name.localeCompare(b.name);
    });
    if (!rows.length) { el.innerHTML = '<p class="match__empty">该筛选条件下暂无球员进球数据。</p>'; return; }

    /* 并列排名：进球数相同且点球数相同共享同一名次 */
    var prevG = null, prevPen = null, rank = 0;
    rows.forEach(function (p, i) {
      if (p.g !== prevG || p.pen !== prevPen) { rank = i + 1; prevG = p.g; prevPen = p.pen; }
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

  /* ---------- 球员检索（全局，不受上方筛选影响） ---------- */
  var GLOBAL_STATS = {};
  var ROSTER_INDEX = {};

  function buildRosterIndex(squadHistory, staffHistory) {
    ROSTER_INDEX = {};
    function add(name, season, comp, gender, identity) {
      if (!name) return;
      var key = season + "|" + comp + "|" + gender;
      var arr = ROSTER_INDEX[name] || (ROSTER_INDEX[name] = []);
      var e = null;
      for (var i = 0; i < arr.length; i++) { if (arr[i].key === key) { e = arr[i]; break; } }
      if (!e) { e = { key: key, season: season, comp: comp, gender: gender, ids: [] }; arr.push(e); }
      if (e.ids.indexOf(identity) < 0) e.ids.push(identity);
    }
    var genders = ["men", "women"];
    Object.keys(squadHistory || {}).forEach(function (season) {
      var sd = squadHistory[season] || {};
      Object.keys(sd).forEach(function (comp) {
        var cd = sd[comp] || {};
        genders.forEach(function (g) {
          (cd[g] || []).forEach(function (p) { add(p.name, season, comp, g, "球员"); });
        });
      });
    });
    Object.keys(staffHistory || {}).forEach(function (season) {
      var sd = staffHistory[season] || {};
      Object.keys(sd).forEach(function (comp) {
        var cd = sd[comp] || {};
        genders.forEach(function (g) {
          (cd[g] || []).forEach(function (s) { add(s.name, season, comp, g, s.role || "球队官员"); });
        });
      });
    });
  }

  function seasonLabelOf(entry) {
    var comp = entry.comp;
    if (comp === "华科杯" && GROUP_HISTORY) {
      var gh = GROUP_HISTORY[entry.season];
      if (gh && gh["华科杯"]) {
        var gk = entry.gender === "women" ? "女足" : "男足";
        return "华科杯" + (gh["华科杯"][gk] || (entry.gender === "women" ? "女子组" : "乙组"));
      }
      return comp + (entry.gender === "women" ? "女子组" : "乙组");
    }
    return comp;
  }

  function renderPlayerSearch(query) {
    var el = document.getElementById("dataPlayerSearchResult");
    if (!el) return;
    var q = (query || "").trim().toLowerCase();
    if (!q) { el.innerHTML = ""; return; }

    /* 候选姓名：进球/红黄牌记录 ∪ 报名名单，排除对手乌龙 */
    var nameSet = {};
    Object.keys(GLOBAL_STATS).forEach(function (n) { if (n !== "乌龙") nameSet[n] = 1; });
    Object.keys(ROSTER_INDEX).forEach(function (n) { if (n !== "乌龙") nameSet[n] = 1; });
    var matches = Object.keys(nameSet).filter(function (n) {
      return n.toLowerCase().indexOf(q) !== -1;
    });
    if (!matches.length) {
      el.innerHTML = '<p class="match__empty">未找到与「' + esc(query) + '」匹配的球员或工作人员。</p>';
      return;
    }
    matches.sort(function (a, b) { return a.localeCompare(b); });
    if (matches.length > 20) matches = matches.slice(0, 20);

    var html = matches.map(function (name) {
      var st = GLOBAL_STATS[name];
      var totalG = st ? st.g : 0, totalPen = st ? st.pen : 0;
      var compParts = STAT_COMPS.map(function (c) {
        var o = st ? (st.comps[c] || { g: 0, pen: 0 }) : { g: 0, pen: 0 };
        return o.g > 0 ? esc(c) + " " + fmtGoals(o.g, o.pen) : null;
      }).filter(Boolean);
      var cardsTxt = (st && (st.r > 0 || st.y > 0))
        ? "红 " + st.r + " · 黄 " + st.y
        : "无";
      var roster = (ROSTER_INDEX[name] || []).slice().sort(function (a, b) {
        return a.season < b.season ? 1 : a.season > b.season ? -1 : 0;
      });
      var compHtml = roster.length
        ? '<ul class="ps-card__comps">' + roster.map(function (e) {
            var ach = ACHIEVEMENTS_DATA ? achOf(ACHIEVEMENTS_DATA, e.season, e.comp, e.gender) : null;
            var achText = ach ? ' <span style="color:var(--club);font-weight:600">' + esc(ach) + '</span>' : '';
            return '<li>' + esc(e.season) + " " + esc(seasonLabelOf(e)) + " · " + esc(e.ids.join("/")) + achText + '</li>';
          }).join("") + '</ul>'
        : '<span class="ps-card__none">无报名记录</span>';

      var goalLine = totalG > 0
        ? '总进球 <b>' + fmtGoals(totalG, totalPen) + '</b>'
        : '无进球记录';
      var compLine = compParts.length ? compParts.join(" · ") : "—";

      return '<div class="ps-card">' +
        '<div class="ps-card__head"><span class="ps-card__name">' + esc(name) + '</span>' +
          '<span class="ps-card__goal">' + goalLine + '</span></div>' +
        '<div class="ps-card__row"><span class="ps-card__lbl">各赛事进球</span>' + esc(compLine) + '</div>' +
        '<div class="ps-card__row"><span class="ps-card__lbl">红黄牌</span>' + esc(cardsTxt) + '</div>' +
        '<div class="ps-card__row"><span class="ps-card__lbl">参加赛事</span>' + compHtml + '</div>' +
        '<button class="ps-card__career" type="button" data-career="' + esc(name) + '">生成纪念卡</button>' +
      '</div>';
    }).join("");

    var hint = matches.length >= 20 ? '<p class="data__note">仅显示前 20 条匹配结果，请缩小关键词。</p>' : '';
    el.innerHTML = html + hint;
  }

  /* ---------- 俱乐部生涯纪念卡 ---------- */
  var CAREER_DATA = null;
  var GROUP_HISTORY = null;
  var ACHIEVEMENTS_DATA = null;

  function achOf(ach, season, comp, gender) {
    var a = ach[season]; if (!a) return null;
    if (a[comp]) return a[comp];
    if (comp === "华科杯") {
      var k = comp + (gender === "women" ? "|女足" : "|男足");
      if (a[k]) return a[k];
    }
    return null;
  }

  function shortSeason(s) {
    var p = (s || "").split("-");
    if (p.length < 2) return s;
    return p[0] + "/" + p[1].slice(2);
  }
  function seasonRangeLabel(list) {
    if (!list.length) return "";
    return shortSeason(list[0]) + "赛季 — " + shortSeason(list[list.length - 1]) + "赛季";
  }
  function compOrder(a, b) {
    var O = { "新生杯": 0, "华科杯": 1, "毕业杯": 2 };
    return (O[a] == null ? 9 : O[a]) - (O[b] == null ? 9 : O[b]);
  }
  function groupOf(gh, season, gender) {
    var gk = gender === "women" ? "女足" : "男足";
    var v = gh[season] && gh[season]["华科杯"] && gh[season]["华科杯"][gk];
    return v || (gender === "women" ? "女子组" : "乙组");
  }

  function computeCareer(name, data) {
    var sh = data.squadHistory || {};
    var stf = data.staffHistory || {};
    var entries = [];
    /* 球员名单 */
    Object.keys(sh).forEach(function (season) {
      var sd = sh[season] || {};
      Object.keys(sd).forEach(function (comp) {
        var cd = sd[comp] || {};
        ["men", "women"].forEach(function (g) {
          (cd[g] || []).forEach(function (p) {
            if (p && p.name === name) entries.push({ season: season, comp: comp, gender: g, num: p.num || "", pos: p.pos || "", isStaff: false });
          });
        });
      });
    });
    /* 球队官员 */
    Object.keys(stf).forEach(function (season) {
      var sd = stf[season] || {};
      Object.keys(sd).forEach(function (comp) {
        var cd = sd[comp] || {};
        ["men", "women"].forEach(function (g) {
          (cd[g] || []).forEach(function (s) {
            if (s && s.name === name) entries.push({ season: season, comp: comp, gender: g, num: "", pos: s.role || "球队官员", isStaff: true });
          });
        });
      });
    });
    if (!entries.length) return null;

    var onlyStaff = entries.every(function (e) { return e.isStaff; });

    var seasons = []; entries.forEach(function (e) { if (seasons.indexOf(e.season) < 0) seasons.push(e.season); });
    seasons.sort();
    var comps = []; entries.forEach(function (e) { if (comps.indexOf(e.comp) < 0) comps.push(e.comp); });

    /* 最后参加赛季的号码 / 位置（同赛季优先 新生杯→华科杯→毕业杯） */
    var lastSeason = seasons[seasons.length - 1];
    var lastEntries = entries.filter(function (e) { return e.season === lastSeason; })
      .sort(function (a, b) { return compOrder(a.comp, b.comp); });
    var lastEntry = lastEntries[0] || entries[entries.length - 1];

    /* 华科杯组别（多组别按 / 并列） */
    var gh = data.groupHistory || {};
    var hustGroups = {};
    entries.forEach(function (e) {
      if (e.comp !== "华科杯") return;
      hustGroups[groupOf(gh, e.season, e.gender)] = 1;
    });
    var groupList = Object.keys(hustGroups);
    var compDisplay = comps.slice().sort(compOrder).map(function (c) {
      return (c === "华科杯" && groupList.length) ? ("华科杯（" + groupList.join("/") + "）") : c;
    }).join(" · ");

    /* 场次：仅统计球员「实际报名」的 (赛季, 赛事, 组别) 组合对应的正式比赛
       —— 不能用 seasons × comps 笛卡尔积（否则未报名该赛季该赛事的比赛会被误计） */
    var enrolled = {}; /* key = season|comp|teamKey，华科杯 teamKey=男足/女足，新生杯/毕业杯 teamKey=na */
    entries.forEach(function (e) {
      var teamKey = e.comp === "华科杯"
        ? (e.gender === "women" ? "女足" : "男足")
        : "na";
      enrolled[e.season + "|" + e.comp + "|" + teamKey] = 1;
    });
    var fixtures = data.fixtures && data.fixtures.recent ? data.fixtures.recent : [];
    var matchCount = 0;
    fixtures.forEach(function (m) {
      if (["华科杯", "新生杯", "毕业杯"].indexOf(m.comp) < 0) return;
      var ms = seasonOf(m);
      var teamKey = m.comp === "华科杯" ? (m.team || "") : "na";
      if (!enrolled[ms + "|" + m.comp + "|" + teamKey]) return; /* 仅统计实际报名组合 */
      matchCount++;
    });

    var goals = (GLOBAL_STATS[name] && GLOBAL_STATS[name].g) || 0;

    /* 荣誉：排除「未报名 / 因疫情未举办」两类无参赛记录说明（未出线属真实参赛结果，正常列出） */
    var ach = data.achievements || {};
    var ABSENT = ["未报名", "因疫情未举办"];
    var honors = [], seen = {};
    entries.forEach(function (e) {
      var val = achOf(ach, e.season, e.comp, e.gender);
      if (!val) return;
      if (ABSENT.some(function (t) { return val.indexOf(t) >= 0; })) return;
      var grp = e.comp === "华科杯" ? groupOf(gh, e.season, e.gender) : "";
      var isExit = val.indexOf("未出线") >= 0; /* 未出线仅显示 赛事+组别+赛季，不显示成绩文字 */
      var label = (e.comp === "华科杯" ? ("华科杯" + grp) : e.comp) + (isExit ? "" : val) + "（" + shortSeason(e.season) + "）";
      if (!seen[label]) { seen[label] = 1; honors.push({ season: e.season, label: label }); }
    });
    honors.sort(function (a, b) { return b.season.localeCompare(a.season); });
    var honorLabels = honors.map(function (h) { return h.label; });

    return {
      name: name,
      tenure: seasonRangeLabel(seasons),
      seasons: seasons.length,
      comps: comps.length,
      matches: matchCount,
      goals: goals,
      num: lastEntry.num || "",
      pos: lastEntry.pos || "",
      isStaff: lastEntry.isStaff || false,
      onlyStaff: onlyStaff,
      compDisplay: compDisplay,
      honors: honorLabels
    };
  }

  function buildCareerCardHTML(c, optH) {
    var W = 680, H = (optH || 956);
    var honorsHtml = c.honors.length
      ? '<div style="font-family:\'Noto Sans SC\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;font-weight:400;font-size:12px;color:#a8c4d8;margin-top:6px;line-height:1.65">' +
          c.honors.map(function (h) { return '<div style="margin-bottom:2px">' + esc(h) + '</div>'; }).join("") +
        '</div>'
      : '';
    /*
      cr 版核心改变：
      所有垂直定位改用 flexbox / 固定 padding，不再依赖 line-height hack。
      
      原因：html2canvas 的 JS 渲染引擎对 line-height 的计算值与浏览器原生 CSS 引擎
      存在系统性差异（通常更紧凑 15-25%）。之前 bo~cq 共 32 版尝试的各种补偿方案
      （增大 line-height、padding、margin）都无法精确匹配，因为偏差比例随上下文变化。
      
      解决方案：在 HTML 源头就用 html2canvas 友好的 CSS 写法：
      - 四宫格 cell：display:flex;flex-direction:column;justify-content:center（替代 line-height:1.1+padding-top）
      - 姓名：line-height:1.3（保守值，两种引擎差异小）+ 适度 padding-bottom
      - 位置/赛季行：用固定 margin-top（不用极端值）
    */
    return '' +
      /* ===== 背景层（SVG 绝对定位） ===== */
      '<svg width="' + W + '" height="' + H + '" style="position:absolute;top:0;left:0" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<defs><linearGradient id="arcC" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a4a70"/><stop offset="100%" stop-color="#002a45"/></linearGradient></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="#003B5C"/>' +
        '<path d="M0,' + Math.round(H*0.77) + ' Q' + Math.round(W/2) + ',' + Math.round(H*0.845) + ' ' + W + ',' + Math.round(H*0.77) + ' L' + W + ',' + Math.round(H*0.795) + ' Q' + Math.round(W/2) + ',' + Math.round(H*0.87) + ' 0,' + Math.round(H*0.795) + ' Z" fill="url(#arcC)" opacity=".5"/>' +
        '<path d="M0,' + Math.round(H*0.795) + ' Q' + Math.round(W/2) + ',' + Math.round(H*0.87) + ' ' + W + ',' + Math.round(H*0.795) + ' L' + W + ',' + Math.round(H*0.808) + ' Q' + Math.round(W/2) + ',' + Math.round(H*0.883) + ' 0,' + Math.round(H*0.808) + ' Z" fill="#3a7caa" opacity=".25"/>' +
      '</svg>' +
      /* ===== 右上角号码 ===== */
      (c.isStaff ? '' :
      '<div style="position:absolute;top:26px;right:32px;z-index:3">' +
        '<div style="font-family:\'Space Mono\',monospace;font-weight:700;font-size:86px;line-height:1;color:#FFFEF8;text-shadow:0 2px 12px rgba(0,0,0,.35),0 0 30px rgba(120,200,255,.15)">' + esc(c.num) + '</div>' +
      '</div>') +
      /* ===== 内容容器 ===== */
      '<div style="position:relative;z-index:2;padding:42px 42px 36px;box-sizing:border-box">' +

        /* --- 姓名 + 位置 + 赛季 --- */
        /* cr 改动：姓名 line-height 从 1.15→1.3（更保守，引擎差异小），margin-bottom 从 28→32 */
        '<div style="text-align:center;margin-bottom:32px;margin-top:110px">' +
          '<div style="font-family:\'Archivo\',\'Noto Sans SC\',sans-serif;font-weight:800;font-size:56px;letter-spacing:.08em;color:#FFFEF8;line-height:1.3;padding-bottom:4px">' + esc(c.name) + '</div>' +
          (c.pos ? '<div style="margin-top:8px;font-family:\'Noto Sans SC\',\'PingFang SC\',sans-serif;font-weight:500;font-size:14px;color:#FFFEF8;letter-spacing:.06em">' + esc(c.pos) + '</div>' : '') +
          (c.tenure ? '<div style="margin-top:6px;font-family:\'Space Mono\',\'Noto Sans SC\',sans-serif;font-weight:500;font-size:13px;color:#FFFEF8;letter-spacing:.04em;opacity:.9">' + esc(c.tenure) + '</div>' : '') +
        '</div>' +

        /* --- 参赛赛事与荣誉 --- */
        '<div style="margin-bottom:16px">' +
          '<div style="font-family:\'Archivo\',\'Noto Sans SC\',sans-serif;font-weight:700;font-size:13px;color:#c9a227;letter-spacing:.12em;margin-bottom:6px">参赛赛事与荣誉 COMPETITIONS AND HONORS</div>' +
          '<div style="height:1px;background:rgba(201,162,39,.35);margin-bottom:8px"></div>' +
          '<div style="font-family:\'Noto Sans SC\',\'PingFang SC\',sans-serif;font-weight:600;font-size:13px;color:#FFFEF8;line-height:1.55">' + esc(c.compDisplay) + '</div>' +
          honorsHtml +
        '</div>' +

        /* --- 数据概览四宫格 --- */
        '<div style="margin-top:20px">' +
          '<div style="font-family:\'Archivo\',\'Noto Sans SC\',sans-serif;font-weight:700;font-size:14px;color:#c9a227;letter-spacing:.12em;margin-bottom:8px">数据概览 CAREER STATS</div>' +
          '<div style="height:1px;background:rgba(201,162,39,.35);margin-bottom:10px"></div>' +
          '<div style="display:grid;grid-template-columns:' + (c.onlyStaff ? "1fr 1fr 1fr" : "1fr 1fr") + ';gap:10px">' +
            careerStatCell("赛季", c.seasons) + careerStatCell("赛事", c.comps) +
            careerStatCell("场次", c.matches) +
            (c.onlyStaff ? "" : careerStatCell("进球", c.goals)) +
          '</div>' +
        '</div>' +

        /* --- 底部署名 --- */
        '<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(201,162,39,.45);text-align:center">' +
          '<div style="font-family:\'Space Mono\',monospace;font-weight:700;font-size:17px;color:#FFFEF8;letter-spacing:.14em">HUST LIFE FC</div>' +
          '<div style="font-family:\'Noto Sans SC\',\'PingFang SC\',sans-serif;font-weight:400;font-size:12px;color:#FFFEF8;margin-top:4px;letter-spacing:.03em">生命科学与技术学院足球俱乐部</div>' +
        '</div>' +

      '</div>';
  }
  /*
   * cr 版 careerStatCell：flex 纵向居中替代 line-height hack
   *
   * 旧版（bo~cq）：数字用 line-height:1.1 + padding-top:4px 实现视觉居中
   *   → html2canvas 对 line-height 计算不准 → 数字偏移
   *
   * 新版（cr）：cell 本身是 flex 容器，justify-content:center 自动垂直居中
   *   → 不依赖 line-height → html2canvas 和浏览器结果一致
   */
  function careerStatCell(label, val) {
    return '<div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:18px 12px;text-align:center">' +
      '<div style="font-family:\'Noto Sans SC\',\'PingFang SC\',sans-serif;font-weight:500;font-size:12px;color:#8baabb;margin-bottom:4px">' + esc(label) + '</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-weight:700;font-size:28px;color:#FFFEF8;line-height:1">' + esc(String(val)) + '</div>' +
    '</div>';
  }

  function openCareerCard(name) {
    if (!name) return;
    var c = computeCareer(name, CAREER_DATA);
    var holder = document.getElementById("careerCardResult");
    if (!c) {
      if (holder) holder.innerHTML = '<p class="career-card__empty">未找到「' + esc(name) + '」的报名记录。</p>';
      return;
    }
    var modal = document.getElementById("careerModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "careerModal";
      modal.className = "career-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeCareerCard();
      });
    }
    modal.innerHTML =
      '<div class="career-modal__panel">' +
        '<div class="career-modal__bar">' +
          '<button class="career-modal__close" type="button" aria-label="关闭">×</button>' +
          '<button class="career-card__download career-modal__dl" id="careerCardDownload" type="button">下载图片</button>' +
        '</div>' +
        '<div class="career-card__stage"><div class="career-card" id="careerCardEl">' + buildCareerCardHTML(c) + '</div></div>' +
      '</div>';
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    modal.querySelector(".career-modal__close").addEventListener("click", closeCareerCard);
    var dl = document.getElementById("careerCardDownload");
    if (dl) dl.addEventListener("click", function () { downloadCareerCard(name); });

    /* 测量内容自然高度，让 SVG/卡片/stage 三层高度一致（避免底部多余空白） */
    /* 关键：transform:scale(0.72) 不改变布局尺寸，stage 会按未缩放的 DOM 尺寸撑开 */
    setTimeout(function () {
      var el = document.getElementById("careerCardEl");
      if (!el) return;
      /* 用 children 找到非 SVG 的内容容器 */
      var inner = null;
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].tagName !== "SVG") { inner = kids[i]; break; }
      }
      var svg = el.querySelector("svg");
      if (inner && svg) {
        var h = inner.offsetHeight;
        /* 1. SVG 高度 = 内容高度（弧形渐变在内容范围内） */
        svg.setAttribute("height", String(h));
        /* 2. 卡片 DOM 高度 = 内容高度 */
        el.style.height = h + "px";
      }
      /* 3. stage 容器高度 = 卡片视觉高度（DOM高 × scale 0.72），精确匹配不留余量 */
      var stage = el.parentElement;
      if (stage) {
        var visualH = el.offsetHeight * 0.72;
        stage.style.height = Math.floor(visualH) + "px";
        stage.style.overflow = "hidden";
      }
    }, 150);
  }

  function closeCareerCard() {
    var modal = document.getElementById("careerModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = "";
    document.body.classList.remove("no-scroll");
  }

  function downloadCareerCard(name) {
    var btn = document.getElementById("careerCardDownload");
    if (btn) { btn.disabled = true; btn.textContent = "生成中…"; }

    /*
      cr 版方案：源头修复 + 简单克隆截图

      bo~cq 共 32 版失败的根因统一为：
      原始 HTML 用 line-height hack 控制垂直间距（姓名 line-height:1.15、
      数字 line-height:1.1+padding-top:4px），html2canvas 对 line-height 的计算
      与浏览器存在系统性差异，任何 onclone 补偿都无法精确匹配。

      cr 版从根本上修改了 buildCareerCardHTML 和 careerStatCell：
      1. 四宫格 cell：display:flex;flex-direction:column;justify-content:center
         （替代 line-height:1.1+padding-top:4px）
      2. 姓名：line-height:1.3（保守值，引擎差异小）
      3. 位置/赛季行：适度 margin-top（8px/6px）
      
      下载函数恢复最简模式：克隆+去类+截图，零 onclone 补偿。
    */

    var cardEl = document.getElementById("careerCardEl");
    if (!cardEl) {
      openCareerCard(name);
      cardEl = document.getElementById("careerCardEl");
      if (!cardEl) {
        if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
        alert("请先在页面上打开生涯纪念卡弹窗，再点击下载。");
        return;
      }
    }

    /* 确保卡片高度已测量 */
    var inner = null, kids = cardEl.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName !== "SVG") { inner = kids[i]; break; }
    }
    var svg = cardEl.querySelector("svg");
    if (inner && svg) {
      var h = inner.offsetHeight;
      svg.setAttribute("height", String(h));
      cardEl.style.height = h + "px";
    }

    if (typeof html2canvas === "undefined") {
      if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
      alert("截图库未加载，请刷新页面后重试。");
      return;
    }

    /* 克隆并移除 transform 相关类 */
    var clone = cardEl.cloneNode(true);
    clone.removeAttribute("id");
    clone.className = "";
    clone.style.cssText =
      "width:680px;height:auto;" +
      "box-sizing:border-box;" +
      "position:relative;" +
      "overflow:hidden;" +
      "background:#003B5C;" +
      "transform:none;" +
      "transform-origin:top left;";

    var wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:680px;z-index:-9999;";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    requestAnimationFrame(function () {
      setTimeout(function () {
        html2canvas(clone, {
          scale: 2,
          backgroundColor: "#003B5C",
          logging: false,
          useCORS: true,
          letterRendering: true,
          onclone: function (clonedDoc) {
            /* 仅清洗 oklch() 颜色值 */
            var allEls = clonedDoc.querySelectorAll("*");
            for (var i = 0; i < allEls.length; i++) {
              var el = allEls[i];
              var style = el.style;
              if (!style) continue;
              for (var j = 0; j < style.length; j++) {
                var prop = style[j];
                var val = style.getPropertyValue(prop);
                if (val && val.indexOf("oklch") !== -1) {
                  style.setProperty(prop, "#003B5C");
                }
              }
            }
            try {
              var sheets = clonedDoc.styleSheets;
              for (var s = 0; s < sheets.length; s++) {
                try {
                  var rules = sheets[s].cssRules || sheets[s].rules;
                  if (!rules) continue;
                  for (var r = rules.length - 1; r >= 0; r--) {
                    if (rules[r].cssText && rules[r].cssText.indexOf("oklch") !== -1) {
                      sheets[s].deleteRule(r);
                    }
                  }
                } catch (e) { /* 跨域 */ }
              }
            } catch (e2) { /* 忽略 */ }
          }
        }).then(function (canvas) {
          if (wrapper.parentNode) document.body.removeChild(wrapper);

          var link = document.createElement("a");
          link.download = (name || "club-career") + "-生涯纪念卡.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
          if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
        }).catch(function (e) {
          if (wrapper.parentNode) document.body.removeChild(wrapper);
          console.error("[CareerCard] 截图失败:", e);
          if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
          alert("图片生成失败：" + (e && e.message ? e.message : "未知错误"));
        });
      }, 300);
    });
  }

  /**
   * 纯 Canvas 2D API 手绘生涯纪念卡 —— 与网页 openCareerCard 预览像素级一致
   * @param {Object} c - computeCareer() 返回的卡片数据
   * @returns {HTMLCanvasElement} 2x pixel ratio 的离屏 canvas
   */
  function drawCareerCardCanvas(c) {
    var W = 680, PR = 2;
    var s = function(v) { return v * PR; }; /* 缩放到 device pixel */
    var PAD = 42, PAD_B = 36;

    /* ---- 测量内容高度 ---- */
    var compLines = c.compDisplay.split("\n").length;
    var honorCount = c.honors.length;
    /* 参赛赛事块 ≈ 标题13 + mb6 + 金线1 + mb8 + 内容行 + mb6 + 荣誉行 */
    var compBlockH = 13 + 6 + 1 + 8 + (compLines * 21) + 6 + (honorCount > 0 ? 6 + honorCount * 21 : 0);
    /* 四宫格: 标题14 + mb8 + 金线1 + mb10 + [pad10 + label12 + mb2 + padT4 + num28 + padB12] + gap10 */
    var cellInnerH = 10 + 12 + 2 + 4 + 28 + 12;
    var gridH = 14 + 8 + 1 + 10 + cellInnerH + 10;
    /* 底部: mt24 + pt16 + 金线1 + num17 + mt4 + sub12 + mb10 */
    var footerH = 24 + 16 + 1 + 17 + 4 + 12 + 10;

    var contentH =
      110 +           /* 姓名区 top margin */
      62 +            /* name ~height (56px + lh buffer) */
      5 + 14 +         /* position */
      4 + 13 +         /* tenure */
      28 +             /* gap → 参赛赛事 */
      compBlockH +
      20 +             /* gap → 数据概览 */
      gridH +
      footerH +
      PAD_B;          /* bottom padding */

    var H = Math.max(contentH, 956);

    /* ---- 创建 canvas ---- */
    var canvas = document.createElement("canvas");
    canvas.width = s(W);
    canvas.height = s(H);
    var ctx = canvas.getContext("2d");
    ctx.scale(PR, PR);

    /* ============ 颜色常量 ============ */
    var C_BG = "#003B5C";
    var C_TEXT = "#FFFEF8";
    var C_GOLD = "#c9a227";
    var C_GOLD_FADE = "rgba(201,162,39,.35)";
    var C_GOLD_BORDER = "rgba(201,162,39,.45)";
    var C_CELL_BG = "rgba(255,255,255,.06)";
    var C_CELL_BR = "rgba(255,255,255,.1)";
    var C_SUB = "#a8c4d8";
    var C_LABEL = "#8baabb";

    /* ============ 1. 背景 ============ */
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);

    /* ============ 2. 底部弧形装饰（两条） ============ */
    var arcY1 = H * 0.77, arcY2 = H * 0.795, arcY3 = H * 0.808;
    var cpY1a = H * 0.845, cpY1b = H * 0.87, cpY2b = H * 0.883;

    /* 弧形 1 — 半透明渐变蓝 */
    ctx.beginPath();
    ctx.moveTo(0, arcY1);
    ctx.quadraticCurveTo(W / 2, cpY1a, W, arcY1);
    ctx.lineTo(W, arcY2);
    ctx.quadraticCurveTo(W / 2, cpY1b, 0, arcY2);
    ctx.closePath();
    ctx.fillStyle = "rgba(26,74,112,.5)";
    ctx.fill();

    /* 弧形 2 — 更浅蓝 */
    ctx.beginPath();
    ctx.moveTo(0, arcY2);
    ctx.quadraticCurveTo(W / 2, cpY1b, W, arcY2);
    ctx.lineTo(W, arcY3);
    ctx.quadraticCurveTo(W / 2, cpY2b, 0, arcY3);
    ctx.closePath();
    ctx.fillStyle = "rgba(58,124,170,.25)";
    ctx.fill();

    /* ============ 3. 右上角号码 ============ */
    if (!c.isStaff) {
      ctx.save();
      ctx.font = "700 86px 'Space Mono', monospace";
      ctx.fillStyle = C_TEXT;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      /* text shadow */
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(c.num, W - 32, 26);
      ctx.restore();
    }

    /* ============ 4. 辅助函数 ============ */
    function drawCenteredText(text, x, yCenter, font, color, letterSpacing) {
      ctx.save();
      ctx.font = font;
      ctx.fillStyle = color || C_TEXT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (letterSpacing && letterSpacing > 0) {
        /* 手动实现 letter-spacing */
        var chars = text.split("");
        var totalWidth = 0;
        for (var i = 0; i < chars.length; i++) {
          totalWidth += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? letterSpacing : 0);
        }
        var startX = x - totalWidth / 2;
        var cx = startX;
        for (var j = 0; j < chars.length; j++) {
          ctx.fillText(chars[j], cx, yCenter);
          cx += ctx.measureText(chars[j]).width + letterSpacing;
        }
      } else {
        ctx.fillText(text, x, yCenter);
      }
      ctx.restore();
    }

    function drawLeftText(text, x, y, font, color, lineHeight, maxWidth) {
      ctx.save();
      ctx.font = font;
      ctx.fillStyle = color || C_TEXT;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      if (maxWidth && ctx.measureText(text).width > maxWidth) {
        /* 简单折行 */
        var words = text.split(""), line = "", lines = [];
        for (var i = 0; i < words.length; i++) {
          var test = line + words[i];
          if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = words[i];
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        for (var l = 0; l < lines.length; l++) {
          ctx.fillText(lines[l], x, y + l * lineHeight);
        }
      } else {
        ctx.fillText(text, x, y);
      }
      ctx.restore();
    }

    function drawRoundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    /* ============ 5. 姓名 + 位置 + 赛季 ============ */
    var cx_center = W / 2;
    var nameY = PAD + 110 + 28; /* name center ~y */
    drawCenteredText(c.name, cx_center, nameY,
      "800 56px 'Archivo', 'Noto Sans SC', sans-serif", C_TEXT, 56 * 0.08);

    var curY = nameY + 32; /* 56px/2 + 5px gap approx */
    if (c.pos) {
      drawCenteredText(c.pos, cx_center, curY + 7,
        "500 14px 'Noto Sans SC', 'PingFang SC', sans-serif", C_TEXT, 14 * 0.06);
      curY += 14 + 5;
    }
    if (c.tenure) {
      drawCenteredText(c.tenure, cx_center, curY + 7 + (c.pos ? 0 : 0),
        "500 13px 'Space Mono', 'Noto Sans SC', sans-serif",
        "rgba(255,254,248,.9)", 13 * 0.04);
      curY += 13 + 4;
    }

    /* ============ 6. 参赛赛事与荣誉 ============ */
    var secY = curY + 28;
    /* 标题 */
    drawCenteredText("参赛赛事与荣誉 COMPETITIONS AND HONORS", cx_center, secY + 6,
      "700 13px 'Archivo', 'Noto Sans SC', sans-serif", C_GOLD, 13 * 0.12);
    /* 金线 */
    var lineW = W - PAD * 2;
    ctx.fillStyle = C_GOLD_FADE;
    ctx.fillRect(cx_center - lineW / 2, secY + 15, lineW, 1);
    /* 赛事内容 */
    var textX = PAD;
    var textW = lineW;
    var compY = secY + 25;
    ctx.font = "600 13px 'Noto Sans SC', 'PingFang SC', sans-serif";
    ctx.fillStyle = C_TEXT;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var compLines_arr = c.compDisplay.split("\n");
    for (var cli = 0; cli < compLines_arr.length; cli++) {
      ctx.fillText(compLines_arr[cli], textX, compY + cli * 21);
    }
    compY += compLines_arr.length * 21 + 6;
    /* 荣誉 */
    if (honorCount > 0) {
      ctx.font = "400 12px 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillStyle = C_SUB;
      for (var hi = 0; hi < c.honors.length; hi++) {
        ctx.fillText(c.honors[hi], textX, compY + hi * 21);
      }
      compY += honorCount * 21;
    }

    /* ============ 7. 数据概览四宫格 ============ */
    var gridY = compY + 20;
    /* 标题 */
    drawCenteredText("数据概览 CAREER STATS", cx_center, gridY + 7,
      "700 14px 'Archivo', 'Noto Sans SC', sans-serif", C_GOLD, 14 * 0.12);
    /* 金线 */
    ctx.fillStyle = C_GOLD_FADE;
    ctx.fillRect(cx_center - lineW / 2, gridY + 17, lineW, 1);

    /* 四宫格 */
    var gridInnerY = gridY + 29;
    var cellW = (lineW - 10) / 2; /* 2 cols, 1 gap */
    var cellH = cellInnerH;
    var labels = ["赛季", "赛事", "场次"];
    var vals = [c.seasons, c.comps, c.matches];
    if (!c.onlyStaff) { labels.push("进球"); vals.push(c.goals); }

    for (var gi = 0; gi < labels.length; gi++) {
      var col = gi % 2, row = Math.floor(gi / 2);
      var cellX = PAD + col * (cellW + 10);
      var cellY = gridInnerY + row * (cellH + 10);

      /* 单元格背景 */
      drawRoundedRect(cellX, cellY, cellW, cellH, 10);
      ctx.fillStyle = C_CELL_BG;
      ctx.fill();
      ctx.strokeStyle = C_CELL_BR;
      ctx.lineWidth = 1;
      ctx.stroke();

      /* 标签 */
      drawCenteredText(labels[gi], cellX + cellW / 2, cellY + 10 + 6,
        "500 12px 'Noto Sans SC', 'PingFang SC', sans-serif", C_LABEL);

      /* 数字 */
      drawCenteredText(String(vals[gi]), cellX + cellW / 2, cellY + 10 + 12 + 2 + 4 + 14,
        "700 28px 'Space Mono', monospace", C_TEXT);
    }

    /* ============ 8. 底部署名 ============ */
    var footerY = gridInnerY + (labels.length <= 2 ? 1 : 2) * (cellH + 10) + 24;
    /* 金线 */
    ctx.fillStyle = C_GOLD_BORDER;
    ctx.fillRect(cx_center - lineW / 2, footerY, lineW, 1);
    /* HUST LIFE FC */
    drawCenteredText("HUST LIFE FC", cx_center, footerY + 17 + 8,
      "700 17px 'Space Mono', monospace", C_TEXT, 17 * 0.14);
    /* 副标题 */
    drawCenteredText("生命科学与技术学院足球俱乐部", cx_center, footerY + 17 + 4 + 12 + 4,
      "400 12px 'Noto Sans SC', 'PingFang SC', sans-serif", C_TEXT, 12 * 0.03);

    return canvas;
  }

  /* html2canvas fallback — 保留但不再作为主路径 */
  function downloadCareerCardHtml2Canvas(name, c, btn) {
    var cardHtml = buildCareerCardHTML(c);
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:720px;border:0;";
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument;
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
      'family=Archivo:wdth,wght@62.5..125,400..900&' +
      'family=Manrope:wght@300..800&' +
      'family=Space+Mono:wght@400;700&display=swap" />' +
      '<style>*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{background:#003B5C;' +
      'font-family:"Archivo","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;}' +
      '.stage{width:680px;overflow:hidden;border-radius:14px;' +
      'box-shadow:0 12px 44px rgba(0,0,0,.28);}' +
      '.cc{width:680px;height:auto;' +
      'box-sizing:border-box;position:relative;overflow:hidden;background:#003B5C;}' +
      '</style></head><body>' +
      '<div class="stage" id="stageEl"><div class="cc" id="cardEl">' + cardHtml + '</div></div>' +
      '</body></html>'
    );
    doc.close();

    var ready = doc.fonts ? doc.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 5000); });
    Promise.race([ready, timeout]).then(function () {
      setTimeout(function () {
        var el = doc.getElementById("cardEl");
        if (!el) { cleanup(); return; }
        var inner = null;
        var kids = el.children;
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].tagName !== "SVG") { inner = kids[i]; break; }
        }
        var svg = el.querySelector("svg");
        if (inner && svg) {
          var h = inner.offsetHeight;
          svg.setAttribute("height", String(h));
          el.style.height = h + "px";
        }
        var stage = doc.getElementById("stageEl");
        if (stage) { stage.style.height = el.offsetHeight + "px"; }

        setTimeout(function () {
          html2canvas(stage, {
            scale: 2, backgroundColor: "#003B5C", logging: false, useCORS: true
          }).then(function (canvas) {
            cleanup();
            var link = document.createElement("a");
            link.download = (name || "club-career") + "-生涯纪念卡.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
            if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
          }).catch(function (e) {
            cleanup();
            if (btn) { btn.disabled = false; btn.textContent = "下载图片"; }
            alert("图片生成失败：" + (e && e.message ? e.message : "未知错误"));
          });
        }, 300);
      }, 600);
    });

    function cleanup() {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }
  }

  function initCareerCard(data) {
    CAREER_DATA = data;
    var result = document.getElementById("dataPlayerSearchResult");
    if (!result) return;
    result.addEventListener("click", function (e) {
      var t = e.target.closest(".ps-card__career");
      if (!t) return;
      e.preventDefault();
      var name = t.getAttribute("data-career");
      openCareerCard(name);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var m = document.getElementById("careerModal");
        if (m && m.classList.contains("is-open")) closeCareerCard();
      }
    });
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

    /* 构建球员检索的全量索引（全局，忽略上方筛选） */
    var allOfficial = fixtures.filter(function (m) {
      return ["华科杯", "新生杯", "毕业杯"].indexOf(m.comp) !== -1;
    });
    GLOBAL_STATS = aggregatePlayerStats(allOfficial);
    GROUP_HISTORY = data.groupHistory || null;
    ACHIEVEMENTS_DATA = data.achievements || null;
    buildRosterIndex(data.squadHistory, data.staffHistory);
    initCareerCard(data);

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

    /* 球员检索：输入框 + 按钮（全局检索，忽略上方筛选） */
    (function () {
      var input = document.getElementById("playerSearchInput");
      var btn = document.getElementById("playerSearchBtn");
      var result = document.getElementById("dataPlayerSearchResult");
      if (!input || !btn) return;
      function go() { renderPlayerSearch(input.value); }
      btn.addEventListener("click", function (e) { e.preventDefault(); go(); });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
      input.addEventListener("input", function () { if (!input.value.trim()) result.innerHTML = ""; });
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
    if (state.season !== "all" && state.comp !== "all") renderSquad(data.squadHistory, state.season, state.comp, state.team, data.teams, data.staffHistory, state.ach);

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

    var COMP_CLS = { "华科杯": "comp--hust", "新生杯": "comp--freshman", "毕业杯": "comp--graduation", "友谊赛": "comp--friendly" };
    var ORDER = ["新生杯", "华科杯", "毕业杯", "友谊赛"];
    var RES = { "W": "胜", "D": "平", "L": "负" };

    /* 全部/未选赛季 + 全部赛事 + 全部男女足 → 合并为一张表，按时间降序；缺席赛事不在此视图出现 */
    var isAll = (!filterState || !filterState.season || filterState.season === "all")
      && filterState && filterState.comp === "all" && filterState.team === "all";
    if (isAll) {
      return renderAllMatchesTable(matches, seasonAch);
    }

    /* 缺席赛事说明块：有备注但无比赛，如「未报名」「因疫情未举办」 */
    function absentHtml(c, note) {
      var compCls = COMP_CLS[c] ? " " + COMP_CLS[c] : "";
      return '<div class="comp-group comp-group--absent">' +
        '<div class="comp-group-head">' +
          '<span class="tag tag--comp' + compCls + '">' + esc(c) + '</span>' +
          (note ? '<span class="gh-ach gh-ach--absent">' + esc(note) + '</span>' : '') +
          '<span class="gh-stats">无参赛记录</span>' +
        '</div></div>';
    }

    /* 按赛事分组（仅含有比赛的赛事） */
    var byComp = {};
    matches.forEach(function (m) { if (m.comp) (byComp[m.comp] = byComp[m.comp] || []).push(m); });

    /* 空状态：若该赛季有「缺席备注」（整季无比赛、或所选赛事未举办），列出说明而非空白 */
    if (!matches.length) {
      var onlyComp = (filterState && filterState.comp && filterState.comp !== "all") ? filterState.comp : null;
      if (seasonAch) {
        var ABS_ORDER = ["新生杯", "华科杯", "毕业杯", "友谊赛"];
        var abs = onlyComp
          ? (seasonAch[onlyComp] ? [onlyComp] : [])
          : ABS_ORDER.filter(function (c) { return seasonAch[c]; });
        if (abs.length) {
          el.innerHTML = abs.map(function (c) { return absentHtml(c, seasonAch[c]); }).join("");
          return;
        }
      }
      el.innerHTML = '<p class="match__empty">该筛选条件下暂无比赛记录。</p>';
      return;
    }

    /* 有比赛的赛事 → 正常分组渲染 */
    function compBlock(c, ms) {
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

      return subgroups.map(function (sg) {
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
    }

    /* 缺席赛事（有备注、无比赛）：从 ORDER 中挑出「不在 byComp、但在 seasonAch 有备注」的赛事
     * 注意：若用户已选具体赛事（compFilter !== "all"），则不显示其他赛事的缺席块 */
    var onlyComp = (filterState && filterState.comp && filterState.comp !== "all") ? filterState.comp : null;
    var absentComps = onlyComp ? [] : ORDER.filter(function (c) { return !byComp[c] && seasonAch && seasonAch[c]; });

    el.innerHTML = ORDER.filter(function (c) { return byComp[c]; }).map(function (c) {
      return compBlock(c, byComp[c]);
    }).join("") + absentComps.map(function (c) {
      return absentHtml(c, seasonAch[c]);
    }).join("");

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
  function renderSquad(squadHistory, season, compFilter, teamFilter, teamsData, staffHistory, seasonAch) {
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

    if (!teamsArr.length) {
      var absenceNote = (seasonAch && seasonAch[compFilter]) || "";
      gridEl.innerHTML = absenceNote
        ? '<p class="match__empty">该赛季' + esc(absenceNote) + '，暂无参赛阵容。</p>'
        : '<p class="match__empty">该筛选条件下暂无参赛人员。</p>';
      tabsEl.innerHTML = ""; return;
    }

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
