import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("rankBadge(overallEx.rank, DATA.modes[\"PE - Analysis\"].classSize)", "rankBadge(overallEx.domainRank, overallEx.domainSize)")
content = content.replace("rankText(overallEx.rank, DATA.modes[\"PE - Analysis\"].classSize)", "rankText(overallEx.domainRank, overallEx.domainSize)")
content = content.replace("overallEx.rank", "overallEx.domainRank")
content = content.replace("Rank (whole cohort)", "Rank (in stream)")
content = content.replace("across the entire cohort in", "in your stream in")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)