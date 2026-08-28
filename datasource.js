/* Live data source — reads the Google Sheet directly (read-only) so any change
   in the sheet is reflected on the web. Falls back to the bundled snapshot
   (data.js -> window.REPORT_DATA) when the sheet can't be reached (e.g. offline
   or opened from file://, where Google does not grant CORS to a null origin).

   Nothing here writes to the sheet. */
(function (root) {
  "use strict";

  var GRADE_SHEETS = {
    "10": "1am96_5JYsPAzLM4XZ-J4pIiUCizvInuk0AqxO1PAyUY",
    "11": "1cDEw2sfKvxHNol-o4ZNrXZmapM75iHYzHIi71plO-7Y",
    "12": "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50"
  };
  var currentGrade = "12";

  function getSheetId(grade) {
    var g = String(grade || currentGrade).trim();
    if (g === "10" || g === "X") return GRADE_SHEETS["10"];
    if (g === "11" || g === "XI") return GRADE_SHEETS["11"];
    return GRADE_SHEETS["12"];
  }

  var GRADE_GROUPS = {
    "10": ["10 H", "10 M", "10 S"],
    "11": ["PCBM", "PCCM", "PCBC", "A.Math", "CS"],
    "12": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"]
  };

  var STREAM_ALIAS = {
    "10 H": "X Harmony",
    "10 M": "X Melody",
    "10 S": "X Symphony",
    "PCBM": "Bio - Maths",
    "PCCM": "Maths - CS",
    "PCBC": "Bio - CS",
    "A.Math": "Applied Math"
  };

  function getGradeGroups(grade) {
    var g = String(grade || currentGrade).trim();
    if (g === "10" || g === "X") return GRADE_GROUPS["10"];
    if (g === "11" || g === "XI") return GRADE_GROUPS["11"];
    return GRADE_GROUPS["12"];
  }

  function getGradeTabs(grade) {
    var g = String(grade || currentGrade).trim();
    if (g === "10" || g === "X") {
      return ["Rank wise", "PE - Analysis", "Mentor Report"].concat(getGradeGroups(grade));
    }
    return ["PE - Analysis", "Rankwise", "Sheet1", "Mentor Report"].concat(getGradeGroups(grade));
  }

  var EXAMS = ["CU 1", "TE 1", "CU 2", "TE 2"];
  // 0-indexed start column of each exam block in a group tab (6 subjects + Total)
  var BLOCK_START = { "CU 1": 3, "TE 1": 10, "CU 2": 17, "TE 2": 24 };
  // 0-indexed (total, rank) columns per exam in the PE - Analysis tab
  var PE_COLS = { "CU 1": [6, 7], "TE 1": [8, 9], "CU 2": [10, 11], "TE 2": [12, 13] };
  var SUBJECT_FULL = {
    PHY: "Physics", CHE: "Chemistry", MAT: "Mathematics", BIO: "Biology",
    CS: "Computer Science", ENG: "English", PED: "Physical Education",
    Acc: "Accountancy", Bs: "Business Studies", Eco: "Economics",
    "A.Math": "Applied Mathematics", Eng: "English", PE: "Physical Education", Cs: "Computer Science",
    Tam: "Tamil", Math: "Mathematics", Sci: "Science", Sco: "Social Science", AI: "Artificial Intelligence",
    TAM: "Tamil", MATH: "Mathematics", Maths: "Mathematics", SCI: "Science", SOC: "Social Science",
    HIN: "Hindi", Hin: "Hindi", Hindi: "Hindi", Tamil: "Tamil", Physics: "Physics", Chemistry: "Chemistry",
    Biology: "Biology", Mathematics: "Mathematics", "Physical Education": "Physical Education",
    Accountancy: "Accountancy", "Business Studies": "Business Studies", Economics: "Economics",
    ACC: "Accountancy", BS: "Business Studies", BST: "Business Studies", ECO: "Economics",
    "A.MATH": "Applied Mathematics", "APP. MATH": "Applied Mathematics", "App. Math": "Applied Mathematics",
    "Applied Math": "Applied Mathematics", "Applied Mathematics": "Applied Mathematics",
    SST: "Social Science", Social: "Social Science", FRE: "French", French: "French",
    Total: "Total Score", Rank: "Class Rank", Link: "Google Drive URL"
  };

  function getSubjectFullName(code) {
    if (!code) return "";
    var str = String(code).trim();
    if (SUBJECT_FULL[str]) return SUBJECT_FULL[str];
    var upper = str.toUpperCase();
    if (SUBJECT_FULL[upper]) return SUBJECT_FULL[upper];
    var clean = upper.replace(/[^A-Z0-9.]/g, "");
    if (SUBJECT_FULL[clean]) return SUBJECT_FULL[clean];

    if (/^PHY(\b|S|\.|\s)/i.test(str) || upper === "PHY") return "Physics";
    if (/^CHE(\b|M|\.|\s)/i.test(str) || upper === "CHE") return "Chemistry";
    if (/^BIO(\b|L|\.|\s)/i.test(str) || upper === "BIO") return "Biology";
    if (/^MAT(\b|H|\.|\s)/i.test(str) || /^MATH/i.test(str) || upper === "MAT") return "Mathematics";
    if (/^ENG(\b|L|\.|\s)/i.test(str) || upper === "ENG") return "English";
    if (/^(PED|PE\b|PHY.*EDU)/i.test(str)) return "Physical Education";
    if (/^(CS|COMP)/i.test(str)) return "Computer Science";
    if (/^ACC/i.test(str)) return "Accountancy";
    if (/^(BS|BST|BUS)/i.test(str)) return "Business Studies";
    if (/^ECO/i.test(str)) return "Economics";
    if (/^A.*MAT/i.test(str)) return "Applied Mathematics";
    if (/^TAM/i.test(str)) return "Tamil";
    if (/^HIN/i.test(str)) return "Hindi";
    if (/^SCI/i.test(str)) return "Science";
    if (/^(SOC|SCO|SST|SOCIAL)/i.test(str)) return "Social Science";
    if (/^AI\b|ARTIFICIAL/i.test(str)) return "Artificial Intelligence";
    if (/^FRE/i.test(str)) return "French";

    return str;
  }

  function tabUrl(name, grade) {
    var sid = getSheetId(grade);
    return "https://docs.google.com/spreadsheets/d/" + sid +
      "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(name) +
      "&t=" + Date.now(); // cache-bust so edits show up
  }

  // ---- CSV parsing (RFC-4180-ish: quotes, escaped quotes, CRLF) ----
  function parseCSV(text) {
    var rows = [], row = [], field = "", i = 0, inQ = false, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows;
  }

  function isNum(v) {
    if (v == null) return false;
    var s = String(v).trim();
    return s !== "" && /^-?\d+(\.\d+)?$/.test(s);
  }
  function num(v) { return isNum(v) ? parseFloat(String(v).trim()) : null; }
  function cell(row, i) { return (row && i < row.length) ? row[i] : ""; }

  function studentRows(rows) {
    var out = [], started = false;
    for (var r = 0; r < rows.length; r++) {
      var a = String(cell(rows[r], 0)).trim();
      var b = String(cell(rows[r], 1)).trim();
      if (isNum(a) && b !== "") { 
        rows[r].rowIndex = r + 1; // 1-indexed for Google Sheets A1 notation
        out.push(rows[r]); 
        started = true; 
      }
      else if (started && a !== "") break; // reached a summary/label row
    }
    return out;
  }

  function midrankPct(values, x) {
    var n = values.length;
    if (!n || x == null) return null;
    var below = 0, equal = 0;
    for (var i = 0; i < n; i++) { if (values[i] < x) below++; else if (values[i] === x) equal++; }
    return Math.round(100 * (below + 0.5 * equal) / n);
  }

  // ---- build the REPORT_DATA structure from raw sheet rows ----
  function buildData(sheets, grade) {
    var groups = getGradeGroups(grade);
    var peRows = studentRows(sheets["PE - Analysis"] || sheets["Rankwise"] || sheets["Rank wise"] || sheets["Sheet1"] || sheets["All sec"] || []);
    var peStudents = {};
    var rollIndex = {}; // rollNo -> array of mode names

    function addIndex(roll, modeName) {
      var r = roll.toUpperCase();
      if (!rollIndex[r]) rollIndex[r] = [];
      if (rollIndex[r].indexOf(modeName) === -1) rollIndex[r].push(modeName);
    }

    // Parse PE - Analysis
    var peClass = {};
    EXAMS.forEach(function (ex) { peClass[ex] = []; });

    peRows.forEach(function (row) {
      var roll = String(cell(row, 1)).trim();
      var name = String(cell(row, 2)).trim();
      var streamStr = String(cell(row, 3)).trim() + " " + String(cell(row, 4)).trim() + " " + String(cell(row, 5)).trim();
      var stream = streamStr.split(/\s+/).filter(Boolean);

      // Auto-assign Class 10 streams based on roll number prefix
      var rollUpper = roll.toUpperCase();
      if (/^26XH/i.test(rollUpper)) {
        stream = ["10 H"];
      } else if (/^26XM/i.test(rollUpper)) {
        stream = ["10 M"];
      } else if (/^26XS/i.test(rollUpper)) {
        stream = ["10 S"];
      }

      var exams = {};
      EXAMS.forEach(function (ex) {
        var cols = PE_COLS[ex];
        var tot = num(cell(row, cols[0]));
        var rk = num(cell(row, cols[1]));
        exams[ex] = { total: tot == null ? 0 : tot, rank: rk };
        if (tot != null) peClass[ex].push(tot);
      });

      peStudents[roll] = { rollNo: roll, sNo: num(cell(row, 0)), name: name, stream: stream, exams: exams, rowIdx: row.rowIndex };
      addIndex(roll, "PE - Analysis");
    });

    // -------------------------------------
    // Compute domain (stream) ranks per exam
    // Group students by domain (e.g. Bio-Maths)
    var domainGroups = {};
    Object.keys(peStudents).forEach(function (r) {
      var st = peStudents[r];
      var dom = (st.stream || []).join("-");
      st.domainName = dom;
      if (!domainGroups[dom]) domainGroups[dom] = [];
      domainGroups[dom].push(st);
    });

    EXAMS.forEach(function (exn) {
      // 1. Domain (stream) ranks per exam
      Object.keys(domainGroups).forEach(function (dom) {
        var arr = domainGroups[dom].filter(function (st) {
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

      // 2. School-wide overall ranks per exam calculated directly from total marks
      var allStudents = Object.keys(peStudents).map(function(r) { return peStudents[r]; });
      var validStudents = allStudents.filter(function (st) {
        return st.exams[exn] && st.exams[exn].total > 0;
      });
      validStudents.sort(function (a, b) { return b.exams[exn].total - a.exams[exn].total; });
      var sPrevTot = -1, sPrevRk = 1;
      validStudents.forEach(function (st, i) {
        var tot = st.exams[exn].total;
        if (tot !== sPrevTot) {
          sPrevRk = i + 1;
          sPrevTot = tot;
        }
        st.exams[exn].rank = sPrevRk;
      });

      allStudents.forEach(function (st) {
        if (!st.exams[exn] || !st.exams[exn].total || st.exams[exn].total <= 0) {
          if (st.exams[exn]) {
            st.exams[exn].rank = null;
            st.exams[exn].domainRank = null;
          }
        }
      });
    });
    // -------------------------------------

    var peConducted = {}, peTopper = {};
    EXAMS.forEach(function (exn) {
      var mx = peClass[exn].reduce(function (a, b) { return Math.max(a, b); }, 0);
      peConducted[exn] = mx > 0;
      peTopper[exn] = mx > 0 ? { total: mx } : null;
    });

    var modes = {};
    modes["PE - Analysis"] = {
      type: "analysis", label: "PE - Analysis", exams: EXAMS, conducted: peConducted,
      classSize: peRows.length, topper: peTopper, students: peStudents
    };

    var DEFAULT_SUBJECTS = {
      "Bio - Maths": ["PHY", "CHE", "MAT", "BIO", "ENG", "PED"],
      "Bio - CS": ["PHY", "CHE", "CS", "BIO", "ENG", "PED"],
      "Maths - CS": ["PHY", "CHE", "MAT", "CS", "ENG", "PED"],
      "Applied Math": ["Acc", "Bs", "Eco", "A.Math", "ENG", "PED"],
      "CS": ["Acc", "Bs", "Eco", "CS", "ENG", "PED"],
      "PCBM": ["PHY", "CHE", "MAT", "BIO", "ENG", "PED"],
      "PCCM": ["PHY", "CHE", "MAT", "CS", "ENG", "PED"],
      "PCBC": ["PHY", "CHE", "CS", "BIO", "ENG", "PED"],
      "A.Math": ["Acc", "Bs", "Eco", "A.Math", "ENG", "PED"],
      "X Harmony": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"],
      "X Melody": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"],
      "X Symphony": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"],
      "10 H": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"],
      "10 M": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"],
      "10 S": ["ENG", "TAM", "MAT", "SCI", "SOC", "AI"]
    };

    // ---- group tabs ----
    groups.forEach(function (g) {
      var rows = sheets[g];
      if (!rows || !rows.length) return;
      // subject codes: header row is the row directly above the first student row
      var firstIdx = 0;
      for (var r = 0; r < rows.length; r++) {
        if (isNum(cell(rows[r], 0)) && String(cell(rows[r], 1)).trim() !== "") { firstIdx = r; break; }
      }
      var header = rows[firstIdx - 1] || rows[0];
      var modeLabel = STREAM_ALIAS[g] || g;
      var defaultSubs = DEFAULT_SUBJECTS[modeLabel] || DEFAULT_SUBJECTS[g] || [];
      var subjects = [];
      if (defaultSubs && defaultSubs.length > 0) {
        subjects = defaultSubs.slice();
      } else {
        for (var c = BLOCK_START["CU 1"]; c < BLOCK_START["CU 1"] + 6; c++) {
          var rawCell = cell(header, c);
          var rawSub = (rawCell == null || rawCell === undefined) ? "" : String(rawCell).trim().split(/\s+/).pop();
          var subIdx = c - BLOCK_START["CU 1"];
          var subName = (rawSub && rawSub !== "undefined" && rawSub !== "null") ? rawSub : (defaultSubs[subIdx] || ("SUB" + (subIdx + 1)));
          subjects.push(subName);
        }
      }

      var srows = studentRows(rows);
      var students = {};
      var dist = {}, distTotal = {};
      EXAMS.forEach(function (ex) { dist[ex] = {}; subjects.forEach(function (s) { dist[ex][s] = []; }); distTotal[ex] = []; });

      srows.forEach(function (row) {
        var roll = String(cell(row, 1)).trim();
        var name = String(cell(row, 2)).trim();
        var marks = {};
        EXAMS.forEach(function (ex) {
          var base = BLOCK_START[ex]; var rm = {};
          var sumSubject = 0, hasSubjectMark = false;
          subjects.forEach(function (s, i) {
            var rawCell = cell(row, base + i);
            var isAB = String(rawCell || "").trim().toLowerCase() === "ab";
            var v = (isAB || rawCell === "" || rawCell == null) ? 0 : num(rawCell);
            if (v == null) v = 0;
            rm[s] = v;
            dist[ex][s].push(v);
            if (v > 0) {
              sumSubject += v;
              hasSubjectMark = true;
            }
          });
          var tot = num(cell(row, base + 6));
          if ((tot == null || tot === 0) && hasSubjectMark) {
            tot = sumSubject;
          }
          rm.Total = tot == null ? 0 : tot;
          marks[ex] = rm;
          if (tot != null && tot > 0) distTotal[ex].push(tot);
        });
        students[roll] = { rollNo: roll, sNo: num(cell(row, 0)), name: name, marks: marks, rowIdx: row.rowIndex };
        addIndex(roll, modeLabel);
      });

      var conducted = {}, classStats = {};
      EXAMS.forEach(function (ex) {
        var mxtot = distTotal[ex].reduce(function (a, b) { return Math.max(a, b); }, 0);
        conducted[ex] = mxtot > 0;
        var perSub = {};
        subjects.forEach(function (s) {
          var vals = dist[ex][s];
          if (vals.length) {
            var sum = vals.reduce(function (a, b) { return a + b; }, 0);
            perSub[s] = { max: Math.max.apply(null, vals), min: Math.min.apply(null, vals),
              avg: Math.round(sum / vals.length * 10) / 10, present: vals.length };
          } else perSub[s] = null;
        });
        var totStat = distTotal[ex].length
          ? { max: Math.max.apply(null, distTotal[ex]), present: distTotal[ex].length } : null;
        classStats[ex] = { subjects: perSub, total: totStat };
      });

      Object.keys(students).forEach(function (roll) {
        var st = students[roll];
        st.percentile = {};
        EXAMS.forEach(function (ex) {
          if (!conducted[ex]) return;
          var pex = {};
          subjects.forEach(function (s) {
            var mk = st.marks[ex][s];
            pex[s] = (mk != null) ? midrankPct(dist[ex][s], mk) : null;
          });
          var tot = st.marks[ex].Total;
          pex.Total = (tot != null) ? midrankPct(distTotal[ex], tot) : null;
          st.percentile[ex] = pex;
        });
        var pe = peStudents[roll];
        st.overall = pe ? { "CU 1": pe.exams["CU 1"], "TE 1": pe.exams["TE 1"],
          "CU 2": pe.exams["CU 2"], "TE 2": pe.exams["TE 2"] } : null;
      });

      var subjectFull = {}; subjects.forEach(function (s) { subjectFull[s] = getSubjectFullName(s); });
      modes[modeLabel] = { type: "group", label: modeLabel, subjects: subjects, subjectFull: subjectFull,
        exams: EXAMS, conducted: conducted, classSize: srows.length,
        classStats: classStats, students: students };
    });

    // ---- Mentor Report tab: roll → per-exam Google Drive links ----
    var mentorLinks = {};
    var mentorRows = sheets["Mentor Report"] || [];
    mentorRows.forEach(function (row) {
      var roll = String(cell(row, 1)).trim();
      if (roll) {
        var links = {};
        EXAMS.forEach(function(ex, i) {
          var link = String(cell(row, 3 + i)).trim();
          if (link && /^https?:\/\//.test(link)) {
            links[ex] = link;
          }
        });
        mentorLinks[roll.toUpperCase()] = { links: links, rowIdx: row.rowIndex };
      }
    });

    return {
      meta: { source: "Google Sheets (live)", academicYear: "2026 - 2027", maxPerSubject: 100,
        note: "Only CU 1 has been conducted; TE 1 / CU 2 / TE 2 are pending." },
      modeOrder: ["PE - Analysis", "Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"],
      modes: modes, rollIndex: rollIndex, mentorLinks: mentorLinks
    };
  }

  // ---- fetch all tabs and build; resolves {data, live, when} ----
  var FETCH_TIMEOUT = 15000; // 15 seconds before falling back to offline snapshot

  function fetchWithTimeout(url, opts, ms) {
    if (typeof AbortController !== "undefined") {
      var ctrl = new AbortController();
      opts = opts || {};
      opts.signal = ctrl.signal;
      var timer = setTimeout(function () { ctrl.abort(); }, ms);
      return fetch(url, opts).then(function (r) {
        clearTimeout(timer); return r;
      }).catch(function (e) {
        clearTimeout(timer); throw e;
      });
    }
    return fetch(url, opts);
  }

  function loadLive(grade) {
    var tabs = getGradeTabs(grade);
    return Promise.all(tabs.map(function (t) {
      return fetchWithTimeout(tabUrl(t, grade), { credentials: "omit" }, FETCH_TIMEOUT).then(function (r) {
        if (!r.ok) throw new Error(t + " HTTP " + r.status);
        return r.text();
      }).then(function (txt) {
        if (/^\s*</.test(txt)) throw new Error(t + ": not CSV (access denied?)");
        return [t, parseCSV(txt)];
      });
    })).then(function (pairs) {
      var sheets = {};
      pairs.forEach(function (p) { sheets[p[0]] = p[1]; });
      return { data: buildData(sheets, grade), live: true, when: new Date() };
    });
  }

  function loadReportData(grade) {
    return loadLive(grade).catch(function (err) {
      if (root.REPORT_DATA) {
        return { data: root.REPORT_DATA, live: false, when: null, error: err.message };
      }
      throw err;
    });
  }

  root.ReportSource = { loadReportData: loadReportData, buildData: buildData, parseCSV: parseCSV };

  // Node test harness support
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ReportSource;
    module.exports._internal = { getGradeTabs: getGradeTabs, tabUrl: tabUrl };
  }
})(typeof window !== "undefined" ? window : globalThis);
