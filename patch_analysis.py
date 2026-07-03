import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace rank in renderAnalysis
content = content.replace('var isTopper = !!(s.exams["CU 1"] && s.exams["CU 1"].rank === 1);', 'var isTopper = !!(s.exams["CU 1"] && s.exams["CU 1"].domainRank === 1);')
content = content.replace('m.classSize + " students in CU 1."', 's.exams["CU 1"].domainSize + " students in CU 1."')
content = content.replace('["Cohort Size", m.classSize + " students"]', '["Stream Size", s.exams["CU 1"].domainSize + " students"]')
content = content.replace('<th>Rank in Cohort</th>', '<th>Rank (in stream)</th>')
content = content.replace('rankBadge(e.rank, m.classSize)', 'rankBadge(e.domainRank, e.domainSize)')
content = content.replace('rankBadge(cu.rank, m.classSize)', 'rankBadge(cu.domainRank, cu.domainSize)')
content = content.replace('<div class=\'lbl\'>Rank in Cohort</div>', '<div class=\'lbl\'>Rank (in stream)</div>')

# Replace rank in analysisPDF
content = content.replace('var isTopper = !!(student.exams["CU 1"] && student.exams["CU 1"].rank === 1);', 'var isTopper = !!(student.exams["CU 1"] && student.exams["CU 1"].domainRank === 1);')
content = content.replace('["Stream", (student.stream || []).join(", ") || "—", "Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"]', '["Stream", (student.stream || []).join(", ") || "—", "Stream Size", student.exams["CU 1"].domainSize + " students"]')
content = content.replace('["Exam", "Marks Obtained", "Rank in Cohort", "Class Highest"]', '["Exam", "Marks Obtained", "Rank (in stream)", "Class Highest"]')
content = content.replace('r.push(rankText(e.rank, m.classSize));', 'r.push(rankText(e.domainRank, e.domainSize));')
content = content.replace('boxes.push({ num: rankText(cu.rank, m.classSize), label: "Rank in Cohort" });', 'boxes.push({ num: rankText(cu.domainRank, cu.domainSize), label: "Rank (in stream)" });')


with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
