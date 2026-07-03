import re

with open('datasource.js', 'r', encoding='utf-8') as f:
    content = f.read()

ranking_logic = """
    // --- Compute Domain-specific Ranks ---
    var domainGroups = {};
    Object.keys(peStudents).forEach(function(roll) {
      var st = peStudents[roll];
      var dom = st.stream.join("-");
      st.domainName = dom;
      if (!domainGroups[dom]) domainGroups[dom] = [];
      domainGroups[dom].push(st);
    });

    EXAMS.forEach(function(exn) {
      Object.keys(domainGroups).forEach(function(dom) {
        var arr = domainGroups[dom].filter(function(st) {
          return st.exams[exn] && st.exams[exn].total > 0;
        });
        arr.sort(function(a, b) { return b.exams[exn].total - a.exams[exn].total; });
        var prevTot = -1, prevRk = 1;
        arr.forEach(function(st, i) {
          var tot = st.exams[exn].total;
          if (tot !== prevTot) {
            prevRk = i + 1;
            prevTot = tot;
          }
          st.exams[exn].domainRank = prevRk;
          st.exams[exn].domainSize = domainGroups[dom].length;
        });
      });
    });
    // -------------------------------------

    var peConducted = {}, peTopper = {};
"""

content = re.sub(r'    var peConducted = \{\}, peTopper = \{\};', ranking_logic.strip(), content)

with open('datasource.js', 'w', encoding='utf-8') as f:
    f.write(content)
