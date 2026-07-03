import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

pdf_functions = """
  // ---------- PDF export (jsPDF) ----------
  function buildExamPDF(m, s, exam) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth();
    var GOLD = [201, 154, 30];

    var overallEx = s.overall && s.overall[exam];
    var isSchoolTopper = !!(overallEx && overallEx.rank === 1);
    var isStreamTopper = !!(overallEx && overallEx.domainRank === 1);

    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isSchoolTopper) {
      doc.setFillColor(255, 240, 180); doc.setDrawColor.apply(doc, [204, 153, 0]);
      doc.roundedRect(W / 2 - 80, 40, 160, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("OVERALL SCHOOL TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    } else if (isStreamTopper) {
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - 70, 40, 140, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 \\u00B7 STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(m.label + " \\u00B7 " + exam + " \\u00B7 Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

    var y = infoStartY;
    if (isSchoolTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Outstanding Achievement - " + s.name + " holds Rank 1 out of the entire school in " + exam + ".", W / 2, y, { align: "center" });
      y += 14;
    } else if (isStreamTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Congratulations - " + s.name + " holds Rank 1 in their stream in " + exam + ".", W / 2, y, { align: "center" });
      y += 14;
    }

    var info = [
      ["Name", s.name, "Roll Number", s.rollNo],
      ["Stream", m.label, "Stream Size", (overallEx ? overallEx.domainSize : "?") + " students"],
      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
    ];
    y = drawTable(doc, {
      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],
      fontSize: 9.5, body: info
    });

    y = sectionBar(doc, y + 14, "Academic Performance \\u00B7 marks out of " + MAXSUB + " per subject");
    
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
    if (overallEx && overallEx.domainRank != null) {
      boxes.push({ num: rankText(overallEx.domainRank, overallEx.domainSize), label: "Rank (in stream)" });
    }
    boxes.push({ num: (tp != null ? tp + "%" : "-"), label: "Percentage" });
    y = statBoxes(doc, y + 14, boxes);

    var fn = s.name.replace(/\\s+/g, "_") + "_" + exam.replace(/\\s+/g, "") + "_Report.pdf";
    doc.save(fn);
  }

  function buildPDF(mode, student) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var m = DATA.modes[mode];
    var W = doc.internal.pageSize.getWidth();
    var GOLD = [201, 154, 30];
    
    var isSchoolTopper = !!(student.exams["CU 1"] && student.exams["CU 1"].rank === 1);
    var isStreamTopper = !!(student.exams["CU 1"] && student.exams["CU 1"].domainRank === 1);

    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isSchoolTopper) {
      doc.setFillColor(255, 240, 180); doc.setDrawColor.apply(doc, [204, 153, 0]);
      doc.roundedRect(W / 2 - 80, 40, 160, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("OVERALL SCHOOL TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    } else if (isStreamTopper) {
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - 70, 40, 140, 16, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 \\u00B7 STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text("PE - Analysis \\u00B7 Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

    var y = infoStartY;
    if (isSchoolTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Outstanding Achievement - " + student.name + " holds Rank 1 out of the entire school in CU 1.", W / 2, y, { align: "center" });
      y += 14;
    } else if (isStreamTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Congratulations - " + student.name + " holds Rank 1 in their stream in CU 1.", W / 2, y, { align: "center" });
      y += 14;
    }

    var info = [
      ["Name", student.name, "Roll Number", student.rollNo],
      ["Stream", (student.stream || []).join("-") || "\\u2014", "Stream Size", student.exams["CU 1"].domainSize + " students"],
      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
    ];
    y = drawTable(doc, {
      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],
      fontSize: 9.5, body: info
    });
    analysisPDF(doc, DATA.modes[mode], student, y);
    var fn = student.name.replace(/\\s+/g, "_") + "_PE-Analysis_Report.pdf";
    doc.save(fn);
  }

  function analysisPDF(doc, m, s, startY) {
    var y = sectionBar(doc, startY + 14, "Consolidated Performance & Rank");
    var maxTot = maxTotalMarks();
    var rows = conductedExams(m).map(function (ex) {
      var e = s.exams[ex];
      var top = m.topper[ex];
      var pct = pctObtained(e.total, maxTot);
      var marksStr = e.total + " / " + maxTot;
      var isTop = (e.domainRank === 1);
      return [ex, isTop ? { text: marksStr, isTop: true } : marksStr, rankText(e.domainRank, e.domainSize),
        top ? top.total + " / " + maxTot : "-", pct != null ? pct + "%" : "-"];
    });
    y = drawTable(doc, {
      startY: y, colWidths: [75, 110, 100, 110, 85], aligns: ["left", "center", "center", "center", "center"],
      fontSize: 9, head: ["Exam", "Marks Obtained", "Rank (in stream)", "Class Highest", "Percentage"], body: rows
    });

    var cu = s.exams["CU 1"];
    var pctCU = pctObtained(cu.total, maxTot);
    var boxes = [
      { num: cu.total + " / " + maxTot, label: "Total Marks (CU 1)" },
      { num: rankText(cu.domainRank, cu.domainSize), label: "Rank (in stream)" },
      { num: (pctCU != null ? pctCU + "%" : "-"), label: "Percentage" }
    ];
    y = statBoxes(doc, y + 14, boxes);
    footerNote(doc, m, y);
  }
"""

start_idx = content.find('  // ---------- PDF export')
end_idx = content.find('  function footerNote')

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + pdf_functions + '\n' + content[end_idx:]
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)
else:
    print("Failed to find boundaries")
