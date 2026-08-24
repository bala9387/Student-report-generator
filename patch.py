import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update form submission
form_logic = """
  var form = $("#lookupForm"), msg = $("#message");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!DATA) { showMsg("info", "Loading data, please wait a moment&hellip;"); return; }
    var roll = normRoll($("#roll").value);
    var mode = $("#mode").value;
    msg.className = "message"; msg.innerHTML = "";
    if (!roll) { showMsg("error", "Please enter a Roll Number."); return; }

    if (mode === "PE - Analysis") {
      var student = findStudent(mode, roll);
      if (student) { renderReport(mode, student); return; }
    } else {
      var streams = modesForRoll(roll);
      var stream = streams.find(function(m) { return m !== "PE - Analysis"; });
      if (stream) {
        var groupMode = DATA.modes[stream];
        var s = groupMode.students[roll.toUpperCase()];
        if (s) {
          if (!groupMode.conducted[mode]) {
            showMsg("info", "Exam <b>" + esc(mode) + "</b> has not been conducted yet. Only CU 1 data is available.");
            return;
          }
          renderExamReport(groupMode, s, mode);
          return;
        }
      }
    }
    showMsg("error", "No student found with Roll Number <b>" + esc(roll) + "</b>.");
  });
"""
content = re.sub(r'  var form = \$\("#lookupForm"\).*?  function showMsg\(kind, html\) \{ msg\.className = "message " \+ kind; msg\.innerHTML = html; \}', form_logic + '\n  function showMsg(kind, html) { msg.className = "message " + kind; msg.innerHTML = html; }', content, flags=re.DOTALL)

# 2. Update download button
dl_logic = """
  $("#downloadBtn").addEventListener("click", function () {
    if (currentPDF) {
      if (currentPDF.type === "exam") buildExamPDF(currentPDF.mode, currentPDF.student, currentPDF.exam);
      else buildPDF(currentPDF.mode, currentPDF.student);
    }
  });
"""
content = re.sub(r'  \$\("#downloadBtn"\)\.addEventListener.*?\}\);', dl_logic.strip(), content, flags=re.DOTALL)


# 3. Replace renderGroup with renderExamReport
render_exam = """
  // ----- EXAM report (single exam, subject-wise) -----
  function renderExamReport(m, s, exam) {
    var host = $("#report");
    host.innerHTML = "";
    currentPDF = { type: "exam", mode: m, student: s, exam: exam };
    
    var overallEx = s.overall && s.overall[exam];
    var isTopper = !!(overallEx && overallEx.rank === 1);

    var head = el("div", isTopper ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      (isTopper ? "<div class='topper-badge'>🥇 Rank 1 &middot; Class Topper</div>" : "") +
      "<h2>Student Analysis Report</h2><div class='school'>" +
      esc(m.label) + " &middot; " + esc(exam) + " &middot; Academic Year " + esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);

    if (isTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 across the entire cohort of " +
        DATA.modes["PE - Analysis"].classSize + " students in " + esc(exam) + "."));
    }

    host.appendChild(el("div", "sec-title", "1. Student Information"));
    host.appendChild(infoGrid([
      ["Name", esc(s.name)],
      ["Roll Number", esc(s.rollNo)],
      ["Stream", esc(m.label)],
      ["Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"],
      ["Academic Year", esc(DATA.meta.academicYear)],
      ["Report Date", today()]
    ]));

    host.appendChild(el("div", "sec-title", "2. Academic Performance"));
    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid perf");
    var thead = "<thead><tr><th>Subject</th><th>Marks Obtained</th><th>Class Highest</th><th>Percentage</th></tr></thead>";
    var body = "<tbody>";
    
    m.subjects.forEach(function (code) {
      var full = m.subjectFull[code] || code;
      body += "<tr><td class='subj'>" + esc(full) + " <small style='color:#8a93a3'>(" + esc(code) + ")</small></td>";
      var val = s.marks[exam][code];
      var abs = (val == null);
      var cs = m.classStats[exam].subjects[code];
      var isTop = cs && val != null && val === cs.max;
      body += "<td>" + markCell(val, abs, isTop) + "</td>";
      body += "<td>" + (cs ? "<b>" + cs.max + "</b>" : "&mdash;") + "</td>";
      body += "<td>" + pctCell(val != null ? pctObtained(val, MAXSUB) : null) + "</td></tr>";
    });
    
    body += "<tr class='total-row'><td class='subj'>Total</td>";
    var tot = s.marks[exam].Total;
    body += "<td>" + (tot != null ? tot : "&mdash;") + "</td>";
    var totMax = m.classStats[exam].total ? m.classStats[exam].total.max : null;
    body += "<td>" + (totMax != null ? totMax : "&mdash;") + "</td>";
    body += "<td>" + pctCell(tot != null ? pctObtained(tot, m.subjects.length * MAXSUB) : null) + "</td></tr>";
    
    body += "</tbody>";
    tbl.innerHTML = thead + body;
    scroll.appendChild(tbl);
    host.appendChild(scroll);

    var cards = el("div", "cards");
    var maxTotal = m.subjects.length * MAXSUB;
    cards.appendChild(card((tot != null ? tot : "—") + " / " + maxTotal, "Total Marks"));
    
    if (overallEx && overallEx.rank) {
      var rankCard = el("div", "card" + (overallEx.rank <= 3 ? " card-rank card-rank-" + overallEx.rank : ""));
      rankCard.innerHTML = "<div class='num'>" + rankBadge(overallEx.rank, DATA.modes["PE - Analysis"].classSize) + "</div><div class='lbl'>Rank (whole cohort)</div>";
      cards.appendChild(rankCard);
    }
    cards.appendChild(card(tot != null ? pctObtained(tot, maxTotal) + "%" : "—", "Overall Percentage"));
    host.appendChild(cards);

    $("#lookupCard").hidden = true;
    $("#reportWrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
"""

content = re.sub(r'  // ----- GROUP report \(subject-wise\) -----.*?  // ----- ANALYSIS report \(totals \+ ranks\) -----', render_exam + '\n  // ----- ANALYSIS report (totals + ranks) -----', content, flags=re.DOTALL)

# 4. Replace buildPDF/groupPDF with buildExamPDF/examPDF
build_exam_pdf = """
  function buildExamPDF(m, s, exam) {
    var doc = new jspdf.jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    doc.addFileToVFS("Inter-Regular.ttf", INTER_BASE64);
    doc.addFont("Inter-Regular.ttf", "helvetica", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", INTER_BOLD_BASE64);
    doc.addFont("Inter-Bold.ttf", "helvetica", "bold");
    doc.addFileToVFS("Inter-Italic.ttf", INTER_ITALIC_BASE64);
    doc.addFont("Inter-Italic.ttf", "helvetica", "italic");
    
    var W = doc.internal.pageSize.getWidth();
    var overallEx = s.overall && s.overall[exam];
    var isTopper = !!(overallEx && overallEx.rank === 1);

    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isTopper) {
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - 70, 40, 140, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 · CLASS TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(m.label + " · " + exam + " · Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

    var y = infoStartY;
    if (isTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Congratulations - " + s.name + " holds Rank 1 across the entire cohort in " + exam + ".", W / 2, y, { align: "center" });
      y += 14;
    }

    var info = [
      ["Name", s.name, "Roll Number", s.rollNo],
      ["Stream", m.label, "Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"],
      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
    ];
    y = drawTable(doc, {
      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],
      fontSize: 9.5, body: info
    });

    y = sectionBar(doc, y + 14, "Academic Performance · marks out of " + MAXSUB + " per subject");
    
    var head = ["Subject", "Marks Obtained", "Class Highest", "Percentage"];
    var rows = [];
    m.subjects.forEach(function (code) {
      var r = [(m.subjectFull[code] || code) + " (" + code + ")"];
      var v = s.marks[exam][code];
      var cs = m.classStats[exam] && m.classStats[exam].subjects[code];
      var isTop = cs && v != null && v === cs.max;
      r.push(v == null ? "AB" : (isTop ? { text: String(v), isTop: true } : String(v)));
      r.push(cs ? String(cs.max) : "-");
      r.push(v == null ? "-" : Math.round(v / MAXSUB * 1000)/10 + "%");
      rows.push(r);
    });
    var totRow = ["Total"];
    var tot = s.marks[exam].Total;
    totRow.push(tot != null ? String(tot) : "-");
    var maxTotal = m.subjects.length * MAXSUB;
    totRow.push(m.classStats[exam].total ? String(m.classStats[exam].total.max) : "-");
    var tp = tot != null ? Math.round(tot / maxTotal * 1000)/10 : null;
    totRow.push(tp == null ? "-" : tp + "%");

    y = drawTable(doc, { startY: y, colWidths: [140, 110, 115, 115], aligns: ["left", "center", "center", "center"], fontSize: 9, head: head, body: rows, foot: totRow });

    var boxes = [{ num: (tot != null ? tot : "-") + " / " + maxTotal, label: "Total Marks" }];
    if (overallEx && overallEx.rank != null) {
      boxes.push({ num: rankText(overallEx.rank, DATA.modes["PE - Analysis"].classSize), label: "Rank (whole cohort)" });
    }
    boxes.push({ num: (tp != null ? tp + "%" : "-"), label: "Percentage" });
    y = statBoxes(doc, y + 14, boxes);

    var fn = s.name.replace(/\\\s+/g, "_") + "_" + exam.replace(/\\\s+/g, "") + "_Report.pdf";
    doc.save(fn);
  }
"""

content = re.sub(r'  function groupPDF\(doc, m, s, startY\) \{.*?  function analysisPDF', build_exam_pdf + '\n  function analysisPDF', content, flags=re.DOTALL)
content = re.sub(r'  function buildPDF\(mode, student\) \{.*?  \}', '  function buildPDF(mode, student) {\n    var doc = new jspdf.jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });\n    doc.addFileToVFS("Inter-Regular.ttf", INTER_BASE64);\n    doc.addFont("Inter-Regular.ttf", "helvetica", "normal");\n    doc.addFileToVFS("Inter-Bold.ttf", INTER_BOLD_BASE64);\n    doc.addFont("Inter-Bold.ttf", "helvetica", "bold");\n    doc.addFileToVFS("Inter-Italic.ttf", INTER_ITALIC_BASE64);\n    doc.addFont("Inter-Italic.ttf", "helvetica", "italic");\n    \n    var W = doc.internal.pageSize.getWidth();\n    var isTopper = !!(student.exams["CU 1"] && student.exams["CU 1"].rank === 1);\n    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");\n    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");\n    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);\n    doc.text(BANNER, W / 2, 32, { align: "center" });\n\n    var titleY = 52, subY = 68, infoStartY = 84;\n    if (isTopper) {\n      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);\n      doc.roundedRect(W / 2 - 70, 40, 140, 16, 2, 2, "FD");\n      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);\n      doc.text("RANK 1 · CLASS TOPPER", W / 2, 50.5, { align: "center" });\n      titleY = 72; subY = 88; infoStartY = 100;\n    }\n\n    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);\n    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });\n    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);\n    doc.text("PE - Analysis · Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });\n\n    var y = infoStartY;\n    if (isTopper) {\n      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);\n      doc.text("Congratulations - " + student.name + " holds Rank 1 across the entire cohort in CU 1.", W / 2, y, { align: "center" });\n      y += 14;\n    }\n\n    var info = [\n      ["Name", student.name, "Roll Number", student.rollNo],\n      ["Stream", (student.stream || []).join(", ") || "—", "Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"],\n      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]\n    ];\n    y = drawTable(doc, {\n      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],\n      fontSize: 9.5, body: info\n    });\n    analysisPDF(doc, DATA.modes[mode], student, y);\n    var fn = student.name.replace(/\\\s+/g, "_") + "_PE-Analysis_Report.pdf";\n    doc.save(fn);\n  }', content, flags=re.DOTALL)


with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
