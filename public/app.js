/* Student Performance Report — parent portal.
   Data is loaded from our own backend (server.js), which is the only thing
   that ever talks to Google Sheets. The browser never sees the sheet ID or
   any student's data beyond the single record it explicitly asked for. */
(function () {
  "use strict";
  var DATA = null;          // small cache: { meta, modes: { "PE - Analysis": {classSize} } }
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

  var SUBJECT_FULL_MAP = {
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
    if (SUBJECT_FULL_MAP[str]) return SUBJECT_FULL_MAP[str];
    var upper = str.toUpperCase();
    if (SUBJECT_FULL_MAP[upper]) return SUBJECT_FULL_MAP[upper];
    var clean = upper.replace(/[^A-Z0-9.]/g, "");
    if (SUBJECT_FULL_MAP[clean]) return SUBJECT_FULL_MAP[clean];

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

  function isPhysicalEducation(code) {
    if (!code) return false;
    var c = String(code).trim().toUpperCase();
    if (c === "PED" || c === "PE") return true;
    var full = getSubjectFullName(code);
    return full === "Physical Education" || /^(PED|PE\b|PHY.*EDU)/i.test(full);
  }

  // fetch JSON from our backend; throws with a readable message on failure
  function apiGet(path) {
    return fetch(path).then(function (r) {
      return r.json().catch(function () { throw new Error("Bad response from server"); })
        .then(function (body) {
          if (!r.ok) throw new Error(body.error || ("HTTP " + r.status));
          return body;
        });
    });
  }
  // keep the small cross-cutting bits (academic year, whole-cohort size) fresh
  function absorbMeta(resp) {
    DATA = DATA || { meta: {}, modes: { "PE - Analysis": {} } };
    DATA.meta = resp.meta;
    DATA.modes["PE - Analysis"].classSize = resp.peClassSize;
    MAXSUB = (DATA.meta && DATA.meta.maxPerSubject) || 100;
  }

  var currentPDF = null; // holds {mode, student} for export
  var currentMentorUrl = null;

  function toDriveEmbedUrl(url) {
    if (!url) return null;
    var m = url.match(/\/file\/d\/([^\/\?]+)/);
    if (m) return "https://drive.google.com/file/d/" + m[1] + "/preview";
    return url;
  }

  function appendMentorSection(host) {
    if (!currentMentorUrl) return;
    var embedUrl = toDriveEmbedUrl(currentMentorUrl);
    var wrap = el("div", "mentor-report-wrap");
    wrap.innerHTML = '<div class="sec-title">Mentor Report</div>';
    var frame = document.createElement("iframe");
    frame.src = embedUrl;
    frame.className = "mentor-report-frame";
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("loading", "lazy");
    wrap.appendChild(frame);
    host.appendChild(wrap);
  }

  // ---------- form handling & report state ----------
  var currentStudentRoll = null;
  var currentStudentGrade = "12";
  var currentMode = "TE 1";
  var currentLeaderboardScope = null;
  var currentLeaderboardRenderFn = null;
  var currentLeaderboardBtn = null;
  var lastSectionData = null;
  var currentSectionKey = null;

  function updateToolbarModeOptions(isStudentReport, activeMode) {
    var sel = $("#reportModeSelect");
    if (!sel) return;
    sel.innerHTML = "";
    var modes = isStudentReport
      ? ["PE - Analysis", "CU 1", "TE 1", "TE 2"]
      : ["CU 1", "TE 1", "TE 2"];
    modes.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === activeMode) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.value = activeMode;
  }

  function updateToolbarGradeOptions(activeGrade) {
    var sel = $("#reportGradeSelect");
    if (!sel) return;
    var g = activeGrade || currentStudentGrade || ($("#grade") ? $("#grade").value : "12");
    sel.value = g;
  }

  function fetchStudentReport(roll, mode, grade) {
    if (!DATA) { showMsg("info", "Loading data, please wait a moment&hellip;"); return Promise.resolve(); }
    if (!roll) { showMsg("error", "Please enter a Roll Number."); return Promise.resolve(); }

    currentStudentRoll = roll;
    currentStudentGrade = grade || ($("#grade") ? $("#grade").value : "12");
    currentMode = mode;
    currentLeaderboardScope = null;
    currentSectionKey = null;
    if ($("#downloadLandscapeBtn")) $("#downloadLandscapeBtn").style.display = "none";
    if ($("#downloadBtn")) $("#downloadBtn").style.display = "";

    var submitBtn = $("#submitBtn");
    if (submitBtn) submitBtn.disabled = true;

    updateToolbarModeOptions(true, mode);
    updateToolbarGradeOptions(currentStudentGrade);

    return apiGet("/api/lookup?mode=" + encodeURIComponent(mode) + "&roll=" + encodeURIComponent(roll) + "&grade=" + encodeURIComponent(currentStudentGrade) + "&fresh=1&_t=" + Date.now())
      .then(function (resp) {
        absorbMeta(resp);
        if (resp.found && resp.kind === "analysis") {
          DATA.modes[resp.mode.label] = resp.mode;
          currentMentorUrl = resp.mentorReportUrl || null;
          $("#downloadBtn").hidden = false;
          renderReport(resp.mode.label, resp.student);
        } else if (resp.found && resp.kind === "exam") {
          DATA.modes[resp.mode.label] = resp.mode;
          currentMentorUrl = resp.mentorReportUrl || null;
          $("#downloadBtn").hidden = false;
          renderExamReport(resp.mode, resp.student, resp.exam);
        } else if (resp.reason === "not-conducted") {
          if (resp.mentorReportUrl) {
            currentMentorUrl = resp.mentorReportUrl;
            var host = $("#report");
            host.innerHTML = "";
            var notice = el("p", "note-pending");
            notice.innerHTML = "<b>" + esc(mode) + "</b> marks have not been entered yet &mdash; showing mentor report.";
            host.appendChild(notice);
            appendMentorSection(host);
            $("#downloadBtn").hidden = true;
            showView("report");
          } else {
            showMsg("info", "Exam <b>" + esc(mode) + "</b> has not been conducted yet." +
              (resp.availableExams && resp.availableExams.length ? " Available: <b>" + resp.availableExams.map(esc).join(", ") + "</b>." : ""));
          }
        } else {
          showMsg("error", "No student found with Roll Number <b>" + esc(roll) + "</b>.");
        }
      })
      .catch(function (e) {
        showMsg("error", "Could not reach the server. " + esc(e.message));
      })
      .then(function () { if (submitBtn) submitBtn.disabled = false; });
  }

  var form = $("#lookupForm"), msg = $("#message");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var roll = normRoll($("#roll").value);
    var mode = $("#mode").value;
    var grade = $("#grade") ? $("#grade").value : "12";
    msg.className = "message"; msg.innerHTML = "";
    fetchStudentReport(roll, mode, grade);
  });

  var gradeSelect = $("#grade");
  if (gradeSelect) {
    gradeSelect.addEventListener("change", function () {
      var g = this.value;
      currentStudentGrade = g;
      var links = $("#seriesSheetLinks");
      if (links) links.style.display = (g === "12" || g === "XII") ? "" : "none";
      load(false);
    });
  }

  function showMsg(kind, html) { msg.className = "message " + kind; msg.innerHTML = html; }

  function showView(name) {
    var grid = $("#portalGridContainer");
    var lookup = $("#lookupCard");
    var report = $("#reportWrap");
    if (grid) grid.hidden = (name !== "portals");
    if (lookup) lookup.hidden = (name !== "lookup");
    if (report) report.hidden = (name !== "report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Parent-Directory "cd .." Navigation Function
  function navigateUp() {
    var lookup = $("#lookupCard");
    var report = $("#reportWrap");

    if (report && !report.hidden) {
      showView("lookup");
    } else if (lookup && !lookup.hidden) {
      showView("portals");
    } else {
      showView("portals");
    }
  }

  if (typeof window !== "undefined") {
    var _appHistoryReady = false;
    setTimeout(function() { _appHistoryReady = true; }, 500);

    window.addEventListener("popstate", function () {
      if (!_appHistoryReady) return;
      navigateUp();
      // Re-push so subsequent back presses continue to navigate up
      if (typeof history !== "undefined" && history.pushState) {
        history.pushState({ ksr: true }, "", window.location.href);
      }
    });

    if (typeof history !== "undefined" && history.pushState) {
      history.pushState({ ksr: true }, "", window.location.href);
    }
  }

  var navStudentCard = $("#navStudentCard");
  if (navStudentCard) {
    navStudentCard.addEventListener("click", function (e) {
      e.preventDefault();
      showView("lookup");
      var rollInput = $("#roll");
      if (rollInput) rollInput.focus();
    });
  }

  var closeLookupBtn = $("#closeLookupBtn");
  if (closeLookupBtn) {
    closeLookupBtn.addEventListener("click", function () {
      showView("portals");
    });
  }

  $("#backBtn").addEventListener("click", function () {
    currentMentorUrl = null;
    currentSectionKey = null;
    if ($("#downloadLandscapeBtn")) $("#downloadLandscapeBtn").style.display = "none";
    if ($("#downloadBtn")) $("#downloadBtn").style.display = "";
    showView("lookup");
  });
  $("#printBtn").addEventListener("click", function () { window.print(); });
  $("#downloadBtn").addEventListener("click", function () {
    if (!currentPDF) return;
    if (currentPDF.type === "exam") buildExamPDF(currentPDF.mode, currentPDF.student, currentPDF.exam);
    else if (currentPDF.type === "top-school") buildSchoolTopPDF();
    else if (currentPDF.type === "top-stream") buildStreamTopPDF();
    else if (currentPDF.type === "slow-learners") buildSlowLearnersPDF();
    else if (currentPDF.type === "section-sheet") buildSectionLandscapePDF();
    else buildPDF(currentPDF.mode, currentPDF.student);
  });
  var downloadLandscapeBtn = $("#downloadLandscapeBtn");
  if (downloadLandscapeBtn) {
    downloadLandscapeBtn.addEventListener("click", function () {
      buildSectionLandscapePDF();
    });
  }

  // ---------- rendering ----------
  function conductedExams(m) {
    return m.exams.filter(function (ex) { return m.conducted[ex]; });
  }
  function pendingExams(m) {
    return m.exams.filter(function (ex) { return !m.conducted[ex]; });
  }
  // most recent exam period with marks entered (CU 1 -> TE 1 -> TE 2), so the
  // "current standing" (topper badge, summary cards) always reflects the latest sheet data
  function latestConductedExam(m) {
    var conducted = conductedExams(m);
    return conducted.length ? conducted[conducted.length - 1] : m.exams[0];
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
    currentMode = mode;
    updateToolbarModeOptions(true, mode);
    updateToolbarGradeOptions(currentStudentGrade);
    var host = $("#report");
    host.innerHTML = "";
    if (m.type === "group") renderGroup(host, m, student);
    else renderAnalysis(host, m, student);
    appendMentorSection(host);
    showView("report");
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

  function markCell(val, absent, isTop, isFail) {
    if (absent) return '<span class="your-mark is-absent" style="color:#94a3b8;">AB</span>';
    if (val == null || val === "AB" || val === "ab" || val === "") return '<span class="your-mark">0</span>';
    if (isFail) {
      return '<span class="your-mark is-fail" style="color:#dc2626;font-weight:700;">' + val +
        ' <span style="display:inline-block;padding:1px 5px;font-size:0.72em;background:rgba(220,38,38,0.1);color:#dc2626;border-radius:3px;margin-left:4px;font-weight:700;vertical-align:middle;">Fail</span></span>';
    }
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
  function rankBadge(rank, total) {
    if (rank == null) return "&mdash;";
    var medal = "";
    var cls = "rank-badge";
    if (rank === 1) { medal = "#1"; cls += " rank-gold"; }
    else if (rank === 2) { medal = "#2"; cls += " rank-silver"; }
    else if (rank === 3) { medal = "#3"; cls += " rank-bronze"; }
    else if (rank <= 10) { cls += " rank-top10"; }
    var txt = medal ? medal : String(rank);
    if (total) txt += " <span class='rank-of'>/ " + total + "</span>";
    return '<span class="' + cls + '">' + txt + '</span>';
  }
  // rank label text (no HTML) for PDFs
  function rankText(rank, total) {
    if (rank == null) return "—";
    return rank + (total ? " / " + total : "");
  }


  // ----- EXAM report (single exam, subject-wise) -----
  function renderExamReport(m, s, exam) {
    var host = $("#report");
    host.innerHTML = "";
    currentPDF = { type: "exam", mode: m, student: s, exam: exam };
    currentMode = exam;
    updateToolbarModeOptions(true, exam);
    updateToolbarGradeOptions(currentStudentGrade);
    
    var overallEx = s.overall && s.overall[exam];
    var isSchoolTopper = !!(overallEx && overallEx.rank === 1 && overallEx.total > 0);
    var isStreamTopper = !!(overallEx && overallEx.domainRank === 1 && overallEx.total > 0 && !isSchoolTopper);
    var topperHtml = "";
    if (isSchoolTopper) {
      topperHtml = "<div class='topper-badge' style='background:#ffd700; color:#5c4000; font-size:1.05em; font-weight:800; border:1px solid #cca100; box-shadow:0 2px 8px rgba(255,215,0,0.4)'>OVERALL SCHOOL TOPPER</div>";
    } else if (isStreamTopper) {
      topperHtml = "<div class='topper-badge'>Rank 1 &middot; Stream Topper</div>";
    }

    var head = el("div", (isSchoolTopper || isStreamTopper) ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      topperHtml +
      "<h2>Student Analysis Report</h2><div class='school'>" +
      esc(m.label) + " &middot; " + esc(exam) + " &middot; Academic Year " + esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);

    if (isSchoolTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Outstanding Achievement!</b> " + esc(s.name) + " holds Rank 1 out of the entire school (" + DATA.modes["PE - Analysis"].classSize + " students) in " + esc(exam) + "."));
    } else if (isStreamTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 in their stream (" +
        (overallEx.domainSize || m.classSize) + " students in " + esc(exam) + ")."));
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
    
    var isClass12 = (currentStudentGrade === "12" || currentStudentGrade === "XII" || !currentStudentGrade) ||
                    (typeof $("#grade") !== "undefined" && $("#grade") && ($("#grade").value === "12" || $("#grade").value === "XII"));
    var failCutoff = isClass12 ? 45 : 30;

    m.subjects.forEach(function (code) {
      var full = (m.subjectFull && m.subjectFull[code] && m.subjectFull[code] !== code) ? m.subjectFull[code] : getSubjectFullName(code);
      body += "<tr><td class='subj'>" + esc(full) + " <small style='color:#8a93a3'>(" + esc(code) + ")</small></td>";
      var rawVal = s.marks[exam][code];
      var isAbsent = (rawVal === "AB" || rawVal === "ab");
      var val = (rawVal == null || isAbsent || rawVal === "") ? 0 : rawVal;
      var numVal = parseFloat(val) || 0;
      var cs = m.classStats[exam] && m.classStats[exam].subjects[code];
      var isTop = cs && numVal > 0 && numVal === cs.max;
      var isFail = !isAbsent && rawVal !== "" && rawVal != null && numVal < failCutoff;
      body += "<td>" + markCell(val, isAbsent, isTop, isFail) + "</td>";
      body += "<td>" + (cs && cs.max != null ? "<b>" + cs.max + "</b>" : "&mdash;") + "</td>";
      body += "<td>" + pctCell(pctObtained(val, MAXSUB)) + "</td></tr>";
    });
    
    var hasPE = m.subjects.some(function (code) { return isPhysicalEducation(code); });
    var isTEWithPE = isClass12 && (exam === "TE 1" || exam === "TE 2") && hasPE;
    var maxTotal = isTEWithPE ? 500 : (m.subjects.length * MAXSUB);

    var tot = 0;
    var hasAnyMark = false;
    m.subjects.forEach(function (code) {
      if (isTEWithPE && isPhysicalEducation(code)) return;
      var rawVal = s.marks[exam] ? s.marks[exam][code] : null;
      var val = (rawVal == null || rawVal === "AB" || rawVal === "ab" || rawVal === "") ? 0 : rawVal;
      if (rawVal != null && rawVal !== "") hasAnyMark = true;
      tot += (parseFloat(val) || 0);
    });
    if (!hasAnyMark) tot = (s.marks[exam] && s.marks[exam].Total != null) ? s.marks[exam].Total : null;

    body += "<tr class='total-row'><td class='subj'>Total</td>";
    body += "<td>" + (tot != null ? tot : "&mdash;") + "</td>";
    var totMax = m.classStats[exam].total ? m.classStats[exam].total.max : null;
    body += "<td>" + (totMax != null ? totMax : "&mdash;") + "</td>";
    body += "<td>" + pctCell(tot != null ? pctObtained(tot, maxTotal) : null) + "</td></tr>";
    
    body += "</tbody>";
    tbl.innerHTML = thead + body;
    scroll.appendChild(tbl);
    host.appendChild(scroll);

    var cards = el("div", "cards");
    cards.appendChild(card((tot != null ? tot : "—") + " / " + maxTotal, "Total Marks"));
    
    if (overallEx && overallEx.domainRank) {
      var rankCard = el("div", "card" + (overallEx.domainRank <= 3 ? " card-rank card-rank-" + overallEx.domainRank : ""));
      rankCard.innerHTML = "<div class='num'>" + rankBadge(overallEx.domainRank, overallEx.domainSize) + "</div><div class='lbl'>Rank (in stream)</div>";
      cards.appendChild(rankCard);
    }
    cards.appendChild(card(tot != null ? pctObtained(tot, maxTotal) + "%" : "—", "Overall Percentage"));
    host.appendChild(cards);

    appendMentorSection(host);
    showView("report");
  }

  // ----- ANALYSIS report (totals + ranks) -----
  function renderAnalysis(host, m, s) {
    var latest = latestConductedExam(m);
    var latestEx = s.exams[latest];
    var isSchoolTopper = !!(latestEx && latestEx.rank === 1 && latestEx.total > 0);
    var isStreamTopper = !!(latestEx && latestEx.domainRank === 1 && latestEx.total > 0 && !isSchoolTopper);
    var topperHtml = "";
    if (isSchoolTopper) {
      topperHtml = "<div class='topper-badge' style='background:#ffd700; color:#5c4000; font-size:1.05em; font-weight:800; border:1px solid #cca100; box-shadow:0 2px 8px rgba(255,215,0,0.4)'>OVERALL SCHOOL TOPPER</div>";
    } else if (isStreamTopper) {
      topperHtml = "<div class='topper-badge'>Rank 1 &middot; Stream Topper</div>";
    }

    var head = el("div", (isSchoolTopper || isStreamTopper) ? "rep-head rep-head-top" : "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      topperHtml +
      "<h2>Student Analysis Report</h2><div class='school'>PE - Analysis &middot; Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);
    if (isSchoolTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Outstanding Achievement!</b> " + esc(s.name) + " holds Rank 1 out of the entire school (" + m.classSize + " students) in " + esc(latest) + "."));
    } else if (isStreamTopper) {
      host.appendChild(el("p", "note-top",
        "<b>Congratulations.</b> " + esc(s.name) + " holds Rank 1 in their stream (" +
        latestEx.domainSize + " students in " + esc(latest) + ")."));
    }

    host.appendChild(el("div", "sec-title", "1. Student Information"));
    host.appendChild(infoGrid([
      ["Name", esc(s.name)],
      ["Roll Number", esc(s.rollNo)],
      ["Stream", esc((s.stream || []).join(", ") || "—")],
      ["Cohort Size", m.classSize + " students"],
      ["Academic Year", esc(DATA.meta.academicYear)],
      ["Report Date", today()]
    ]));

    host.appendChild(el("div", "sec-title", "2. Consolidated Performance & Rank"));
    var maxTot = maxTotalMarks();
    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid");
    var h = "<thead><tr><th>Exam</th><th>Marks Obtained<br><small>(out of " + maxTot +
      ")</small></th><th>Rank (in stream)</th><th>Class Highest<br><small>(out of " + maxTot +
      ")</small></th></tr></thead><tbody>";
    m.exams.forEach(function (ex) {
      var e = s.exams[ex];
      if (!m.conducted[ex]) {
        h += "<tr><td class='subj'>" + esc(ex) + "</td><td class='pending-col' colspan='3'>Not conducted yet</td></tr>";
        return;
      }
      var top = m.topper[ex];
      h += "<tr><td class='subj'>" + esc(ex) + "</td><td class='your-mark" + (e.rank === 1 ? " is-top" : "") + "'>" +
        e.total + " / " + maxTot + "</td><td>" + rankBadge(e.domainRank, e.domainSize) + "</td><td>" +
        (top ? top.total + " / " + maxTot : "—") + "</td></tr>";
    });
    h += "</tbody>";
    tbl.innerHTML = h; scroll.appendChild(tbl); host.appendChild(scroll);

    var cards = el("div", "cards");
    cards.appendChild(card(latestEx.total + " / " + maxTot, "Total Marks (" + latest + ")"));
    // rank card with special styling
    var rankCard = el("div", "card" + (latestEx.rank != null && latestEx.rank <= 3 ? " card-rank card-rank-" + latestEx.rank : ""));
    rankCard.innerHTML = "<div class='num'>" + rankBadge(latestEx.domainRank, latestEx.domainSize) + "</div><div class='lbl'>Rank (in stream)</div>";
    cards.appendChild(rankCard);
    var pctObt = pctObtained(latestEx.total, maxTot);
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
    var done = conductedExams(m);
    var p = el("p", "note-pending");
    p.innerHTML = "<b>Note:</b> <b>" + done.map(esc).join(", ") +
      "</b> ha" + (done.length === 1 ? "s" : "ve") + " been conducted so far. The following are pending and will appear once marks are entered: " +
      pend.map(esc).join(", ") + ".";
    host.appendChild(p);
  }

  // ---------- Top Performers (leaderboards) ----------
  var DOMAIN_LABELS = {
    "Bio-Math": "Bio - Maths", "Math-CS": "Maths - CS", "Bio-CS": "Bio - CS",
    "Applied Math": "Applied Maths", "CS": "Computer Science"
  };
  function domainLabel(dom) { return DOMAIN_LABELS[dom] || dom; }

  function lbRowClass(rank) { return rank <= 3 ? " lb-rank-" + rank : ""; }

  // cached copies of the last-fetched leaderboard, reused by the PDF builders
  // so downloading doesn't need a second round trip
  var lastSchoolTop = null, lastStreamTop = null, lastSlowLearners = null;

  function renderSchoolTop(host, top) {
    lastSchoolTop = top;
    currentPDF = { type: "top-school" };
    var maxTot = maxTotalMarks();

    var head = el("div", "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      "<h2>Top Performers</h2><div class='school'>School-wide &middot; Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);

    var examList = top.availableExams || ["CU 1", "TE 1", "TE 2"];
    var modeRow = el("div", "lb-mode-row");
    var pillsHtml = examList.map(function (ex) {
      return '<button type="button" class="btn-mode-pill' + (ex === top.exam ? ' active' : '') + '" data-mode="' + esc(ex) + '">' + esc(ex) + '</button>';
    }).join("");
    modeRow.innerHTML = '<span class="lb-asof-text">Ranking as of <b>' + esc(top.exam) + '</b> &middot; out of ' + top.classSize + ' students</span>' +
      '<div class="lb-mode-pill-group">' + pillsHtml + '</div>';
    host.appendChild(modeRow);

    var pills = modeRow.querySelectorAll(".btn-mode-pill");
    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var m = this.getAttribute("data-mode");
        if (m && m !== top.exam) {
          showLeaderboard("school", renderSchoolTop, $("#topSchoolBtn"), m);
        }
      });
    });

    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid");
    var h = "<thead><tr><th>Rank</th><th>Name</th><th>Roll No</th><th>Stream</th><th>Total Marks</th><th>Percentage</th></tr></thead><tbody>";
    top.list.forEach(function (s) {
      var e = s.exams[top.exam];
      var pct = pctObtained(e.total, maxTot);
      h += "<tr class='" + lbRowClass(e.rank).trim() + "'><td>" + rankBadge(e.rank, top.classSize) +
        "</td><td class='lb-name'>" + esc(s.name) + "</td><td>" + esc(s.rollNo) + "</td><td>" +
        esc(domainLabel(s.domainName)) + "</td><td>" + e.total + " / " + maxTot +
        "</td><td>" + (pct != null ? pct + "%" : "—") + "</td></tr>";
    });
    h += "</tbody>";
    tbl.innerHTML = h; scroll.appendChild(tbl); host.appendChild(scroll);
  }

  function renderStreamTop(host, top) {
    lastStreamTop = top;
    currentPDF = { type: "top-stream" };
    var maxTot = maxTotalMarks();

    var head = el("div", "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      "<h2>Top Performers by Stream</h2><div class='school'>Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);

    var examList = top.availableExams || ["CU 1", "TE 1", "TE 2"];
    var modeRow = el("div", "lb-mode-row");
    var pillsHtml = examList.map(function (ex) {
      return '<button type="button" class="btn-mode-pill' + (ex === top.exam ? ' active' : '') + '" data-mode="' + esc(ex) + '">' + esc(ex) + '</button>';
    }).join("");
    modeRow.innerHTML = '<span class="lb-asof-text">Ranking as of <b>' + esc(top.exam) + '</b></span>' +
      '<div class="lb-mode-pill-group">' + pillsHtml + '</div>';
    host.appendChild(modeRow);

    var pills = modeRow.querySelectorAll(".btn-mode-pill");
    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var m = this.getAttribute("data-mode");
        if (m && m !== top.exam) {
          showLeaderboard("stream", renderStreamTop, $("#topStreamBtn"), m);
        }
      });
    });

    top.groups.forEach(function (g) {
      host.appendChild(el("div", "lb-stream-heading", esc(domainLabel(g.domain)) + " &middot; " + g.size + " students"));
      var scroll = el("div", "tbl-scroll");
      var tbl = el("table", "grid");
      var h = "<thead><tr><th>Rank</th><th>Name</th><th>Roll No</th><th>Total Marks</th><th>Percentage</th></tr></thead><tbody>";
      g.list.forEach(function (s) {
        var e = s.exams[top.exam];
        var pct = pctObtained(e.total, maxTot);
        h += "<tr class='" + lbRowClass(e.domainRank).trim() + "'><td>" + rankBadge(e.domainRank, e.domainSize) +
          "</td><td class='lb-name'>" + esc(s.name) + "</td><td>" + esc(s.rollNo) + "</td><td>" + e.total + " / " + maxTot +
          "</td><td>" + (pct != null ? pct + "%" : "—") + "</td></tr>";
      });
      h += "</tbody>";
      tbl.innerHTML = h; scroll.appendChild(tbl); host.appendChild(scroll);
    });
  }

  function renderSlowLearners(host, data) {
    lastSlowLearners = data;
    currentPDF = { type: "slow-learners" };
    var maxTot = maxTotalMarks();
    var isClass12 = (currentStudentGrade === "12" || currentStudentGrade === "XII" || !currentStudentGrade) ||
                    (data && (data.grade === "12" || data.grade === "XII"));
    var cutoff = (data && data.failThreshold) || (isClass12 ? 45 : 30);
    var minFails = (data && data.minFailsRequired != null) ? data.minFailsRequired : (isClass12 ? 1 : 4);
    var criteriaDesc = minFails === 1
      ? "Students who failed in 1 or more subjects (&lt; " + cutoff + ")"
      : "Students who failed in more than 3 subjects (&lt; " + cutoff + ")";

    var head = el("div", "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      "<h2>Aspiring Achievers</h2><div class='school'>" + criteriaDesc + " &middot; Academic Year " +
      esc(DATA.meta.academicYear) + "</div>";
    host.appendChild(head);

    var examList = data.availableExams || ["CU 1", "TE 1", "TE 2"];
    var modeRow = el("div", "lb-mode-row");
    var pillsHtml = examList.map(function (ex) {
      return '<button type="button" class="btn-mode-pill' + (ex === data.exam ? ' active' : '') + '" data-mode="' + esc(ex) + '">' + esc(ex) + '</button>';
    }).join("");
    modeRow.innerHTML = '<span class="lb-asof-text">Exam: <b>' + esc(data.exam) + '</b> &middot; ' + data.list.length + ' student' + (data.list.length === 1 ? '' : 's') + '</span>' +
      '<div class="lb-mode-pill-group">' + pillsHtml + '</div>';
    host.appendChild(modeRow);

    var pills = modeRow.querySelectorAll(".btn-mode-pill");
    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var m = this.getAttribute("data-mode");
        if (m && m !== data.exam) {
          showLeaderboard("slow", renderSlowLearners, $("#slowLearnersBtn"), m);
        }
      });
    });

    if (!data.list || data.list.length === 0) {
      var noFoundDesc = minFails === 1 ? "no students failed in any subject" : "no students failed in more than 3 subjects";
      host.appendChild(el("p", "note-top", "<b>No aspiring achievers found</b> for <b>" + esc(data.exam) + "</b> (" + noFoundDesc + ")."));
      return;
    }

    var scroll = el("div", "tbl-scroll");
    var tbl = el("table", "grid");
    var h = "<thead><tr><th>#</th><th>Name</th><th>Roll No</th><th>Stream</th><th>Failed Subjects (&lt; " + cutoff + ")</th><th>Fails</th><th>Total Marks</th></tr></thead><tbody>";
    data.list.forEach(function (s, idx) {
      var failedTags = (s.failedSubjects || []).map(function (f) {
        return '<span style="display:inline-block;margin:2px 4px;padding:2px 6px;background:rgba(220,38,38,0.1);color:#dc2626;border-radius:4px;font-weight:600;font-size:0.85em;">' +
          esc(f.code) + ' (' + f.mark + ')</span>';
      }).join("");
      h += "<tr><td style='text-align:center;'>" + (idx + 1) + "</td>" +
        "<td class='lb-name'>" + esc(s.name) + "</td>" +
        "<td style='text-align:center;'>" + esc(s.rollNo) + "</td>" +
        "<td style='text-align:center;'>" + esc(domainLabel(s.domainName)) + "</td>" +
        "<td>" + failedTags + "</td>" +
        "<td style='text-align:center;font-weight:700;color:#dc2626;'>" + s.failedCount + "</td>" +
        "<td style='text-align:center;font-weight:600;'>" + s.total + "</td></tr>";
    });
    h += "</tbody>";
    tbl.innerHTML = h;
    scroll.appendChild(tbl);
    host.appendChild(scroll);
  }

  function renderSectionSheet(host, data) {
    lastSectionData = data;
    currentSectionKey = data.sectionKey;
    currentPDF = { type: "section-sheet" };
    host.innerHTML = "";

    $("#downloadBtn").style.display = "none";
    if ($("#downloadLandscapeBtn")) $("#downloadLandscapeBtn").style.display = "inline-flex";

    var head = el("div", "rep-head");
    head.innerHTML = "<div class='rep-banner'>" + esc(BANNER) + "</div>" +
      "<h2>Class 12 &mdash; " + esc(data.sectionName) + " Mark Sheet</h2>" +
      "<div class='school'>Academic Year " + esc((DATA && DATA.meta && DATA.meta.academicYear) || "2026 - 2027") + " &middot; " + data.students.length + " Students</div>";
    host.appendChild(head);

    // Exam Mode Pills row
    var examList = data.availableExams || ["CU 1", "TE 1", "TE 2"];
    var modeRow = el("div", "lb-mode-row");
    var pillsHtml = examList.map(function (ex) {
      return '<button type="button" class="btn-mode-pill' + (ex === data.exam ? ' active' : '') + '" data-mode="' + esc(ex) + '">' + esc(ex) + '</button>';
    }).join("");
    modeRow.innerHTML = '<span class="lb-asof-text">Exam: <b>' + esc(data.exam) + '</b> &middot; Section: <b>' + esc(data.sectionName) + '</b> (' + data.students.length + ' students)</span>' +
      '<div class="lb-mode-pill-group">' + pillsHtml + '</div>';
    host.appendChild(modeRow);

    var pills = modeRow.querySelectorAll(".btn-mode-pill");
    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var m = this.getAttribute("data-mode");
        if (m && m !== data.exam) {
          showSectionSheet(data.sectionKey, m);
        }
      });
    });

    if (!data.students || data.students.length === 0) {
      host.appendChild(el("p", "note-top", "<b>No students found</b> for section <b>" + esc(data.sectionName) + "</b>."));
      return;
    }

    var scroll = el("div", "sec-table-wrap");
    var tbl = el("table", "sec-table");

    // Table Header
    var ths = "<tr><th>#</th><th>Roll No</th><th style='text-align:left;'>Student Name</th><th>Stream</th>";
    data.subjects.forEach(function (sub) {
      ths += "<th>" + esc(sub) + "</th>";
    });
    ths += "<th class='col-tot500'>Total (500)</th><th>PED</th><th class='col-total'>Grand Total</th></tr>";

    var h = "<thead>" + ths + "</thead><tbody>";

    data.students.forEach(function (st, idx) {
      h += "<tr>" +
        "<td>" + (idx + 1) + "</td>" +
        "<td style='font-family:monospace;font-weight:600;'>" + esc(st.rollNo) + "</td>" +
        "<td class='col-name'>" + esc(st.name) + "</td>" +
        "<td class='col-stream'>" + esc(domainLabel(st.stream)) + "</td>";

      data.subjects.forEach(function (sub) {
        var mark = (st.marks && st.marks[sub] != null && st.marks[sub] !== "") ? st.marks[sub] : "-";
        var isFail = false;
        var num = parseFloat(mark);
        if (!isNaN(num) && mark !== "-" && mark !== "AB" && mark !== "ab") {
          if (num < 45) isFail = true;
        }
        var cellContent = isFail ? '<span class="mark-fail">' + esc(mark) + '</span>' : esc(mark);
        h += "<td>" + cellContent + "</td>";
      });

      var tot500 = st.total500 != null ? st.total500 : "-";
      var ped = st.ped != null ? st.ped : "-";
      var grandTot = st.total != null ? st.total : "-";

      h += "<td class='col-tot500'>" + esc(tot500) + "</td>" +
        "<td>" + esc(ped) + "</td>" +
        "<td class='col-total'>" + esc(grandTot) + "</td>" +
        "</tr>";
    });

    h += "</tbody>";
    tbl.innerHTML = h;
    scroll.appendChild(tbl);
    host.appendChild(scroll);
  }

  function showSectionSheet(seriesKey, requestedMode) {
    currentLeaderboardScope = null;
    currentStudentRoll = null;
    currentMentorUrl = null;
    currentSectionKey = seriesKey;

    var examMode = requestedMode || currentMode || "TE 1";
    if (examMode === "PE - Analysis") examMode = "TE 1";
    currentMode = examMode;
    updateToolbarModeOptions(false, examMode);

    var host = $("#report");
    host.innerHTML = "";
    host.appendChild(el("p", "lb-asof", "Loading section mark sheet&hellip;"));

    $("#downloadBtn").style.display = "none";
    if ($("#downloadLandscapeBtn")) $("#downloadLandscapeBtn").style.display = "inline-flex";
    showView("report");

    var grade = "12";
    updateToolbarGradeOptions(grade);
    BANNER = "Grade XII · Team Elevate 2027";

    apiGet("/api/leaderboard?scope=section&section=" + encodeURIComponent(seriesKey) + "&grade=12&mode=" + encodeURIComponent(examMode) + "&fresh=1&_t=" + Date.now())
      .then(function (resp) {
        absorbMeta(resp);
        host.innerHTML = "";
        if (resp.exam) {
          currentMode = resp.exam;
          updateToolbarModeOptions(false, resp.exam);
        }
        renderSectionSheet(host, resp);
      })
      .catch(function (e) {
        host.innerHTML = "";
        host.appendChild(el("p", "note-pending", "Could not load section mark sheet. " + esc(e.message)));
      });
  }

  function showLeaderboard(scope, renderFn, btn, requestedMode) {
    if (btn) btn.disabled = true;
    currentLeaderboardScope = scope;
    currentLeaderboardRenderFn = renderFn;
    currentLeaderboardBtn = btn;
    currentStudentRoll = null;
    currentMentorUrl = null;
    currentSectionKey = null;
    if ($("#downloadLandscapeBtn")) $("#downloadLandscapeBtn").style.display = "none";
    if ($("#downloadBtn")) $("#downloadBtn").style.display = "";

    var examMode = requestedMode || currentMode || "TE 1";
    if (examMode === "PE - Analysis") examMode = "TE 1";
    currentMode = examMode;
    updateToolbarModeOptions(false, examMode);

    var host = $("#report");
    host.innerHTML = "";
    host.appendChild(el("p", "lb-asof", "Loading&hellip;"));
    $("#downloadBtn").hidden = false;
    showView("report");

    var grade = currentStudentGrade || ($("#grade") ? $("#grade").value : "12");
    updateToolbarGradeOptions(grade);
    if (grade === "10" || grade === "X") BANNER = "Grade X · Academic Session 2026-27";
    else if (grade === "11" || grade === "XI") BANNER = "Grade XI · Academic Session 2026-27";
    else BANNER = "Grade XII · Team Elevate 2027";
    apiGet("/api/leaderboard?scope=" + scope + "&n=5&grade=" + encodeURIComponent(grade) + "&mode=" + encodeURIComponent(examMode) + "&fresh=1&_t=" + Date.now())
      .then(function (resp) {
        absorbMeta(resp);
        host.innerHTML = "";
        if (resp.exam) {
          currentMode = resp.exam;
          updateToolbarModeOptions(false, resp.exam);
        }
        renderFn(host, resp);
      })
      .catch(function (e) {
        host.innerHTML = "";
        host.appendChild(el("p", "note-pending", "Could not load rankings. " + esc(e.message)));
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  var reportModeSelect = $("#reportModeSelect");
  if (reportModeSelect) {
    reportModeSelect.addEventListener("change", function () {
      var newMode = this.value;
      if (currentSectionKey) {
        showSectionSheet(currentSectionKey, newMode);
      } else if (currentLeaderboardScope) {
        var renderFn = currentLeaderboardScope === "school" ? renderSchoolTop : (currentLeaderboardScope === "stream" ? renderStreamTop : renderSlowLearners);
        var btn = currentLeaderboardScope === "school" ? $("#topSchoolBtn") : (currentLeaderboardScope === "stream" ? $("#topStreamBtn") : $("#slowLearnersBtn"));
        showLeaderboard(currentLeaderboardScope, renderFn, btn, newMode);
      } else if (currentStudentRoll) {
        fetchStudentReport(currentStudentRoll, newMode, currentStudentGrade);
      }
    });
  }

  var reportGradeSelect = $("#reportGradeSelect");
  if (reportGradeSelect) {
    reportGradeSelect.addEventListener("change", function () {
      var newGrade = this.value;
      currentStudentGrade = newGrade;
      if ($("#grade")) $("#grade").value = newGrade;

      if (newGrade === "10" || newGrade === "X") BANNER = "Grade X · Academic Session 2026-27";
      else if (newGrade === "11" || newGrade === "XI") BANNER = "Grade XI · Academic Session 2026-27";
      else BANNER = "Grade XII · Team Elevate 2027";

      if (currentLeaderboardScope) {
        var renderFn = currentLeaderboardScope === "school" ? renderSchoolTop : (currentLeaderboardScope === "stream" ? renderStreamTop : renderSlowLearners);
        var btn = currentLeaderboardScope === "school" ? $("#topSchoolBtn") : (currentLeaderboardScope === "stream" ? $("#topStreamBtn") : $("#slowLearnersBtn"));
        showLeaderboard(currentLeaderboardScope, renderFn, btn, currentMode);
      } else if (currentStudentRoll) {
        fetchStudentReport(currentStudentRoll, currentMode, newGrade);
      }
    });
  }
  // ---------- Auth / Login ----------
  var SESSION_KEY = "akshara_lb_auth";

  function isAuthed() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      return s && s.until > Date.now();
    } catch (e) { return false; }
  }

  function saveSession(until) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ until: until }));
  }

  // pending leaderboard scope to launch after successful login
  var pendingScope = null;

  function openLogin(scope) {
    pendingScope = scope;
    $("#loginUser").value = "";
    $("#loginPass").value = "";
    $("#loginMsg").className = "message";
    $("#loginMsg").innerHTML = "";
    $("#loginOverlay").hidden = false;
    setTimeout(function () { $("#loginUser").focus(); }, 50);
  }

  function closeLogin() {
    $("#loginOverlay").hidden = true;
    pendingScope = null;
  }

  $("#loginCancelBtn").addEventListener("click", closeLogin);
  $("#loginOverlay").addEventListener("click", function (ev) {
    if (ev.target === this) closeLogin();
  });

  var toggleStaffPassBtn = $("#toggleStaffPassBtn");
  if (toggleStaffPassBtn) {
    toggleStaffPassBtn.addEventListener("click", function () {
      var passInput = $("#loginPass");
      if (passInput) {
        var isPass = passInput.type === "password";
        passInput.type = isPass ? "text" : "password";
        toggleStaffPassBtn.innerHTML = isPass
          ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
          : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      }
    });
  }

  $("#loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("#loginBtn");
    var msgEl = $("#loginMsg");
    var username = $("#loginUser").value.trim();
    var password = $("#loginPass").value;
    btn.disabled = true;
    msgEl.className = "message";
    msgEl.innerHTML = "";

    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (res.body.ok) {
          saveSession(res.body.until);
          var scope = pendingScope;
          closeLogin();
          if (scope === "school") showLeaderboard("school", renderSchoolTop, $("#topSchoolBtn"));
          else if (scope === "stream") showLeaderboard("stream", renderStreamTop, $("#topStreamBtn"));
          else if (scope === "slow") showLeaderboard("slow", renderSlowLearners, $("#slowLearnersBtn"));
        } else {
          msgEl.className = "message error";
          msgEl.innerHTML = esc(res.body.error || "Invalid credentials");
          btn.disabled = false;
        }
      })
      .catch(function () {
        msgEl.className = "message error";
        msgEl.innerHTML = "Could not reach server. Try again.";
        btn.disabled = false;
      });
  });

  function guardedLeaderboard(scope, renderFn, btn) {
    if (isAuthed()) {
      showLeaderboard(scope, renderFn, btn);
    } else {
      openLogin(scope);
    }
  }

  $("#topSchoolBtn").addEventListener("click", function (ev) { guardedLeaderboard("school", renderSchoolTop, ev.currentTarget); });
  $("#topStreamBtn").addEventListener("click", function (ev) { guardedLeaderboard("stream", renderStreamTop, ev.currentTarget); });
  var slowLearnersBtn = $("#slowLearnersBtn");
  if (slowLearnersBtn) {
    slowLearnersBtn.addEventListener("click", function (ev) { guardedLeaderboard("slow", renderSlowLearners, ev.currentTarget); });
  }

  ["btnHarmony", "btnMelody1", "btnMelody2", "btnSymphony"].forEach(function (id) {
    var b = $("#" + id);
    if (!b) return;
    b.addEventListener("click", function () {
      var series = b.getAttribute("data-series");
      if (series) showSectionSheet(series, currentMode);
    });
  });

  // ---------- PDF export (jsPDF) ----------
  function buildExamPDF(m, s, exam) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth();
    var GOLD = [201, 154, 30];

    var overallEx = s.overall && s.overall[exam];
    var isSchoolTopper = !!(overallEx && overallEx.rank === 1 && overallEx.total > 0);
    var isStreamTopper = !!(overallEx && overallEx.domainRank === 1 && overallEx.total > 0 && !isSchoolTopper);

    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isSchoolTopper) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      var tw = doc.getTextWidth("OVERALL SCHOOL TOPPER");
      var bw = tw + 40;
      doc.setFillColor(255, 240, 180); doc.setDrawColor.apply(doc, [204, 153, 0]);
      doc.roundedRect(W / 2 - bw / 2, 40, bw, 16, 2, 2, "FD");
      doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("OVERALL SCHOOL TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    } else if (isStreamTopper) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      var tw = doc.getTextWidth("RANK 1 \u00B7 STREAM TOPPER");
      var bw = tw + 40;
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - bw / 2, 40, bw, 16, 2, 2, "FD");
      doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 \u00B7 STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(m.label + " \u00B7 " + exam + " \u00B7 Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

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
      ["Stream", m.label, "Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"],
      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
    ];
    y = drawTable(doc, {
      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],
      fontSize: 9.5, body: info
    });

    y = sectionBar(doc, y + 14, "Academic Performance \u00B7 marks out of " + MAXSUB + " per subject");
    
    var isClass12 = (currentStudentGrade === "12" || currentStudentGrade === "XII" || !currentStudentGrade) ||
                    (typeof $("#grade") !== "undefined" && $("#grade") && ($("#grade").value === "12" || $("#grade").value === "XII"));
    var failCutoff = isClass12 ? 45 : 30;

    var head = ["Subject", "Marks Obtained", "Class Highest", "Percentage"];
    var rows = [];
    m.subjects.forEach(function (code) {
      var full = (m.subjectFull && m.subjectFull[code] && m.subjectFull[code] !== code) ? m.subjectFull[code] : getSubjectFullName(code);
      var r = [(full || code) + " (" + code + ")"];
      var rawVal = s.marks[exam][code];
      var isAbsent = (rawVal === "AB" || rawVal === "ab");
      var v = (rawVal == null || isAbsent || rawVal === "") ? 0 : rawVal;
      var numV = parseFloat(v) || 0;
      var cs = m.classStats[exam] && m.classStats[exam].subjects[code];
      var isTop = cs && numV > 0 && numV === cs.max;
      var isFail = !isAbsent && rawVal !== "" && rawVal != null && numV < failCutoff;

      if (isAbsent) {
        r.push("AB");
      } else if (isTop) {
        r.push({ text: String(v), isTop: true });
      } else if (isFail) {
        r.push({ text: String(v) + " (Fail)", isFail: true });
      } else {
        r.push(String(v));
      }
      r.push((cs && cs.max != null) ? String(cs.max) : "-");
      r.push(Math.round(numV / MAXSUB * 1000)/10 + "%");
      rows.push(r);
    });
    var hasPE = m.subjects.some(function (code) { return isPhysicalEducation(code); });
    var isTEWithPE = isClass12 && (exam === "TE 1" || exam === "TE 2") && hasPE;
    var maxTotal = isTEWithPE ? 500 : (m.subjects.length * MAXSUB);

    var totRow = ["Total"];
    var tot = 0;
    var hasAnyMark = false;
    m.subjects.forEach(function (code) {
      if (isTEWithPE && isPhysicalEducation(code)) return;
      var rawVal = s.marks[exam] ? s.marks[exam][code] : null;
      var val = (rawVal == null || rawVal === "AB" || rawVal === "ab" || rawVal === "") ? 0 : rawVal;
      if (rawVal != null && rawVal !== "") hasAnyMark = true;
      tot += (parseFloat(val) || 0);
    });
    if (!hasAnyMark) tot = (s.marks[exam] && s.marks[exam].Total != null) ? s.marks[exam].Total : null;

    totRow.push(tot != null ? String(tot) : "-");
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

    var fn = s.name.replace(/\s+/g, "_") + "_" + exam.replace(/\s+/g, "") + "_Report.pdf";
    doc.save(fn);
  }

  function pdfHeader(doc, title, subtitle) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text(title, W / 2, 52, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(subtitle, W / 2, 68, { align: "center" });
    return 84;
  }

  function buildSchoolTopPDF() {
    if (!lastSchoolTop) return;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var top = lastSchoolTop;
    var maxTot = maxTotalMarks();

    var y = pdfHeader(doc, "Top Performers",
      "School-wide · Academic Year " + DATA.meta.academicYear);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Ranking as of " + top.exam + " · out of " + top.classSize + " students", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
    y += 16;

    var rows = top.list.map(function (s) {
      var e = s.exams[top.exam];
      var pct = pctObtained(e.total, maxTot);
      var rankCell = e.rank === 1 ? { text: String(e.rank), isTop: true } : String(e.rank);
      return [rankCell, s.name, s.rollNo, domainLabel(s.domainName),
        e.total + " / " + maxTot, pct != null ? pct + "%" : "-"];
    });
    drawTable(doc, {
      startY: y, colWidths: [50, 140, 85, 110, 75, 55],
      aligns: ["center", "left", "center", "center", "center", "center"],
      fontSize: 9, head: ["Rank", "Name", "Roll No", "Stream", "Total Marks", "Percentage"], body: rows
    });

    doc.save("Top_Performers_School_" + top.exam.replace(/\s+/g, "") + ".pdf");
  }

  function buildStreamTopPDF() {
    if (!lastStreamTop) return;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var top = lastStreamTop;
    var maxTot = maxTotalMarks();
    var pageH = doc.internal.pageSize.getHeight();

    var y = pdfHeader(doc, "Top Performers by Stream", "Academic Year " + DATA.meta.academicYear);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Ranking as of " + top.exam, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
    y += 16;

    top.groups.forEach(function (g) {
      var blockH = 24 + 20 + g.list.length * 19 + 14;
      if (y + blockH > pageH - 40) { doc.addPage(); y = 40; }
      y = sectionBar(doc, y, domainLabel(g.domain) + " · " + g.size + " students");
      var rows = g.list.map(function (s) {
        var e = s.exams[top.exam];
        var pct = pctObtained(e.total, maxTot);
        var rankCell = e.domainRank === 1 ? { text: String(e.domainRank), isTop: true } : String(e.domainRank);
        return [rankCell, s.name, s.rollNo, e.total + " / " + maxTot, pct != null ? pct + "%" : "-"];
      });
      y = drawTable(doc, {
        startY: y, colWidths: [60, 175, 100, 95, 85],
        aligns: ["center", "left", "center", "center", "center"],
        fontSize: 9, head: ["Rank", "Name", "Roll No", "Total Marks", "Percentage"], body: rows
      });
      y += 14;
    });

    doc.save("Top_Performers_by_Stream_" + top.exam.replace(/\s+/g, "") + ".pdf");
  }

  function buildSlowLearnersPDF() {
    if (!lastSlowLearners) return;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var data = lastSlowLearners;
    var isClass12 = (currentStudentGrade === "12" || currentStudentGrade === "XII" || !currentStudentGrade) ||
                    (data && (data.grade === "12" || data.grade === "XII"));
    var cutoff = (data && data.failThreshold) || (isClass12 ? 45 : 30);
    var minFails = (data && data.minFailsRequired != null) ? data.minFailsRequired : (isClass12 ? 1 : 4);
    var criteriaDesc = minFails === 1
      ? "Students who failed in 1 or more subjects (< " + cutoff + ")"
      : "Students who failed in more than 3 subjects (< " + cutoff + ")";

    var y = pdfHeader(doc, "Aspiring Achievers", "Academic Year " + DATA.meta.academicYear);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(criteriaDesc + " as of " + data.exam + " · " + data.list.length + " students", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
    y += 16;

    var rows = data.list.map(function (s, idx) {
      var fails = (s.failedSubjects || []).map(function (f) { return f.code + " (" + f.mark + ")"; }).join(", ");
      return [String(idx + 1), s.name, s.rollNo, domainLabel(s.domainName), fails, String(s.failedCount), String(s.total)];
    });
    drawTable(doc, {
      startY: y, colWidths: [30, 115, 75, 95, 145, 40, 50],
      aligns: ["center", "left", "center", "center", "left", "center", "center"],
      fontSize: 8.5, head: ["#", "Name", "Roll No", "Stream", "Failed Subjects (<" + cutoff + ")", "Fails", "Total"], body: rows
    });

    doc.save("Aspiring_Achievers_" + data.exam.replace(/\s+/g, "") + ".pdf");
  }

  function buildSectionLandscapePDF() {
    if (!lastSectionData) return;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    var data = lastSectionData;
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();

    function drawLandscapeHeader() {
      doc.setFillColor(209, 213, 219); doc.rect(0, 0, pageW, 8, "F");
      doc.setFillColor(183, 22, 28); doc.rect(0, 0, pageW, 6, "F");

      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(20, 30, 48);
      doc.text(BANNER, pageW / 2, 26, { align: "center" });

      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(183, 22, 28);
      doc.text("Class 12 — " + data.sectionName + " Mark Sheet", pageW / 2, 44, { align: "center" });

      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90);
      var year = (DATA && DATA.meta && DATA.meta.academicYear) || "2026 - 2027";
      var subText = "Academic Year " + year + "  ·  Exam: " + data.exam + "  ·  Total Students: " + data.students.length + "  ·  Generated: " + today();
      doc.text(subText, pageW / 2, 58, { align: "center" });
    }

    var startY = 70;
    var x0 = 35;
    var usableW = pageW - x0 * 2;

    var subs = data.subjects || [];
    var nSubs = subs.length || 1;
    var subColW = Math.floor((usableW - 464) / nSubs);

    var colWidths = [24, 56, 135, 85];
    var aligns = ["center", "center", "left", "left"];
    var headRow = ["#", "Roll No", "Student Name", "Stream"];

    subs.forEach(function (s) {
      colWidths.push(subColW);
      aligns.push("center");
      headRow.push(s);
    });

    colWidths.push(62, 40, 62);
    aligns.push("center", "center", "center");
    headRow.push("Total (500)", "PED", "Grand Total");

    var sumColW = colWidths.reduce(function (a, b) { return a + b; }, 0);
    var diff = usableW - sumColW;
    if (diff !== 0) {
      colWidths[2] += diff;
    }

    var headH = 20;
    var rowH = 15.5;
    var y = startY;

    function renderTableRow(cells, h, isHeader, isEven) {
      var x = x0;
      cells.forEach(function (cellData, i) {
        var w = colWidths[i];
        var text = (typeof cellData === "object" && cellData !== null) ? cellData.text : cellData;
        var isFail = (typeof cellData === "object" && cellData !== null) ? cellData.isFail : false;

        if (isHeader) {
          doc.setFillColor(241, 245, 249);
        } else if (isEven) {
          doc.setFillColor(248, 250, 252);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(x, y, w, h, "F");

        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, w, h, "S");

        var bold = isHeader || isFail || (i === 0);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(isHeader ? 8 : 7.5);

        if (isHeader) {
          doc.setTextColor(30, 41, 59);
        } else if (isFail) {
          doc.setTextColor(220, 38, 38);
        } else {
          doc.setTextColor(40, 45, 55);
        }

        var align = aligns[i];
        var pad = 4;
        var tx = align === "left" ? x + pad : (align === "right" ? x + w - pad : x + w / 2);
        doc.text(String(text != null ? text : "-"), tx, y + h / 2 + 0.5, { align: align, baseline: "middle" });
        x += w;
      });
      y += h;
    }

    drawLandscapeHeader();
    renderTableRow(headRow, headH, true, false);

    data.students.forEach(function (st, idx) {
      if (y + rowH > pageH - 28) {
        doc.addPage();
        y = 70;
        drawLandscapeHeader();
        renderTableRow(headRow, headH, true, false);
      }

      var rowCells = [
        String(idx + 1),
        st.rollNo || "-",
        st.name || "-",
        domainLabel(st.stream || "")
      ];

      subs.forEach(function (sub) {
        var raw = (st.marks && st.marks[sub] != null && st.marks[sub] !== "") ? st.marks[sub] : "-";
        var isFail = false;
        var numV = parseFloat(raw);
        if (!isNaN(numV) && raw !== "-" && String(raw).toUpperCase() !== "AB") {
          if (numV < 45) isFail = true;
        }
        rowCells.push(isFail ? { text: String(raw), isFail: true } : String(raw));
      });

      var tot500 = st.total500 != null ? String(st.total500) : "-";
      var ped = st.ped != null ? String(st.ped) : "-";
      var grandTot = st.total != null ? String(st.total) : "-";

      rowCells.push(tot500, ped, grandTot);

      renderTableRow(rowCells, rowH, false, idx % 2 === 1);
    });

    if (y + 20 <= pageH - 15) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text("* Red indicates mark < 45. Total (500) excludes Physical Education (PED). Grand Total includes all evaluated subjects.", x0, y + 14);
    }

    var fileName = data.sectionName.replace(/\s+/g, "_") + "_" + (data.exam || "Exam").replace(/\s+/g, "") + "_MarkSheet_Landscape.pdf";
    doc.save(fileName);
  }

  function buildPDF(mode, student) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "a4" });
    var m = DATA.modes[mode];
    var W = doc.internal.pageSize.getWidth();
    var GOLD = [201, 154, 30];
    
    var latest = latestConductedExam(m);
    var latestEx = student.exams[latest];
    var isSchoolTopper = !!(latestEx && latestEx.rank === 1 && latestEx.total > 0);
    var isStreamTopper = !!(latestEx && latestEx.domainRank === 1 && latestEx.total > 0 && !isSchoolTopper);

    doc.setFillColor(209, 213, 219); doc.rect(0, 0, W, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 30, 48);
    doc.text(BANNER, W / 2, 32, { align: "center" });

    var titleY = 52, subY = 68, infoStartY = 84;
    if (isSchoolTopper) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      var tw = doc.getTextWidth("OVERALL SCHOOL TOPPER");
      var bw = tw + 40;
      doc.setFillColor(255, 240, 180); doc.setDrawColor.apply(doc, [204, 153, 0]);
      doc.roundedRect(W / 2 - bw / 2, 40, bw, 16, 2, 2, "FD");
      doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("OVERALL SCHOOL TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    } else if (isStreamTopper) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      var tw = doc.getTextWidth("RANK 1 \u00B7 STREAM TOPPER");
      var bw = tw + 40;
      doc.setFillColor(253, 246, 227); doc.setDrawColor.apply(doc, GOLD);
      doc.roundedRect(W / 2 - bw / 2, 40, bw, 16, 2, 2, "FD");
      doc.setTextColor.apply(doc, [122, 89, 0]);
      doc.text("RANK 1 \u00B7 STREAM TOPPER", W / 2, 50.5, { align: "center" });
      titleY = 72; subY = 88; infoStartY = 100;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(183, 22, 28);
    doc.text("Student Analysis Report", W / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text("PE - Analysis \u00B7 Academic Year " + DATA.meta.academicYear, W / 2, subY, { align: "center" });

    var y = infoStartY;
    if (isSchoolTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Outstanding Achievement - " + student.name + " holds Rank 1 out of the entire school in " + latest + ".", W / 2, y, { align: "center" });
      y += 14;
    } else if (isStreamTopper) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 67, 0);
      doc.text("Congratulations - " + student.name + " holds Rank 1 in their stream in " + latest + ".", W / 2, y, { align: "center" });
      y += 14;
    }

    var info = [
      ["Name", student.name, "Roll Number", student.rollNo],
      ["Stream", (student.stream || []).join("-") || "\u2014", "Cohort Size", DATA.modes["PE - Analysis"].classSize + " students"],
      ["Academic Year", DATA.meta.academicYear, "Report Date", today()]
    ];
    y = drawTable(doc, {
      startY: y, colWidths: [85, 175, 95, 125], aligns: ["left", "left", "left", "left"],
      fontSize: 9.5, body: info
    });
    analysisPDF(doc, DATA.modes[mode], student, y);
    var fn = student.name.replace(/\s+/g, "_") + "_PE-Analysis_Report.pdf";
    doc.save(fn);
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
        var isFail = (typeof cellData === "object" && cellData !== null) ? cellData.isFail : false;
        doc.setFillColor.apply(doc, sty.fill);
        doc.rect(x, y, w, h, "F");
        doc.setDrawColor(217, 222, 231); doc.setLineWidth(0.75);
        doc.rect(x, y, w, h, "S");
        var bold = sty.bold || (sty.boldFirst && i === 0) || isTop || isFail;
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(sty.fontSize);
        var textColor = isTop ? [154, 106, 0] : (isFail ? [220, 38, 38] : sty.textColor);
        doc.setTextColor.apply(doc, textColor);
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

    var latest = latestConductedExam(m);
    var latestEx = s.exams[latest];
    var pctLatest = pctObtained(latestEx.total, maxTot);
    var boxes = [
      { num: latestEx.total + " / " + maxTot, label: "Total Marks (" + latest + ")" },
      { num: rankText(latestEx.domainRank, latestEx.domainSize), label: "Rank (in stream)" },
      { num: (pctLatest != null ? pctLatest + "%" : "-"), label: "Percentage" }
    ];
    y = statBoxes(doc, y + 14, boxes);
    footerNote(doc, m, y);
  }

  function footerNote(doc, m, y) {
    var pend = pendingExams(m);
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
    if (pend.length) {
      var done = conductedExams(m);
      doc.text("Note: " + done.join(", ") + " ha" + (done.length === 1 ? "s" : "ve") +
        " been conducted. Pending: " + pend.join(", ") + ".", 40, y, { maxWidth: doc.internal.pageSize.getWidth() - 80 });
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
    if (!pill) return;
    pill.className = "status-pill " + state;
    var txtEl = $("#statusText");
    if (txtEl) txtEl.textContent = text;
    if (title) pill.title = title;
  }
  function fmtTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- load report data (from our backend, which owns the live fetch) ----------
  function applyData(res) {
    absorbMeta(res);
    $("#submitBtn").disabled = false;
    $("#topSchoolBtn").disabled = false;
    $("#topStreamBtn").disabled = false;
    if ($("#slowLearnersBtn")) $("#slowLearnersBtn").disabled = false;
    ["btnHarmony", "btnMelody1", "btnMelody2", "btnSymphony"].forEach(function (id) {
      var b = $("#" + id);
      if (b) b.disabled = false;
    });
    if (res.live) {
      setStatus("live", "Live · " + fmtTime(new Date(res.when)), "Loaded live from Google Sheets.");
    } else {
      setStatus("offline", "Offline snapshot", "Could not reach Google Sheets" +
        (res.error ? " (" + res.error + ")" : "") + " — showing the last saved snapshot.");
    }
  }

  function load(isRefresh) {
    var grade = $("#grade") ? $("#grade").value : "12";
    if (grade === "10" || grade === "X") BANNER = "Grade X · Academic Session 2026-27";
    else if (grade === "11" || grade === "XI") BANNER = "Grade XI · Academic Session 2026-27";
    else BANNER = "Grade XII · Team Elevate 2027";

    setStatus("loading", isRefresh ? "Refreshing..." : "Connecting...", "Contacting the server");
    return apiGet("/api/meta?grade=" + encodeURIComponent(grade) + "&_t=" + Date.now() + (isRefresh ? "&fresh=1" : "")).then(applyData).catch(function (e) {
      setStatus("offline", "Data unavailable", String(e && e.message || e));
    });
  }

  // click the pill to refresh live data on demand
  var statusPill = $("#statusPill");
  if (statusPill) {
    statusPill.addEventListener("click", function () {
      if (statusPill.classList.contains("loading")) return;
      load(true);
    });
  }

  load(false);
})();
