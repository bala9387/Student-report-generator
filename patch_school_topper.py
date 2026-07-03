import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# For renderExamReport
html_topper_logic = """
    var isSchoolTopper = !!(overallEx && overallEx.rank === 1);
    var isStreamTopper = !!(overallEx && overallEx.domainRank === 1);
    var topperHtml = "";
    if (isSchoolTopper) {
      topperHtml = "<div class='topper-badge' style='background:#ffd700; color:#5c4000; font-size:1.05em; font-weight:800; border:1px solid #cca100; box-shadow:0 2px 8px rgba(255,215,0,0.4)'>🏆 OVERALL SCHOOL TOPPER</div>";
    } else if (isStreamTopper) {
      topperHtml = "<div class='topper-badge'>🥇 Rank 1 &middot; Stream Topper</div>";
    }

    var head = el("div", (isSchoolTopper || isStreamTopper) ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      topperHtml +
      "<h2>Student Analysis Report</h2><div class='school'>" +
      esc(m.label) + " &middot; " + esc(exam) + " &middot; Academic Year " + esc(DATA.meta.academicYear) + "</div>";
"""

content = re.sub(
    r'    var isTopper = !!\(overallEx && overallEx\.domainRank === 1\);\n\n    var head = el\("div", isTopper \? "rep-head rep-head-top" : "rep-head"\);\n    head\.innerHTML = "<div class=\'rep-banner\'>" \+ esc\(BANNER\) \+ "</div>" \+\n      \(isTopper \? "<div class=\'topper-badge\'>🥇 Rank 1 &middot; Class Topper</div>" : ""\) \+\n      "<h2>Student Analysis Report</h2><div class=\'school\'>" \+\n      esc\(m\.label\) \+ " &middot; " \+ esc\(exam\) \+ " &middot; Academic Year " \+ esc\(DATA\.meta\.academicYear\) \+ "</div>";',
    html_topper_logic.strip(),
    content
)

# For renderExamReport greeting text
greeting_logic = """
    if (isSchoolTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Outstanding Achievement!</b> " + esc(s.name) + " holds Rank 1 out of the entire school (" + DATA.modes["PE - Analysis"].classSize + " students) in " + esc(exam) + "."));
    } else if (isStreamTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 in their stream (" +
        DATA.modes["PE - Analysis"].classSize + " students in " + esc(exam) + ")."));
    }
"""
content = re.sub(
    r'    if \(isTopper\) \{\n      host\.appendChild\(el\("p", "note-top",\n        "<b>Congratulations\.</b> " \+ esc\(s\.name\) \+ " holds Rank 1 across the entire cohort of "\s*\+\s*DATA\.modes\["PE - Analysis"\]\.classSize \+ " students in " \+ esc\(exam\) \+ "\."\)\);\n    \}',
    greeting_logic.strip(),
    content
)


# For renderAnalysis
analysis_topper_logic = """
    var isSchoolTopper = !!(s.exams["CU 1"] && s.exams["CU 1"].rank === 1);
    var isStreamTopper = !!(s.exams["CU 1"] && s.exams["CU 1"].domainRank === 1);
    var topperHtml = "";
    if (isSchoolTopper) {
      topperHtml = "<div class='topper-badge' style='background:#ffd700; color:#5c4000; font-size:1.05em; font-weight:800; border:1px solid #cca100; box-shadow:0 2px 8px rgba(255,215,0,0.4)'>🏆 OVERALL SCHOOL TOPPER</div>";
    } else if (isStreamTopper) {
      topperHtml = "<div class='topper-badge'>🥇 Rank 1 &middot; Stream Topper</div>";
    }

    var head = el("div", (isSchoolTopper || isStreamTopper) ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      topperHtml +
      "<h2>Student Analysis Report</h2><div class='school'>PE - Analysis &middot; Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
"""
content = re.sub(
    r'    var isTopper = !!\(s\.exams\["CU 1"\] && s\.exams\["CU 1"\]\.domainRank === 1\);\n\n    var head = el\("div", isTopper \? "rep-head rep-head-top" : "rep-head"\);\n    head\.innerHTML = "<div class=\'rep-banner\'>" \+ esc\(BANNER\) \+ "</div>" \+\n      \(isTopper \? "<div class=\'topper-badge\'>🥇 Rank 1 &middot; Class Topper</div>" : ""\) \+\n      "<h2>Student Analysis Report</h2><div class=\'school\'>PE - Analysis &middot; Academic Year " \+\n      esc\(DATA\.meta\.academicYear\) \+ "</div>";',
    analysis_topper_logic.strip(),
    content
)

# For renderAnalysis greeting
analysis_greeting = """
    if (isSchoolTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Outstanding Achievement!</b> " + esc(s.name) + " holds Rank 1 out of the entire school (" + m.classSize + " students) in CU 1."));
    } else if (isStreamTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 in their stream (" +
        s.exams["CU 1"].domainSize + " students in CU 1)."));
    }
"""
content = re.sub(
    r'    if \(isTopper\) \{\n      host\.appendChild\(el\("p", "note-top",\n        "<b>Congratulations\.</b> " \+ esc\(s\.name\) \+ " holds Rank 1 in your stream in "\s*\+\s*s\.exams\["CU 1"\]\.domainSize \+ " students in CU 1\."\)\);\n    \}',
    analysis_greeting.strip(),
    content
)
# Note: the text was replaced previously to "in your stream in" so I used that in the regex.
# Actually I'll just use a safer replace block for renderAnalysis greeting:
import string
start = content.find('if (isTopper) {\n      host.appendChild(el("p", "note-top"')
if start != -1:
    end = content.find('}', start) + 1
    content = content[:start] + analysis_greeting.strip() + content[end:]


# For buildExamPDF
pdf_exam_topper = """
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
      doc.text("RANK 1 · STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }
"""
content = re.sub(
    r'    var isTopper = !!\(overallEx && overallEx\.domainRank === 1\);\n\n    doc\.setFillColor\(209, 213, 219\);.*?    doc\.text\(BANNER, W / 2, 32, \{ align: "center" \}\);\n\n    var titleY = 52, subY = 68, infoStartY = 84;\n    if \(isTopper\) \{\n      doc\.setFillColor\(253, 246, 227\); doc\.setDrawColor\.apply\(doc, GOLD\);\n      doc\.roundedRect\(W / 2 - 70, 40, 140, 16, 2, 2, "FD"\);\n      doc\.setFont\("helvetica", "bold"\); doc\.setFontSize\(8\.5\); doc\.setTextColor\.apply\(doc, \[122, 89, 0\]\);\n      doc\.text\("RANK 1 · CLASS TOPPER", W / 2, 50\.5, \{ align: "center" \}\);\n      titleY = 72; subY = 88; infoStartY = 100;\n    \}',
    pdf_exam_topper.strip(),
    content,
    flags=re.DOTALL
)

pdf_exam_greeting = """
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
"""
start = content.find('var y = infoStartY;\n    if (isTopper) {\n')
if start != -1:
    end = content.find('y += 14;\n    }\n', start) + len('y += 14;\n    }\n')
    content = content[:start] + pdf_exam_greeting.strip() + '\n' + content[end:]


# For buildPDF
pdf_analysis_topper = """
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
      doc.text("RANK 1 · STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }
"""
content = re.sub(
    r'    var isTopper = !!\(student\.exams\["CU 1"\] && student\.exams\["CU 1"\]\.domainRank === 1\);\n    doc\.setFillColor\(209, 213, 219\);.*?    doc\.text\(BANNER, W / 2, 32, \{ align: "center" \}\);\n\n    var titleY = 52, subY = 68, infoStartY = 84;\n    if \(isTopper\) \{\n      doc\.setFillColor\(253, 246, 227\); doc\.setDrawColor\.apply\(doc, GOLD\);\n      doc\.roundedRect\(W / 2 - 70, 40, 140, 16, 2, 2, "FD"\);\n      doc\.setFont\("helvetica", "bold"\); doc\.setFontSize\(8\.5\); doc\.setTextColor\.apply\(doc, \[122, 89, 0\]\);\n      doc\.text\("RANK 1  CLASS TOPPER", W / 2, 50\.5, \{ align: "center" \}\);\n      titleY = 72; subY = 88; infoStartY = 100;\n    \}',
    pdf_analysis_topper.strip(),
    content,
    flags=re.DOTALL
)
# Re-replace if there are variations in the topper text (I used "CLASS TOPPER" in some places and "" in others)
content = re.sub(
    r'    var isTopper = !!\(student\.exams\["CU 1"\] && student\.exams\["CU 1"\]\.domainRank === 1\);\n    doc\.setFillColor\(209, 213, 219\); doc\.rect\(0, 0, W, 8, "F"\);\n    doc\.setFillColor\(183, 22, 28\); doc\.rect\(0, 0, W, 6, "F"\);\n    doc\.setFont\("helvetica", "bold"\); doc\.setFontSize\(11\); doc\.setTextColor\(20, 30, 48\);\n    doc\.text\(BANNER, W / 2, 32, \{ align: "center" \}\);\n\n    var titleY = 52, subY = 68, infoStartY = 84;\n    if \(isTopper\) \{\n      doc\.setFillColor\(253, 246, 227\); doc\.setDrawColor\.apply\(doc, GOLD\);\n      doc\.roundedRect\(W / 2 - 70, 40, 140, 16, 2, 2, "FD"\);\n      doc\.setFont\("helvetica", "bold"\); doc\.setFontSize\(8\.5\); doc\.setTextColor\.apply\(doc, \[122, 89, 0\]\);\n      doc\.text\("RANK 1[^"]*", W / 2, 50\.5, \{ align: "center" \}\);\n      titleY = 72; subY = 88; infoStartY = 100;\n    \}',
    pdf_analysis_topper.strip(),
    content,
    flags=re.DOTALL
)

pdf_analysis_greeting = """
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
"""
start = content.find('var y = infoStartY;\n    if (isTopper) {\n')
if start != -1:
    end = content.find('y += 14;\n    }\n', start) + len('y += 14;\n    }\n')
    content = content[:start] + pdf_analysis_greeting.strip() + '\n' + content[end:]


with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

