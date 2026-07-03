/* Student Performance Report — parent portal.
   Data is loaded live from Google Sheets (datasource.js), with the bundled
   data.js snapshot as an offline fallback. */
(function () {
  "use strict";
  var DATA = null;          // set once report data has loaded
  var MAXSUB = 100;
  var BANNER = "Grade XII · Team Elevate 2027";   // report topic / heading

  // ---------- small helpers ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function normRoll(s) { return String(s || "").trim().toUpperCase().replace(/\s+/g, ""); }

  // find a student key in a mode case-insensitively
  function findStudent(mode, roll) {
    var m = DATA.modes[mode];
    if (!m) return null;
    if (m.students[roll]) return m.students[roll];
    var want = roll.toUpperCase();
    for (var k in m.students) if (k.toUpperCase() === want) return m.students[k];
    return null;
  }
  function modesForRoll(roll) {
    var idx = DATA.rollIndex[roll.toUpperCase()];
    return idx ? idx.slice() : [];
  }

  var currentPDF = null; // holds {mode, student} for export

  // ---------- form handling ----------
  var form = $("#lookupForm"), msg = $("#message");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!DATA) { showMsg("info", "Loading data, please wait a moment&hellip;"); return; }
    var roll = normRoll($("#roll").value);
    var mode = $("#mode").value;
    msg.className = "message"; msg.innerHTML = "";
    if (!roll) { showMsg("error", "Please enter a Roll Number."); return; }

    var student = findStudent(mode, roll);
    if (student) { renderReport(mode, student); return; }

    // not in this mode — helpful guidance
    var other = modesForRoll(roll).filter(function (m) { return m !== mode; });
    if (other.length) {
      var frag = "Roll <b>" + esc(roll) + "</b> is not listed under <b>" + esc(mode) +
        "</b>. It is available in:<br>";
      msg.className = "message info"; msg.innerHTML = frag;
      other.forEach(function (m) {
        var b = el("span", "switch", esc(m));
        b.addEventListener("click", function () {
          $("#mode").value = m;
          renderReport(m, findStudent(m, roll));
        });
        msg.appendChild(b);
      });
    } else {
      showMsg("error", "No student found with Roll Number <b>" + esc(roll) +
        "</b>. Please check and try again.");
    }
  });
  function showMsg(kind, html) { msg.className = "message " + kind; msg.innerHTML = html; }

  $("#backBtn").addEventListener("click", function () {
    $("#reportWrap").hidden = true;
    $("#lookupCard").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#printBtn").addEventListener("click", function () { window.print(); });
  $("#downloadBtn").addEventListener("click", function () {
    if (currentPDF) buildPDF(currentPDF.mode, currentPDF.student);
  });

  // ---------- rendering ----------
  function conductedExams(m) {
    return m.exams.filter(function (ex) { return m.conducted[ex]; });
  }
  function pendingExams(m) {
    return m.exams.filter(function (ex) { return !m.conducted[ex]; });
  }
  // maximum possible total = number of subjects × marks-per-subject (every student takes 6 subjects)
  function maxTotalMarks() {
    var g = DATA.modes["Bio - Maths"] || DATA.modes["Bio - CS"] || DATA.modes["Maths - CS"];
    var n = (g && g.subjects) ? g.subjects.length : 6;
    return n * MAXSUB;
  }

  function renderReport(mode, student) {
    var m = DATA.modes[mode];
    currentPDF = { mode: mode, student: student };
    var host = $("#report");
    host.innerHTML = "";
    if (m.type === "group") renderGroup(host, m, student);
    else renderAnalysis(host, m, student);
    $("#lookupCard").hidden = true;
    $("#reportWrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function infoGrid(pairs) {
    var g = el("div", "info");
    pairs.forEach(function (p) {
      var c = el("div", "cell");
      c.appendChild(el("div", "k", esc(p[0])));
      c.appendChild(el("div", "v", p[1])); // p[1] may be html
      g.appendChild(c);
    });
    return g;
  }

  function markCell(val, absent, isTop) {
    if (absent) return '<span class="mark-abs">AB</span>';
    if (val == null) return "&mdash;";
    return '<span class="your-mark' + (isTop ? " is-top" : "") + '">' + val + "</span>";
  }
  // percentage of marks obtained (one decimal, no trailing .0) e.g. 56, 63.5, 50.7
  function pctObtained(obt, max) {
    if (obt == null || !max) return null;
    return Math.round(obt / max * 1000) / 10;
  }
  function pctCell(v) {
    if (v == null) return "&mdash;";
    return '<span class="pct-pill' + (v >= 75 ? " pct-hi" : "") + '">' + v + '%</span>';
  }
  // rank badge with medal icons for top 3
  function rankBadge(rank, total) {
    if (rank == null) return "&mdash;";
    var medal = "";
    var cls = "rank-badge";
    if (rank === 1) { medal = "🥇"; cls += " rank-gold"; }
    else if (rank === 2) { medal = "🥈"; cls += " rank-silver"; }
    else if (rank === 3) { medal = "🥉"; cls += " rank-bronze"; }
    else if (rank <= 10) { cls += " rank-top10"; }
    var txt = medal + (medal ? " " : "") + rank;
    if (total) txt += " <span class='rank-of'>/ " + total + "</span>";
    return '<span class="' + cls + '">' + txt + '</span>';
  }
  // rank label text (no HTML) for PDFs
  function rankText(rank, total) {
    if (rank == null) return "—";
    return rank + (total ? " / " + total : "");
  }

  // ----- GROUP report (subject-wise) -----
  function renderGroup(host, m, s) {
    var overallCU = s.overall && s.overall["CU 1"];
    var isTopper = !!(overallCU && overallCU.rank === 1);

    var head = el("div", isTopper ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      (isTopper ? "<div class='topper-badge'>🥇 Rank 1 &middot; Class Topper</div>" : "") +
      "<h2>Student Analysis Report</h2><div class='school'>" +
      esc(m.label) + " &middot; Academic Year " + esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);
    if (isTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 across the entire cohort of " +
        DATA.modes["PE - Analysis"].classSize + " students in CU 1."));
    }

    // Section 1
    host.appendChild(el("div", "sec-title", "1. Student Information"));
    host.appendChild(infoGrid([
      ["Name", esc(s.name)],
      ["Roll Number", esc(s.rollNo)],
      ["Group / Stream", esc(m.label)],
      ["Class Strength", m.classSize + " students"],
      ["Academic Year", esc(DATA.meta.academicYear)],
      ["Report Date", new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })]
    ]));

    // Section 2 — performance
    host.appendChild(el("div", "sec-title", "2. Academic Performance"));
    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid perf");
    var exams = m.exams;
    // header
    var thead = "<thead><tr><th>Subject</th>";
    exams.forEach(function (ex) {
      thead += "<th class='" + (m.conducted[ex] ? "" : "pending-col") + "'>" +
        esc(ex) + (m.conducted[ex] ? "" : "<br><small>Pending</small>") + "</th>";
    });
    thead += "<th>Class Highest<br><small>(CU 1)</small></th><th>Percentage<br><small>(CU 1)</small></th></tr></thead>";
    var body = "<tbody>";
    m.subjects.forEach(function (code) {
      var full = m.subjectFull[code] || code;
      body += "<tr><td class='subj'>" + esc(full) + " <small style='color:#8a93a3'>(" + esc(code) + ")</small></td>";
      exams.forEach(function (ex) {
        if (!m.conducted[ex]) { body += "<td class='pending-col'>&ndash;</td>"; return; }
        var val = s.marks[ex][code];
        var abs = (val == null);   // blank in a conducted exam = absent
        var cs = m.classStats[ex].subjects[code];
        var isTop = cs && val != null && val === cs.max;
        body += "<td>" + markCell(val, abs, isTop) + "</td>";
      });
      // class highest (CU1)
      var csCU = m.classStats["CU 1"].subjects[code];
      if (csCU) {
        body += "<td><b>" + csCU.max + "</b></td>";
      } else body += "<td>&mdash;</td>";
      // percentage obtained (CU1) = mark / max × 100
      var mkCU = s.marks["CU 1"][code];
      body += "<td>" + pctCell(mkCU != null ? pctObtained(mkCU, MAXSUB) : null) + "</td>";
      body += "</tr>";
    });
    // total row
    body += "<tr class='total-row'><td class='subj'>Total</td>";
    exams.forEach(function (ex) {
      if (!m.conducted[ex]) { body += "<td class='pending-col'>&ndash;</td>"; return; }
      body += "<td>" + (s.marks[ex].Total != null ? s.marks[ex].Total : "&mdash;") + "</td>";
    });
    var totMax = m.classStats["CU 1"].total ? m.classStats["CU 1"].total.max : null;
    body += "<td>" + (totMax != null ? totMax : "&mdash;") + "</td>";
    var totPct = pctObtained(s.marks["CU 1"].Total, m.subjects.length * MAXSUB);
    body += "<td>" + pctCell(totPct) + "</td></tr>";
    body += "</tbody>";
    tbl.innerHTML = thead + body;
    scroll.appendChild(tbl);
    host.appendChild(scroll);

    // summary cards (based on CU 1)
    var cards = el("div", "cards");
    var maxTotal = m.subjects.length * MAXSUB;
    cards.appendChild(card((s.marks["CU 1"].Total != null ? s.marks["CU 1"].Total : "—") + " / " + maxTotal, "Total Marks (CU 1)"));
    if (overallCU && overallCU.rank) {
      var rankCard = el("div", "card" + (overallCU.rank <= 3 ? " card-rank card-rank-" + overallCU.rank : ""));
      rankCard.innerHTML = "<div class='num'>" + rankBadge(overallCU.rank, DATA.modes["PE - Analysis"].classSize) + "</div><div class='lbl'>Rank (whole cohort)</div>";
      cards.appendChild(rankCard);
    }
    var overallPct = pctObtained(s.marks["CU 1"].Total, maxTotal);
    cards.appendChild(card((overallPct != null ? overallPct + "%" : "—"), "Overall Percentage"));
    host.appendChild(cards);

    pendingNote(host, m);
  }

  // ----- ANALYSIS report (totals + ranks) -----
  function renderAnalysis(host, m, s) {
    var isTopper = !!(s.exams["CU 1"] && s.exams["CU 1"].rank === 1);

    var head = el("div", isTopper ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      (isTopper ? "<div class='topper-badge'>🥇 Rank 1 &middot; Class Topper</div>" : "") +
      "<h2>Student Analysis Report</h2><div class='school'>PE - Analysis &middot; Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);
    if (isTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 across the entire cohort of " +
        m.classSize + " students in CU 1."));
    }

    host.appendChild(el("div", "sec-title", "1. Student Information"));
    host.appendChild(infoGrid([
      ["Name", esc(s.name)],
      ["Roll Number", esc(s.rollNo)],
      ["Stream", esc((s.stream || []).join(", ") || "—")],
      ["Cohort Size", m.classSize + " students"],
      ["Academic Year", esc(DATA.meta.academicYear)],
      ["Report Date", new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })]
    ]));

    host.appendChild(el("div", "sec-title", "2. Consolidated Performance & Rank"));
    var maxTot = maxTotalMarks();
    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid");
    var h = "<thead><tr><th>Exam</th><th>Marks Obtained<br><small>(out of " + maxTot +
      ")</small></th><th>Rank in Cohort</th><th>Class Highest<br><small>(out of " + maxTot +
      ")</small></th></tr></thead><tbody>";
    m.exams.forEach(function (ex) {
      var e = s.exams[ex];
      if (!m.conducted[ex]) {
        h += "<tr><td class='subj'>" + esc(ex) + "</td><td class='pending-col' colspan='3'>Not conducted yet</td></tr>";
        return;
      }
      var top = m.topper[ex];
      h += "<tr><td class='subj'>" + esc(ex) + "</td><td class='your-mark" + (e.rank === 1 ? " is-top" : "") + "'>" +
        e.total + " / " + maxTot + "</td><td>" + rankBadge(e.rank, m.classSize) + "</td><td>" +
        (top ? top.total + " / " + maxTot : "—") + "</td></tr>";
    });
    h += "</tbody>";
    tbl.innerHTML = h; scroll.appendChild(tbl); host.appendChild(scroll);

    var cards = el("div", "cards");
    var cu = s.exams["CU 1"];
    cards.appendChild(card(cu.total + " / " + maxTot, "Total Marks (CU 1)"));
    // rank card with special styling
    var rankCard = el("div", "card" + (cu.rank != null && cu.rank <= 3 ? " card-rank card-rank-" + cu.rank : ""));
    rankCard.innerHTML = "<div class='num'>" + rankBadge(cu.rank, m.classSize) + "</div><div class='lbl'>Rank in Cohort</div>";
    cards.appendChild(rankCard);
    var pctObt = pctObtained(cu.total, maxTot);
    cards.appendChild(card(pctObt != null ? pctObt + "%" : "—", "Percentage"));
    host.appendChild(cards);

    pendingNote(host, m);
  }

  function card(num, lbl) {
    var c = el("div", "card");
    c.appendChild(el("div", "num", String(num)));
    c.appendChild(el("div", "lbl", esc(lbl)));
    return c;
  }
  function pendingNote(host, m) {
    var pend = pendingExams(m);
    if (!pend.length) return;
    var p = el("p", "note-pending");
    p.innerHTML = "<b>Note:</b> Only <b>CU 1</b> has been conducted so far. The following are pending and will appear once marks are entered: " +
      pend.map(esc).join(", ") + ".";
    host.appendChild(p);
  }

  // ---------- PDF export (jsPDF; tables are hand-drawn — see drawTable) ----------
  function buildPDF(mode, s) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var m = DATA.modes[mode];
    var W = doc.internal.pageSize.getWidth();
    var GOLD = [201, 154, 30];

    var rankCU1 = (m.type === "group") ? (s.overall && s.overall["CU 1"] && s.overall["CU 1"].rank)
                                        : (s.exams["CU 1"] && s.exams["CU 1"].rank);
    var isTopper = rankCU1 === 1;

    // header band
    doc.setFillColor.apply(doc, isTopper ? GOLD : [183, 22, 28]);
    doc.rect(0, 0, W, 6, "F");
    // topic / banner
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(39, 48, 67);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isTopper) {
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - 70, 40, 140, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 · CLASS TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    // title
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    // subtitle
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(m.label + "  ·  Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

    var y = infoStartY;
    if (isTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Congratulations - " + s.name + " holds Rank 1 across the entire cohort in CU 1.",
        W / 2, infoStartY, { align: "center" });
      y = infoStartY + 14;
    }

    // info table
    var info;
    if (m.type === "group") {
      info = [
        ["Name", s.name, "Roll Number", s.rollNo],
        ["Group / Stream", m.label, "Class Strength", m.classSize + " students"],
        ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
      ];
    } else {
      info = [
        ["Name", s.name, "Roll Number", s.rollNo],
        ["Stream", (s.stream || []).join(", ") || "-", "Cohort Size", m.classSize + " students"],
        ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
      ];
    }
    var usable = W - 80, labelW = 95, valueW = (usable - labelW * 2) / 2;
    y = drawInfoTable(doc, 40, y, [labelW, valueW, labelW, valueW], info);

    if (m.type === "group") groupPDF(doc, m, s, y);
    else analysisPDF(doc, m, s, y);

    doc.save("Report_" + s.rollNo + "_" + mode.replace(/[^A-Za-z0-9]+/g, "-") + ".pdf");
  }

  function sectionBar(doc, y, text) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFillColor(251, 233, 234);
    doc.rect(40, y, W - 80, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(143, 16, 21);
    doc.text(text, 46, y + 13, { baseline: "middle" });
    return y + 24;
  }

  // three (or two) glanceable stat boxes, mirrors the on-screen summary cards
  function statBoxes(doc, y, boxes) {
    var W = doc.internal.pageSize.getWidth();
    var margin = 40, gap = 12, n = boxes.length;
    var boxW = (W - margin * 2 - gap * (n - 1)) / n, boxH = 44;
    boxes.forEach(function (b, i) {
      var x = margin + i * (boxW + gap);
      doc.setFillColor(250, 250, 252); doc.setDrawColor(220, 223, 228);
      doc.roundedRect(x, y, boxW, boxH, 4, 4, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(32, 36, 44);
      doc.text(String(b.num), x + boxW / 2, y + 20, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128);
      doc.text(b.label, x + boxW / 2, y + 34, { align: "center" });
    });
    return y + boxH + 16;
  }

  // ---- hand-drawn tables: every cell gets an explicit, independent y-position
  // (no shared library layout state), so there's no risk of one cell's position
  // leaking into another's.
  function drawInfoTable(doc, x0, y, colWidths, rows) {
    var rowH = 21, pad = 6;
    rows.forEach(function (r) {
      var x = x0;
      r.forEach(function (val, i) {
        var w = colWidths[i], isLabel = (i % 2 === 0);
        doc.setFillColor.apply(doc, isLabel ? [247, 249, 252] : [255, 255, 255]);
        doc.rect(x, y, w, rowH, "F");
        doc.setDrawColor(217, 222, 231); doc.setLineWidth(0.75);
        doc.rect(x, y, w, rowH, "S");
        doc.setFont("helvetica", isLabel ? "bold" : "normal");
        doc.setFontSize(9);
        doc.setTextColor(isLabel ? 55 : 40);
        doc.text(String(val), x + pad, y + rowH / 2, { baseline: "middle" });
        x += w;
      });
      y += rowH;
    });
    return y;
  }

  function drawTable(doc, o) {
    var x0 = o.x != null ? o.x : 40;
    var colW = o.colWidths, aligns = o.aligns, pad = 6;
    var headH = o.headRowHeight || 20, rowH = o.rowHeight || 19;
    var y = o.startY;

    function drawRow(cells, h, sty) {
      var x = x0;
      cells.forEach(function (cellData, i) {
        var w = colW[i];
        var text = (typeof cellData === "object" && cellData !== null) ? cellData.text : cellData;
        var isTop = (typeof cellData === "object" && cellData !== null) ? cellData.isTop : false;
        doc.setFillColor.apply(doc, sty.fill);
        doc.rect(x, y, w, h, "F");
        doc.setDrawColor(217, 222, 231); doc.setLineWidth(0.75);
        doc.rect(x, y, w, h, "S");
        var bold = sty.bold || (sty.boldFirst && i === 0) || isTop;
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(sty.fontSize);
        doc.setTextColor.apply(doc, isTop ? [154, 106, 0] : sty.textColor);
        var align = aligns[i];
        if (isTop && align === "center") {
          var tw = doc.getTextWidth(String(text));
          var totalW = tw + 4 + 18;
          var startX = x + w / 2 - totalW / 2;
          
          doc.text(String(text), startX, y + h / 2, { align: "left", baseline: "middle" });
          
          doc.setFillColor(253, 246, 227);
          doc.setDrawColor(224, 200, 136);
          doc.setLineWidth(0.5);
          var badgeX = startX + tw + 4;
          doc.roundedRect(badgeX, y + h / 2 - 4.5, 18, 9, 2, 2, "FD");
          
          doc.setFontSize(5);
          doc.setFont("helvetica", "bold");
          doc.text("TOP", badgeX + 9, y + h / 2, { align: "center", baseline: "middle" });
        } else {
          var tx = align === "left" ? x + pad : x + w / 2;
          doc.text(String(text), tx, y + h / 2, { align: align === "left" ? "left" : "center", baseline: "middle" });
        }
        x += w;
      });
      y += h;
    }

    if (o.head) drawRow(o.head, headH, { fill: [242, 244, 248], textColor: [51, 64, 92], bold: true, fontSize: o.headFontSize || o.fontSize });
    o.body.forEach(function (r) { drawRow(r, rowH, { fill: [255, 255, 255], textColor: [49, 53, 62], boldFirst: true, fontSize: o.fontSize }); });
    if (o.foot) drawRow(o.foot, rowH, { fill: [255, 247, 230], textColor: [20, 20, 20], bold: true, fontSize: o.fontSize });
    return y;
  }

  function groupPDF(doc, m, s, startY) {
    var exams = conductedExams(m);   // only show exams that actually have marks
    var head = ["Subject"].concat(exams).concat(["Class Highest", "Percentage"]);
    var rows = [];
    m.subjects.forEach(function (code) {
      var r = [(m.subjectFull[code] || code) + " (" + code + ")"];
      exams.forEach(function (ex) {
        var v = s.marks[ex][code];
        var cs = m.classStats[ex] && m.classStats[ex].subjects[code];
        var isTop = cs && v != null && v === cs.max;
        r.push(v == null ? "AB" : (isTop ? { text: String(v), isTop: true } : String(v)));
      });
      var cs = m.classStats["CU 1"].subjects[code];
      r.push(cs ? String(cs.max) : "-");
      var mkCU = s.marks["CU 1"][code];
      r.push(mkCU == null ? "-" : pctObtained(mkCU, MAXSUB) + "%");
      rows.push(r);
    });
    var totRow = ["Total"];
    exams.forEach(function (ex) { totRow.push(String(s.marks[ex].Total)); });
    var maxTotal = m.subjects.length * MAXSUB;
    totRow.push(m.classStats["CU 1"].total ? String(m.classStats["CU 1"].total.max) : "-");
    var tp = pctObtained(s.marks["CU 1"].Total, maxTotal);
    totRow.push(tp == null ? "-" : tp + "%");

    var perfColW = [140].concat(exams.map(function () { return 65; })).concat([90, 90]);
    var perfAligns = ["left"].concat(exams.map(function () { return "center"; })).concat(["center", "center"]);

    var y = sectionBar(doc, startY + 14, "Academic Performance  ·  marks out of " + MAXSUB + " per subject");
    y = drawTable(doc, { startY: y, colWidths: perfColW, aligns: perfAligns, fontSize: 8.5, head: head, body: rows, foot: totRow });

    // summary — same numbers as on screen, so the PDF isn't missing anything the parent already saw
    var overallCU = s.overall && s.overall["CU 1"];
    var boxes = [{ num: s.marks["CU 1"].Total + " / " + maxTotal, label: "Total Marks (CU 1)" }];
    if (overallCU && overallCU.rank != null) {
      boxes.push({ num: rankText(overallCU.rank, DATA.modes["PE - Analysis"].classSize), label: "Rank (whole cohort)" });
    }
    boxes.push({ num: (tp != null ? tp + "%" : "-"), label: "Percentage (CU 1)" });
    y = statBoxes(doc, y + 14, boxes);

    footerNote(doc, m, y);
  }

  function analysisPDF(doc, m, s, startY) {
    var y = sectionBar(doc, startY + 14, "Consolidated Performance & Rank");
    var maxTot = maxTotalMarks();
    var rows = conductedExams(m).map(function (ex) {
      var e = s.exams[ex];
      var top = m.topper[ex];
      var pct = pctObtained(e.total, maxTot);
      var marksStr = e.total + " / " + maxTot;
      var isTop = (e.rank === 1);
      return [ex, isTop ? { text: marksStr, isTop: true } : marksStr, rankText(e.rank, m.classSize),
        top ? top.total + " / " + maxTot : "-", pct != null ? pct + "%" : "-"];
    });
    y = drawTable(doc, {
      startY: y, colWidths: [75, 110, 100, 110, 85], aligns: ["left", "center", "center", "center", "center"],
      fontSize: 9, head: ["Exam", "Marks Obtained", "Rank in Cohort", "Class Highest", "Percentage"], body: rows
    });

    var cu = s.exams["CU 1"];
    var pctCU = pctObtained(cu.total, maxTot);
    var boxes = [
      { num: cu.total + " / " + maxTot, label: "Total Marks (CU 1)" },
      { num: rankText(cu.rank, m.classSize), label: "Rank in Cohort" },
      { num: (pctCU != null ? pctCU + "%" : "-"), label: "Percentage" }
    ];
    y = statBoxes(doc, y + 14, boxes);
    footerNote(doc, m, y);
  }

  function footerNote(doc, m, y) {
    var pend = pendingExams(m);
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
    if (pend.length) {
      doc.text("Note: Only CU 1 has been conducted. Pending: " + pend.join(", ") + ".", 40, y, { maxWidth: doc.internal.pageSize.getWidth() - 80 });
      y += 12;
    }
  }

  function today() {
    return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  // uppercase the roll field as the user types
  $("#roll").addEventListener("input", function () {
    var p = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(p, p);
  });

  // ---------- data status pill ----------
  function setStatus(state, text, title) {
    var pill = $("#statusPill");
    pill.className = "status-pill " + state;
    $("#statusText").textContent = text;
    if (title) pill.title = title;
  }
  function fmtTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- load report data (live first, snapshot fallback) ----------
  function applyData(res) {
    DATA = res.data;
    MAXSUB = (DATA.meta && DATA.meta.maxPerSubject) || 100;
    $("#submitBtn").disabled = false;
    if (res.live) {
      setStatus("live", "Live data" + (res.when ? " · " + fmtTime(res.when) : ""),
        "Loaded live from Google Sheets. Click to refresh.");
    } else {
      setStatus("offline", "Offline snapshot",
        "Couldn't reach Google Sheets (" + (res.error || "offline") +
        "). Showing the bundled snapshot. Click to retry.");
    }
  }

  function load(isRefresh) {
    setStatus("loading", isRefresh ? "Refreshing…" : "Connecting…", "Contacting Google Sheets");
    return window.ReportSource.loadReportData().then(applyData).catch(function (e) {
      setStatus("offline", "Data unavailable", String(e && e.message || e));
    });
  }

  // click the pill to refresh live data on demand
  $("#statusPill").addEventListener("click", function () {
    if ($("#statusPill").classList.contains("loading")) return;
    load(true);
  });

  load(false);
})();
