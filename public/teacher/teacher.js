/* Teacher Portal – Mark Entry JS
   Loads students for a stream + exam and lets teachers type marks into
   a spreadsheet-like table. Tab/Enter navigate between cells.
   Changed cells are highlighted; Save All pushes to /api/teacher/save. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  /* ── State ── */
  var currentGrade  = "12";
  var currentStream = "Bio - Maths";
  var currentExam   = "CU 1";
  var studentRows   = [];      // data returned by API
  var subjectCols   = [];      // subject short codes
  var dirtyRolls    = {};      // rollNo → { marks: { subj: val } }

  /* ── Auth State & Helper ── */
  var PORTAL_VERSION = "20"; // bump this when allowedStreams/allowedCodes change
  if (localStorage.getItem("teacher_portal_version") !== PORTAL_VERSION) {
    localStorage.removeItem("teacher_info"); // force re-login with fresh permissions
    localStorage.removeItem("teacher_token");
    localStorage.setItem("teacher_portal_version", PORTAL_VERSION);
  }
  var token = localStorage.getItem("teacher_token") || "";

  function getAuthHeaders() {
    return token ? { "Authorization": "Bearer " + token } : {};
  }

  /* ── DOM refs ── */
  var tHead         = $("#tableHead");
  var tBody         = $("#tableBody");
  var tFoot         = $("#tableFoot");
  var titleEl       = $("#tableTitle");
  var msgEl         = $("#teacherMsg");
  var saveBtn       = $("#saveMarksBtn");
  var searchBox     = $("#searchInput");
  var countEl       = $("#studentCount");
  var filledEl      = $("#filledCount");
  var emptyEl       = $("#emptyCount");
  var loginModal    = $("#loginModal");
  var loginForm     = $("#loginForm");
  var loginMsg      = $("#loginMsg");
  var logoutBtn     = $("#logoutBtn");
  var saveStatusText = $("#saveStatusText");
  var saveStatus     = document.querySelector(".save-status");
  var exportExcelBtn = $("#exportExcelBtn");

  /* ═══════════ Init ═══════════ */
  wireGradeButtons();
  wireStreamCards();
  wireExamTabs();
  saveBtn.addEventListener("click", saveAll);
  if (exportExcelBtn) exportExcelBtn.addEventListener("click", exportToExcel);
  searchBox.addEventListener("input", filterRows);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  function exportToExcel() {
    if (!studentRows || !studentRows.length) {
      showMsg("No student data available to export.", "info");
      return;
    }

    var isMentor = (currentStream === "Mentor Report");
    var headers = ["S.No", "Roll No", "Student Name"].concat(subjectCols);
    if (!isMentor) headers.push("Total");

    var rows = [headers];
    studentRows.forEach(function (st, idx) {
      var r = [st.sNo || (idx + 1), st.rollNo, st.name];
      subjectCols.forEach(function (s) {
        var v = st.marks[s];
        r.push((v === null || v === undefined) ? "" : v);
      });
      if (!isMentor) r.push(computeTotal(st.marks));
      rows.push(r);
    });

    var csvContent = rows.map(function (row) {
      return row.map(function (val) {
        var str = String(val == null ? "" : val).replace(/"/g, '""');
        return '"' + str + '"';
      }).join(",");
    }).join("\r\n");

    var blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var filename = "Grade_" + currentGrade + "_" + currentStream.replace(/[^a-zA-Z0-9]/g, "_") + "_" + currentExam.replace(/[^a-zA-Z0-9]/g, "_") + ".csv";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMsg("Exported " + filename + " successfully!", "ok");
  }

  function updateGradeStreamVisibility() {
    var cards = document.querySelectorAll(".stream-card");
    var g = String(currentGrade);
    var info = getTeacherInfo();
    var allowedStreams = (info && !info.isAdmin && Array.isArray(info.allowedStreams)) ? info.allowedStreams : null;
    var firstVisibleCard = null;

    cards.forEach(function (c) {
      var st = c.dataset.stream;
      var isG10Stream = (st === "X Harmony" || st === "X Melody" || st === "X Symphony");
      var isG1112Stream = (st === "Bio - Maths" || st === "Bio - CS" || st === "Maths - CS" || st === "Applied Math" || st === "CS");

      // Check grade visibility
      var gradeOk;
      if (g === "10") {
        gradeOk = !isG1112Stream;
      } else {
        gradeOk = !isG10Stream;
      }

      // Check teacher stream permission (PE-Analysis/Rankwise/Mentor always visible as read-only)
      var specialStream = (st === "PE - Analysis" || st === "Rankwise" || st === "Mentor Report");
      var streamOk = !allowedStreams || specialStream ||
        allowedStreams.some(function (s) { return String(s).toLowerCase() === String(st).toLowerCase(); });

      if (gradeOk && streamOk) {
        c.style.display = "";
        if (!firstVisibleCard && (isG1112Stream || isG10Stream || specialStream)) {
          firstVisibleCard = c;
        }
      } else {
        c.style.display = "none";
      }
    });

    var currentCard = document.querySelector('.stream-card[data-stream="' + CSS.escape(currentStream) + '"]');
    if (currentCard && currentCard.style.display === "none") {
      if (firstVisibleCard) {
        cards.forEach(function (x) { x.classList.remove("active"); });
        firstVisibleCard.classList.add("active");
        currentStream = firstVisibleCard.dataset.stream;
      }
    }
  }

  function wireGradeButtons() {
    var btns = document.querySelectorAll(".grade-btn");
    btns.forEach(function (b) {
      if (b.dataset.grade === currentGrade) b.classList.add("active");
      else b.classList.remove("active");

      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        currentGrade = b.dataset.grade;
        localStorage.setItem("teacher_grade", currentGrade);
        updateGradeStreamVisibility();
        resetDirty();
        loadData();
      });
    });
    updateGradeStreamVisibility();
  }
  var togglePassBtn = $("#togglePassBtn");
  if (togglePassBtn) {
    togglePassBtn.addEventListener("click", function () {
      var passInput = $("#loginPass");
      if (passInput) {
        var isPass = passInput.type === "password";
        passInput.type = isPass ? "text" : "password";
        togglePassBtn.innerHTML = isPass 
          ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
          : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var u = $("#loginUser").value.trim().toLowerCase();
      var p = $("#loginPass").value;
      loginMsg.style.display = "none";

      if (!u || !p) {
        loginMsg.textContent = "Please enter both username and password.";
        loginMsg.style.display = "block";
        return;
      }

      fetch("/api/teacher/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: u, pass: p })
      })
      .then(function (r) {
        return r.text().then(function (text) {
          var d;
          try { d = JSON.parse(text); } catch(e) { d = { error: "Server returned non-JSON: " + text.substring(0, 200) }; }
          if (r.ok && d.ok && d.token) {
            token = d.token;
            localStorage.setItem("teacher_token", token);
            if (d.teacher) {
              localStorage.setItem("teacher_info", JSON.stringify(d.teacher));
            } else {
              localStorage.removeItem("teacher_info");
            }
            checkAuth();
          } else {
            loginMsg.textContent = d.error || ("Login failed (HTTP " + r.status + ")");
            loginMsg.style.display = "block";
          }
        });
      })
      .catch(function (err) {
        loginMsg.textContent = "Network error: " + err.message;
        loginMsg.style.display = "block";
      });
    });
  }

  function getTeacherInfo() {
    try {
      var raw = localStorage.getItem("teacher_info");
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function isSubjectAllowed(subj) {
    var info = getTeacherInfo();
    if (!info || info.isAdmin || !info.allowedCodes) return true; // Admin has full edit access
    var codes = info.allowedCodes;
    if (!Array.isArray(codes)) return true;
    var target = String(subj).toLowerCase();
    return codes.some(function (c) {
      return String(c).toLowerCase() === target;
    });
  }

  function isStreamAllowed(streamName) {
    var info = getTeacherInfo();
    if (!info || info.isAdmin || !info.allowedStreams) return true; // Admin or full access
    if (streamName === "PE - Analysis" || streamName === "Rankwise" || streamName === "Mentor Report") return true; // Read-only viewing allowed
    var streams = info.allowedStreams;
    if (!Array.isArray(streams)) return true;
    var target = String(streamName).toLowerCase();
    return streams.some(function (s) {
      return String(s).toLowerCase() === target;
    });
  }

  function logout() {
    token = "";
    localStorage.removeItem("teacher_token");
    localStorage.removeItem("teacher_info");
    checkAuth();
  }

  function autoSelectTeacherStream() {
    updateGradeStreamVisibility();
    var info = getTeacherInfo();
    if (!info || info.isAdmin || !info.allowedStreams) return;
    var cards = document.querySelectorAll(".stream-card");
    var firstAllowed = null;
    cards.forEach(function (c) {
      var st = c.dataset.stream;
      if (c.style.display !== "none" && isStreamAllowed(st) && st !== "PE - Analysis" && st !== "Rankwise" && !firstAllowed) {
        firstAllowed = c;
      }
    });

    if (firstAllowed && (!isStreamAllowed(currentStream) || currentStream === "PE - Analysis" || currentStream === "Rankwise")) {
      cards.forEach(function (x) { x.classList.remove("active"); });
      firstAllowed.classList.add("active");
      currentStream = firstAllowed.dataset.stream;
    }
  }

  function checkAuth() {
    var badge = $("#teacherBadge");
    var layout = $("#teacherLayout");
    var info = getTeacherInfo();

    if (!token || !info) {
      token = "";
      localStorage.removeItem("teacher_token");
      localStorage.removeItem("teacher_info");
      if (loginModal) loginModal.style.display = "flex";
      if (layout) layout.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (badge) badge.style.display = "none";
    } else {
      if (loginModal) loginModal.style.display = "none";
      if (layout) layout.style.display = "";
      if (logoutBtn) logoutBtn.style.display = "inline-block";
      
      if (badge && info && info.name) {
        var subText = info.subjects ? (" &middot; <span style='font-weight:normal;opacity:0.85;'>" + esc(info.subjects) + "</span>") : "";
        badge.innerHTML = "👤 <strong>" + esc(info.name) + "</strong>" + subText;
        badge.style.display = "inline-flex";
      } else if (badge) {
        badge.style.display = "none";
      }
      autoSelectTeacherStream();
      loadData();
    }
  }

  checkAuth();

  /* ═══════════ Stream cards ═══════════ */
  function wireStreamCards() {
    var cards = document.querySelectorAll(".stream-card");
    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        cards.forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        currentStream = c.dataset.stream;
        resetDirty();

        // Always keep Save All Marks button visible for all streams and views
        var moduleTabs = $("#examTabs");
        if (currentStream === "PE - Analysis" || currentStream === "Rankwise") {
          if (moduleTabs) moduleTabs.style.display = "none";
        } else {
          if (moduleTabs) moduleTabs.style.display = "";
        }
        if (saveBtn) saveBtn.style.display = "";
        
        loadData();
      });
    });
  }

  /* ═══════════ Exam tabs ═══════════ */
  function wireExamTabs() {
    var tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        currentExam = t.dataset.exam;
        resetDirty();
        loadData();
      });
    });
  }

  /* ═══════════ Load data from server ═══════════ */
  function loadData() {
    showMsg("Loading...", "info");

    if (currentStream === "PE - Analysis" || currentStream === "Rankwise") {
      loadPeAnalysis();
      return;
    }

    fetch("/api/teacher/marks?stream=" + encodeURIComponent(currentStream) +
          "&exam=" + encodeURIComponent(currentExam) +
          "&grade=" + encodeURIComponent(currentGrade), {
      headers: getAuthHeaders()
    })
      .then(function (r) {
        if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
        return r.json();
      })
      .then(function (d) {
        if (d.error) { showMsg(d.error, "error"); return; }
        subjectCols = d.subjects || [];
        studentRows = (d.students || []).slice().sort(function (a, b) {
          return (a.sNo || 0) - (b.sNo || 0);
        });
        titleEl.textContent = "Grade " + currentGrade + " — " + currentStream + " (" + currentExam + ")";
        renderTable();
        hideMsg();
      })
      .catch(function (e) { showMsg("Network error: " + e.message, "error"); });
  }

  /* ═══════════ PE Analysis view ═══════════ */
  function loadPeAnalysis() {
    fetch("/api/teacher/pe-analysis?grade=" + encodeURIComponent(currentGrade), {
      headers: getAuthHeaders()
    })
      .then(function (r) {
        if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
        return r.json();
      })
      .then(function (d) {
        if (d.error) { showMsg(d.error, "error"); return; }
        renderPeTable(d);
        hideMsg();
      })
      .catch(function (e) { showMsg("Network error: " + e.message, "error"); });
  }

  function renderPeTable(d) {
    var exams = d.exams || [];
    var students = d.students || [];
    var stats = d.stats || {};

    titleEl.textContent = "PE Analysis — All Exams";

    // Header: S.No | Roll No | Student Name | Stream | CU1 Total | TE1 Total | CU2 Total | TE2 Total
    var thRow = "<tr><th>S.No</th><th>Roll No</th><th>Student Name</th><th>Stream</th>";
    exams.forEach(function (ex) {
      thRow += "<th>" + esc(ex) + "</th>";
    });
    thRow += "</tr>";
    tHead.innerHTML = thRow;

    // Body
    var html = "";
    students.forEach(function (st, idx) {
      html += '<tr data-roll="' + esc(st.rollNo) + '">';
      html += '<td class="sno">' + (st.sNo || idx + 1) + '</td>';
      html += '<td class="sno" style="font-weight:600;color:var(--fg);">' + esc(st.rollNo) + '</td>';
      html += '<td title="' + esc(st.rollNo) + '">' + esc(st.name) + '</td>';
      html += '<td class="sno">' + esc(st.stream) + '</td>';
      exams.forEach(function (ex) {
        var tot = st.exams[ex] ? st.exams[ex].total : 0;
        var rank = st.exams[ex] ? st.exams[ex].domainRank : null;
        var display = tot > 0 ? tot : "";
        var rankTxt = rank ? " (#" + rank + ")" : "";
        html += '<td><input type="text" class="mark-input pe-mark-input" ' +
                'data-roll="' + esc(st.rollNo) + '" ' +
                'data-exam="' + esc(ex) + '" ' +
                'value="' + esc(String(display)) + '" ' +
                'inputmode="decimal" autocomplete="off" />' +
                '<span class="pe-rank">' + rankTxt + '</span></td>';
      });
      html += '</tr>';
    });
    tBody.innerHTML = html;

    renderPeSubjectStats(exams, stats);

    // Update stats bar
    countEl.textContent = students.length + " students";
    filledEl.textContent = d.classSize + " class size";
    emptyEl.textContent = "";

    // Wire up input events for PE editable cells
    var inputs = tBody.querySelectorAll(".pe-mark-input");
    inputs.forEach(function (inp) {
      inp.addEventListener("input", onPeMarkInput);
      inp.addEventListener("keydown", onMarkKeydown);
      inp.addEventListener("focus", function () { this.select(); });
    });
  }

  function renderPeSubjectStats(exams, stats) {
    var footHtml = "";

    // Compute live stats from inputs
    var liveStats = {};
    exams.forEach(function (ex) { liveStats[ex] = []; });
    var rows = tBody.querySelectorAll("tr");
    rows.forEach(function (row) {
      var inputs = row.querySelectorAll(".pe-mark-input");
      inputs.forEach(function (inp) {
        var ex = inp.dataset.exam;
        var raw = inp.value.trim();
        if (raw !== "" && raw.toLowerCase() !== "ab") {
          var v = parseFloat(raw);
          if (!isNaN(v) && v > 0) liveStats[ex].push(v);
        }
      });
    });

    // Maximum Mark row
    footHtml += '<tr class="stat-row stat-max"><td></td><td></td><td class="stat-label" colspan="2">Maximum Mark</td>';
    exams.forEach(function (ex) {
      var arr = liveStats[ex];
      var maxVal = arr.length > 0 ? Math.max.apply(null, arr) : 0;
      footHtml += '<td class="stat-val">' + maxVal + '</td>';
    });
    footHtml += '</tr>';

    // Minimum Mark row
    footHtml += '<tr class="stat-row stat-min"><td></td><td></td><td class="stat-label" colspan="2">Minimum Mark</td>';
    exams.forEach(function (ex) {
      var arr = liveStats[ex];
      var minVal = arr.length > 0 ? Math.min.apply(null, arr) : 0;
      footHtml += '<td class="stat-val">' + minVal + '</td>';
    });
    footHtml += '</tr>';

    // Score range rows
    var RANGES = [
      { label: ">= 550",    min: 550, max: Infinity },
      { label: "500 - 549", min: 500, max: 549 },
      { label: "400 - 499", min: 400, max: 499 },
      { label: "300 - 399", min: 300, max: 399 },
      { label: "<= 299",    min: 0,   max: 299 }
    ];

    RANGES.forEach(function (r) {
      footHtml += '<tr class="stat-row"><td></td><td></td><td class="stat-label" colspan="2">' + r.label + '</td>';
      exams.forEach(function (ex) {
        var arr = liveStats[ex];
        var count = arr.filter(function (v) { return v >= r.min && v <= r.max; }).length;
        footHtml += '<td class="stat-val">' + count + '</td>';
      });
      footHtml += '</tr>';
    });

    tFoot.innerHTML = footHtml;
  }

  function onPeMarkInput(e) {
    var inp = e.target;
    var roll = inp.dataset.roll;
    var exam = inp.dataset.exam;
    var raw  = inp.value.trim();

    if (raw !== "" && raw.toLowerCase() !== "ab" && isNaN(parseFloat(raw))) {
      inp.classList.add("invalid");
      return;
    }
    inp.classList.remove("invalid");
    inp.classList.add("changed");

    if (!dirtyRolls[roll]) dirtyRolls[roll] = { exams: {} };
    if (!dirtyRolls[roll].exams) dirtyRolls[roll].exams = {};
    dirtyRolls[roll].exams[exam] = raw;
    updateSaveState();

    renderPeSubjectStats(["CU 1", "TE 1", "CU 2", "TE 2"], {});
  }

  /* ═══════════ Render the spreadsheet table ═══════════ */
  function renderTable() {
    var isMentor = (currentStream === "Mentor Report");
    var info = getTeacherInfo();
    var isAdmin = !info || info.isAdmin || !info.allowedCodes;

    // For non-admin teachers, only show their subject columns (+ always show Total)
    var visibleCols = subjectCols.filter(function (s) {
      if (isAdmin || isMentor) return true;
      return isSubjectAllowed(s);
    });
    // If no matching cols (shouldn't happen), fallback to all
    if (visibleCols.length === 0) visibleCols = subjectCols;

    // Header
    var thRow = "<tr><th>S.No</th><th>Roll No</th><th>Student Name</th>";
    visibleCols.forEach(function (s) {
      thRow += "<th" + (isMentor ? ' style="width:100%;"' : '') + ">" + esc(s) + "</th>";
    });
    if (!isMentor) thRow += "<th>Total</th>";
    thRow += "</tr>";
    tHead.innerHTML = thRow;

    // Body
    var html = "";
    var filledCells = 0, totalCells = 0;

    studentRows.forEach(function (st, idx) {
      html += '<tr data-roll="' + esc(st.rollNo) + '">';
      html += '<td class="sno">' + (st.sNo || idx + 1) + '</td>';
      html += '<td class="sno" style="font-weight:600;color:var(--fg);">' + esc(st.rollNo) + '</td>';
      html += '<td title="' + esc(st.rollNo) + '">' + esc(st.name) + '</td>';

      visibleCols.forEach(function (s) {
        var val = st.marks[s];
        var display = (val === null || val === undefined || val === "") ? "" : val;
        totalCells++;
        if (display !== "") filledCells++;
        
        var canEdit = isMentor ? true : isSubjectAllowed(s);

        var modeStr = isMentor ? 'type="url" inputmode="url" placeholder="Paste Google Drive link here..."' : 'type="text" inputmode="decimal"';
        var clsStr = isMentor ? 'mark-input mentor-input' : (canEdit ? 'mark-input' : 'mark-input disabled-input');
        var disabledAttr = canEdit ? '' : 'disabled title="Only authorized subject teacher can edit ' + esc(s) + '"';

        html += '<td' + (isMentor ? ' style="width:100%;padding:4px 8px;"' : '') + '><input ' + modeStr + ' class="' + clsStr + '" ' +
                'data-roll="' + esc(st.rollNo) + '" ' +
                'data-subj="' + esc(s) + '" ' +
                'value="' + esc(String(display)) + '" ' +
                disabledAttr + ' ' +
                'autocomplete="off" /></td>';
      });

      // Total column (auto-computed for exams)
      if (!isMentor) {
        html += '<td class="sno" id="total-' + esc(st.rollNo) + '">' + computeTotal(st.marks) + '</td>';
      }
      html += '</tr>';
    });

    tBody.innerHTML = html;
    updateStats(filledCells, totalCells);
    renderSubjectStats();
    updateSaveState();

    // Wire up input events
    var inputs = tBody.querySelectorAll(".mark-input");
    inputs.forEach(function (inp) {
      inp.addEventListener("input", onMarkInput);
      inp.addEventListener("keydown", onMarkKeydown);
      inp.addEventListener("focus", function () { this.select(); });
    });
  }

  /* ═══════════ Subject Statistics (tfoot) ═══════════ */
  function renderSubjectStats() {
    var info = getTeacherInfo();
    var isAdmin = !info || info.isAdmin || !info.allowedCodes;
    var isMentor = (currentStream === "Mentor Report");
    var visibleCols = subjectCols.filter(function (s) {
      if (isAdmin || isMentor) return true;
      return isSubjectAllowed(s);
    });
    if (visibleCols.length === 0) visibleCols = subjectCols;

    // Gather all mark values per subject from the current inputs
    var stats = {};
    visibleCols.forEach(function (s) { stats[s] = []; });

    var rows = tBody.querySelectorAll("tr");
    rows.forEach(function (row) {
      var inputs = row.querySelectorAll(".mark-input");
      inputs.forEach(function (inp) {
        var subj = inp.dataset.subj;
        var raw = inp.value.trim();
        if (!stats[subj]) stats[subj] = [];
        if (raw === "" || raw.toLowerCase() === "ab") {
          stats[subj].push(null); // absent
        } else {
          var v = parseFloat(raw);
          stats[subj].push(isNaN(v) ? null : v);
        }
      });
    });

    var totalStudents = studentRows.length;
    var PASS_MARK = 35; // pass threshold

    // Build stat rows
    var labels = [
      { key: "present",  label: "Students Present" },
      { key: "absent",   label: "Students Absent" },
      { key: "failures", label: "Student Failures" },
      { key: "average",  label: "Subject Average" },
      { key: "max",      label: "Maximum Mark" },
      { key: "min",      label: "Minimum Mark" }
    ];

    var footHtml = "";
    labels.forEach(function (row) {
      footHtml += '<tr class="stat-row stat-' + row.key + '">';
      footHtml += '<td></td>'; // S.No column
      footHtml += '<td class="stat-label">' + row.label + '</td>';

      var totalVal = 0;
      var totalCount = 0;

      visibleCols.forEach(function (s) {
        var arr = stats[s] || [];
        var present = arr.filter(function (v) { return v !== null; });
        var absent  = arr.filter(function (v) { return v === null; });
        var val = "";

        if (row.key === "present") {
          val = present.length;
        } else if (row.key === "absent") {
          val = absent.length;
        } else if (row.key === "failures") {
          val = present.filter(function (v) { return v < PASS_MARK; }).length;
        } else if (row.key === "average") {
          if (present.length > 0) {
            var sum = present.reduce(function (a, b) { return a + b; }, 0);
            val = (sum / present.length).toFixed(2);
          } else {
            val = "0.00";
          }
        } else if (row.key === "max") {
          val = present.length > 0 ? Math.max.apply(null, present) : 0;
        } else if (row.key === "min") {
          val = present.length > 0 ? Math.min.apply(null, present) : 0;
        }

        footHtml += '<td class="stat-val">' + val + '</td>';
      });

      footHtml += '<td class="stat-val"></td>'; // Total column
      footHtml += '</tr>';
    });

    tFoot.innerHTML = footHtml;
  }

  /* ═══════════ Cell input handler ═══════════ */
  function onMarkInput(e) {
    var inp = e.target;
    var roll = inp.dataset.roll;
    var subj = inp.dataset.subj;
    var raw  = inp.value.trim();

    // Validate: empty, "ab", or a number
    if (raw !== "" && raw.toLowerCase() !== "ab" && isNaN(parseFloat(raw))) {
      inp.classList.add("invalid");
      return;
    }
    inp.classList.remove("invalid");
    inp.classList.add("changed");

    // Track dirty
    if (!dirtyRolls[roll]) dirtyRolls[roll] = {};
    dirtyRolls[roll][subj] = raw;
    updateSaveState();

    // Update total in the row
    recalcRowTotal(roll);
    recountFilled();
    renderSubjectStats();
  }

  /* ═══════════ Keyboard navigation ═══════════ */
  function onMarkKeydown(e) {
    var inp = e.target;
    var row = inp.closest("tr");
    var rowInputs = Array.from(row.querySelectorAll(".mark-input"));
    var colIdx = rowInputs.indexOf(inp);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIdx < rowInputs.length - 1) {
        rowInputs[colIdx + 1].focus();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIdx > 0) {
        rowInputs[colIdx - 1].focus();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Move to next visible row, first subject cell
      var next = row.nextElementSibling;
      while (next && next.classList.contains("hidden-row")) next = next.nextElementSibling;
      if (next) {
        var firstInput = next.querySelector(".mark-input");
        if (firstInput) firstInput.focus();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      var next = row.nextElementSibling;
      while (next && next.classList.contains("hidden-row")) next = next.nextElementSibling;
      if (next) {
        var nextInputs = Array.from(next.querySelectorAll(".mark-input"));
        if (nextInputs[colIdx]) nextInputs[colIdx].focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      var prev = row.previousElementSibling;
      while (prev && prev.classList.contains("hidden-row")) prev = prev.previousElementSibling;
      if (prev) {
        var prevInputs = Array.from(prev.querySelectorAll(".mark-input"));
        if (prevInputs[colIdx]) prevInputs[colIdx].focus();
      }
    } else if (e.key === "Escape") {
      inp.value = "";
      inp.dispatchEvent(new Event("input"));
    }
  }

  /* ═══════════ Recalculate row total ═══════════ */
  function recalcRowTotal(roll) {
    var row = tBody.querySelector('tr[data-roll="' + CSS.escape(roll) + '"]');
    if (!row) return;
    var inputs = row.querySelectorAll(".mark-input");
    var sum = 0;
    inputs.forEach(function (inp) {
      var v = parseFloat(inp.value);
      if (!isNaN(v)) sum += v;
    });
    var totEl = document.getElementById("total-" + roll);
    if (totEl) totEl.textContent = sum;
  }

  /* ═══════════ Search / filter ═══════════ */
  function filterRows() {
    var q = searchBox.value.trim().toLowerCase();
    var rows = tBody.querySelectorAll("tr");
    rows.forEach(function (r) {
      var roll = (r.dataset.roll || "").toLowerCase();
      var name = (r.children[1] ? r.children[1].textContent : "").toLowerCase();
      if (!q || roll.indexOf(q) >= 0 || name.indexOf(q) >= 0) {
        r.classList.remove("hidden-row");
      } else {
        r.classList.add("hidden-row");
      }
    });
  }

  /* ═══════════ Save to server ═══════════ */
  function saveAll() {
    var keys = Object.keys(dirtyRolls);
    if (!keys.length) { showMsg("Nothing to save — no changes detected.", "info"); return; }

    var updates = keys.map(function (roll) {
      if (currentStream === "PE - Analysis") {
        return { rollNo: roll, exams: dirtyRolls[roll].exams || dirtyRolls[roll] };
      }
      return { rollNo: roll, marks: dirtyRolls[roll] };
    });

    saveBtn.classList.add("saving");
    saveBtn.textContent = "Saving…";
    showMsg("Saving " + updates.length + " student(s)…", "info");

    fetch("/api/teacher/save", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, getAuthHeaders()),
      body: JSON.stringify({ stream: currentStream, exam: currentExam, updates: updates, grade: currentGrade })
    })
    .then(function (r) {
      if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
      return r.json();
    })
    .then(function (d) {
      saveBtn.classList.remove("saving");
      saveBtn.innerHTML = '<svg viewBox="0 0 24 24" class="btn-ic"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Marks';
      if (d.error) { showMsg("Error: " + d.error, "error"); return; }

      showMsg("Saved " + d.count + " student(s) successfully!", "ok");

      // Flash saved cells green
      tBody.querySelectorAll(".mark-input.changed").forEach(function (inp) {
        inp.classList.remove("changed");
        inp.classList.add("saved");
        setTimeout(function () { inp.classList.remove("saved"); }, 1500);
      });

      resetDirty();
      // Reload to sync totals from server
      setTimeout(loadData, 1200);
    })
    .catch(function (e) {
      saveBtn.classList.remove("saving");
      saveBtn.innerHTML = '<svg viewBox="0 0 24 24" class="btn-ic"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Marks';
      showMsg("Network error: " + e.message, "error");
    });
  }

  /* ═══════════ Helpers ═══════════ */
  function resetDirty() {
    dirtyRolls = {};
    updateSaveState();
  }

  function updateSaveState() {
    var changed = Object.keys(dirtyRolls).length;
    if (!saveStatusText || !saveStatus) return;
    if (changed) {
      saveStatusText.textContent = changed + " student" + (changed === 1 ? "" : "s") + " with unsaved changes";
      saveStatus.classList.add("has-changes");
      saveBtn.setAttribute("aria-label", "Save changes for " + changed + " student" + (changed === 1 ? "" : "s"));
    } else {
      saveStatusText.textContent = "All changes saved";
      saveStatus.classList.remove("has-changes");
      saveBtn.setAttribute("aria-label", "Save all marks");
    }
  }

  function computeTotal(marks) {
    var sum = 0;
    subjectCols.forEach(function (s) {
      var v = parseFloat(marks[s]);
      if (!isNaN(v)) sum += v;
    });
    return sum;
  }

  function updateStats(filled, total) {
    countEl.textContent = studentRows.length + " students";
    filledEl.textContent = filled + " filled";
    emptyEl.textContent = (total - filled) + " empty";
  }

  function recountFilled() {
    var inputs = tBody.querySelectorAll(".mark-input");
    var filled = 0, total = inputs.length;
    inputs.forEach(function (inp) {
      if (inp.value.trim() !== "") filled++;
    });
    updateStats(filled, total);
  }

  function showMsg(txt, type) {
    msgEl.className = "message " + type;
    msgEl.textContent = txt;
  }
  function hideMsg() {
    msgEl.className = "message";
    msgEl.textContent = "";
  }

  function esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }
})();
