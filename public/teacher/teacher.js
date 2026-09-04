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
  var currentSubjectFull = {}; // subject short code -> full name
  var dirtyRolls    = {};      // rollNo → { marks: { subj: val } }
  var converterOn   = false;   // converter toggle state

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

  function toCanonicalSubject(subj) {
    if (!subj) return "";
    var s = String(subj).trim();
    var u = s.toUpperCase().replace(/[^A-Z0-9.]/g, "");

    if (u === "ENG" || u === "ENGLISH") return "ENG";
    if (u === "PED" || u === "PE" || /^PHY.*ED/i.test(s) || s.toLowerCase() === "phy. edu") return "PED";
    if (u === "PHY" || u === "PHYSICS") return "PHY";
    if (u === "CHE" || u === "CHEMISTRY") return "CHE";
    if (u === "A.MATH" || u === "AMATH" || /^APP.*MAT/i.test(s) || s.toLowerCase() === "applied math" || s.toLowerCase() === "applied mathematics") return "A.Math";
    if (u === "MAT" || u === "MATH" || u === "MATHS" || u === "MATHEMATICS") return "MAT";
    if (u === "BIO" || u === "BIOLOGY" || /^BIO.*SCI/i.test(s)) return "BIO";
    if (u === "CS" || u === "COMP" || u === "COMPUTERSCIENCE" || s.toLowerCase() === "computer science") return "CS";
    if (u === "AI" || s.toLowerCase() === "artificial intelligence") return "AI";
    if (u === "ACC" || u === "ACCOUNTANCY") return "Acc";
    if (u === "BS" || u === "BST" || u === "BUSINESS" || s.toLowerCase() === "business studies") return "Bs";
    if (u === "ECO" || u === "ECONOMICS") return "Eco";
    if (u === "TAM" || u === "TAMIL" || u === "L2") return "TAM";
    if (u === "HIN" || u === "HINDI") return "TAM"; // In Class 10 sheet, Hindi is entered under Language 2 (TAM) column
    if (u === "SOC" || u === "SCO" || u === "SST" || /^SOC.*SCI/i.test(s) || s.toLowerCase() === "social science" || s.toLowerCase() === "social") return "SOC";
    if (u === "SCI" || u === "SCIENCE" || /^PHY.*SCI/i.test(s) || s.toLowerCase() === "physical science" || s.toLowerCase() === "biological science") return "SCI";

    return s;
  }

  /* ── Auth State & Helper ── */
  var PORTAL_VERSION = "38"; // bump this when allowedStreams/allowedCodes change
  if (localStorage.getItem("teacher_portal_version") !== PORTAL_VERSION) {
    localStorage.removeItem("teacher_info"); // force re-login with fresh permissions
    localStorage.removeItem("teacher_token");
    localStorage.setItem("teacher_portal_version", PORTAL_VERSION);
  }

  function isSubjectAllowed(subj) {
    if (!subj || typeof subj !== "string" || !subj.trim()) return false;
    var info = getTeacherInfo();
    if (!info || info.isAdmin) return true; // Admin has full edit access
    var codes = info.allowedCodes;
    if (info.gradeCodes) {
      var g = String(currentGrade || "12").trim();
      if ((g === "10" || g === "X") && info.gradeCodes["10"]) codes = info.gradeCodes["10"];
      else if ((g === "11" || g === "XI") && info.gradeCodes["11"]) codes = info.gradeCodes["11"];
      else if (info.gradeCodes["12"]) codes = info.gradeCodes["12"];
    }
    if (!codes || !Array.isArray(codes) || codes.length === 0) return true; // Default allow if unrestricted
    var targetCanon = toCanonicalSubject(subj);
    return codes.some(function (c) {
      return toCanonicalSubject(c) === targetCanon;
    });
  }
  var token = localStorage.getItem("teacher_token") || "";

  // Browser Back button returns to Portals Page (/)
  if (typeof history !== "undefined" && history.pushState) {
    // Use a flag to avoid popstate firing on load
    var _historyReady = false;
    setTimeout(function() { _historyReady = true; }, 500);
    history.pushState({ page: "teacher" }, "", window.location.href);
    window.addEventListener("popstate", function (e) {
      if (_historyReady) {
        window.location.href = "/";
      }
    });
  }

  function getAuthHeaders() {
    return token ? { "Authorization": "Bearer " + token } : {};
  }

  /* ── DOM refs ── */
  var tHead              = $("#tableHead");
  var tBody              = $("#tableBody");
  var tFoot              = $("#tableFoot");
  var titleEl            = $("#tableTitle");
  var msgEl              = $("#teacherMsg");
  var saveBtn            = $("#saveBtn") || $("#saveMarksBtn");
  var searchBox          = $("#searchInput");
  var countEl            = $("#studentCount");
  var filledEl           = $("#filledCount");
  var emptyEl            = $("#emptyCount");
  var loginModal         = $("#loginModal");
  var loginForm          = $("#loginForm");
  var loginMsg           = $("#loginMsg");
  var logoutBtn          = $("#logoutBtn");
  var saveStatusText     = $("#saveStatusText");
  var saveStatus         = document.querySelector(".save-status");
  var exportExcelBtn     = $("#exportExcelBtn"); // may be null if removed
  var openSheetBtn       = $("#openSheetBtn");
  var mobileCardsEl      = $("#mobileCardsContainer");
  var tableWrapper       = $("#tableScrollWrapper");
  var tableViewBtn       = $("#tableViewBtn");
  var cardViewBtn        = $("#cardViewBtn");

  var autoSaveTimer      = null;  // debounce timer for auto-save
  var AUTO_SAVE_DELAY    = 3000; // 3 seconds after last change
  var converterToggle    = $("#converterToggle");
  var outOfInput         = $("#outOfInput");

  // Per-subject max marks map: e.g. { PHY: 70, CHE: 70, MAT: 80 }
  var subjectMaxMarks    = {};
  var maxMarkSubjectSelect = $("#maxMarkSubjectSelect");
  var maxMarkBtns        = document.querySelectorAll(".max-mark-btn");
  var currentMaxBadge    = $("#currentMaxBadge");

  function getSelectedSubject() {
    var info = getTeacherInfo();
    var isMaster = !!(info && info.isAdmin === true);
    if (!isMaster || !maxMarkSubjectSelect) return "__ALL__";
    return maxMarkSubjectSelect.value || "__ALL__";
  }

  function updateMaxMarkButtonsUI() {
    var selectedSubj = getSelectedSubject();
    var currentVal = 100;

    if (selectedSubj && selectedSubj !== "__ALL__") {
      currentVal = subjectMaxMarks[selectedSubj] || 100;
    } else {
      if (subjectCols && subjectCols.length > 0) {
        var first = subjectMaxMarks[subjectCols[0]] || 100;
        var allSame = subjectCols.every(function (s) {
          return (subjectMaxMarks[s] || 100) === first;
        });
        currentVal = allSame ? first : 100;
      } else {
        currentVal = getOutOfMax();
      }
    }

    if (currentMaxBadge) currentMaxBadge.textContent = currentVal;

    maxMarkBtns.forEach(function (btn) {
      if (parseInt(btn.dataset.marks, 10) === currentVal && currentVal !== 100) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update active highlight on table headers
    var headers = document.querySelectorAll("th.clickable-subj-th");
    headers.forEach(function (th) {
      if (selectedSubj !== "__ALL__" && th.dataset.subjHeader === selectedSubj) {
        th.classList.add("active-subj-th");
      } else {
        th.classList.remove("active-subj-th");
      }
    });
  }

  function setSubjectMaxMark(subj, val) {
    var v = parseInt(val, 10);
    if (isNaN(v) || (v !== 50 && v !== 70 && v !== 80)) {
      v = 100;
    }

    if (!subj || subj === "__ALL__") {
      var colsToUpdate = (subjectCols && subjectCols.length > 0) ? subjectCols : [];
      colsToUpdate.forEach(function (s) {
        if (v === 100) {
          delete subjectMaxMarks[s];
        } else {
          subjectMaxMarks[s] = v;
        }
      });
      if (outOfInput) outOfInput.value = v;
    } else {
      if (v === 100) {
        delete subjectMaxMarks[subj];
      } else {
        subjectMaxMarks[subj] = v;
      }
    }

    updateMaxMarkButtonsUI();
    renderTable();
  }

  maxMarkBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = parseInt(this.dataset.marks, 10);
      var selectedSubj = getSelectedSubject();
      var currentVal = (selectedSubj && selectedSubj !== "__ALL__")
        ? (subjectMaxMarks[selectedSubj] || 100)
        : (function () {
            if (subjectCols && subjectCols.length > 0) {
              var first = subjectMaxMarks[subjectCols[0]] || 100;
              var allSame = subjectCols.every(function (s) { return (subjectMaxMarks[s] || 100) === first; });
              return allSame ? first : 100;
            }
            return getOutOfMax();
          })();

      // If the same mark button is clicked again, turn it off -> reverts to 100 as normal
      if (currentVal === val && this.classList.contains("active")) {
        setSubjectMaxMark(selectedSubj, 100);
      } else {
        setSubjectMaxMark(selectedSubj, val);
      }
    });
  });

  if (maxMarkSubjectSelect) {
    maxMarkSubjectSelect.addEventListener("change", function () {
      updateMaxMarkButtonsUI();
    });
  }

  if (converterToggle) {
    converterToggle.addEventListener("change", function () {
      converterOn = this.checked;
      renderTable();
    });
  }

  /* ── View Mode ── */
  var currentViewMode = "table"; // Default: table view

  function setViewMode(mode) {
    currentViewMode = mode;
    if (mode === "cards") {
      if (mobileCardsEl) mobileCardsEl.style.display = "flex";
      if (tableWrapper)  tableWrapper.style.display  = "none";
    } else {
      if (mobileCardsEl) mobileCardsEl.style.display = "none";
      if (tableWrapper)  tableWrapper.style.display  = "";
    }
  }

  // Init to table view
  setViewMode(currentViewMode);

  /* ═══════════ Init ═══════════ */
  wireGradeButtons();
  wireStreamCards();
  wireExamTabs();
  if (saveBtn) saveBtn.addEventListener("click", saveAll);
  var refreshBtn = $("#refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshFromSheet(false);
    });
  }
  if (exportExcelBtn) exportExcelBtn.addEventListener("click", exportToExcel);
  if (openSheetBtn) {
    openSheetBtn.addEventListener("click", async function () {
      var info = getTeacherInfo();
      if (!info || info.isAdmin !== true) {
        showMsg("Only Master Administrator can access live Google Sheet.", "error");
        return;
      }
      var token = localStorage.getItem("teacher_token") || "";
      try {
        showMsg("Authenticating access to Google Sheet...", "info");
        var res = await fetch("/api/teacher/sheet-link?grade=" + encodeURIComponent(currentGrade), {
          headers: { "Authorization": "Bearer " + token }
        });
        var data = await res.json();
        if (!res.ok || !data.ok || !data.url) {
          throw new Error(data.error || "Access denied");
        }
        window.open(data.url, "_blank");
        showMsg("Opened live Google Sheet for Grade " + currentGrade + " securely.", "ok");
      } catch (err) {
        showMsg("Unable to open sheet: " + err.message, "error");
      }
    });
  }
  if (searchBox) searchBox.addEventListener("input", filterRows);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  async function exportToExcel() {
    var info = getTeacherInfo();
    var isMaster = !!(info && info.isAdmin === true);

    // If Master Administrator, download the FULL multi-stream class Excel workbook (.xlsx)
    if (isMaster) {
      showMsg("Downloading complete Excel workbook for Class " + currentGrade + "...", "info");
      try {
        var token = localStorage.getItem("teacher_token") || "";
        var res = await fetch("/api/teacher/export-excel?grade=" + encodeURIComponent(currentGrade), {
          headers: { "Authorization": "Bearer " + token }
        });
        if (!res.ok) {
          throw new Error("Server export returned status " + res.status);
        }
        var blob = await res.blob();
        var url = window.URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "Class_" + currentGrade + "_Complete_Mark_Sheet.xlsx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showMsg("Class " + currentGrade + " full Excel workbook downloaded successfully!", "ok");
        return;
      } catch (err) {
        console.error("Excel generation error:", err);
        showMsg("Failed to generate Excel file: " + (err.message || "Server error"), "error");
        return;
      }
    }

    // For subject teachers, export their current assigned subject marks
    if (!studentRows || !studentRows.length) {
      showMsg("No student data available to export.", "info");
      return;
    }

    var isMentor = (currentStream === "Mentor Report");
    var isAdmin = !info || info.isAdmin || !info.allowedCodes;
    var visibleCols = subjectCols.filter(function (s) {
      if (isAdmin || isMentor) return true;
      return isSubjectAllowed(s);
    });
    if (visibleCols.length === 0) {
      showMsg("No assigned subjects available to export for this stream.", "info");
      return;
    }

    var showTotalCol = !isMentor && isMaster;
    var headers = ["S.No", "Roll No", "Student Name"].concat(visibleCols);
    if (showTotalCol) headers.push("Total");

    var rows = [headers];
    studentRows.forEach(function (st, idx) {
      var r = [st.sNo || (idx + 1), st.rollNo, st.name];
      visibleCols.forEach(function (s) {
        var v = st.marks[s];
        r.push((v === null || v === undefined) ? "" : v);
      });
      if (showTotalCol) r.push(computeTotal(st.marks));
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

  function updateGradeButtonVisibility() {
    var info = getTeacherInfo();
    var btns = document.querySelectorAll(".grade-btn");

    if (!info || info.isAdmin || !Array.isArray(info.allowedStreams)) {
      btns.forEach(function (b) { b.style.display = ""; });
      return;
    }

    var streams = info.allowedStreams.map(function(s) { return String(s).toLowerCase(); });
    var hasG10 = streams.some(function(s) {
      return s.indexOf("10") >= 0 || s.indexOf("harmony") >= 0 || s.indexOf("melody") >= 0 || s.indexOf("symphony") >= 0;
    });
    var hasG1112 = streams.some(function(s) {
      return s === "bio - maths" || s === "bio - cs" || s === "maths - cs" || s === "applied math" || s === "cs";
    });

    btns.forEach(function (b) {
      var g = b.dataset.grade;
      if (g === "10") {
        b.style.display = hasG10 ? "" : "none";
      } else if (g === "11" || g === "12") {
        b.style.display = hasG1112 ? "" : "none";
      } else {
        b.style.display = "";
      }
    });
  }

  function updateGradeStreamVisibility() {
    updateGradeButtonVisibility();
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

      // Rankwise and PE Analysis are ONLY accessible by Master Administrator
      if ((st === "Rankwise" || st === "PE - Analysis") && (!info || !info.isAdmin)) {
        c.style.display = "none";
        return;
      }

      var streamAllowed = isStreamAllowed(st);
      if (gradeOk && streamAllowed) {
        c.style.display = "";
        if (!firstVisibleCard && (isG1112Stream || isG10Stream)) {
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

  function handleLoginSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    var submitBtn = $("#loginSubmitBtn");
    var u = ($("#loginUser") ? $("#loginUser").value : "").trim().toLowerCase();
    var p = ($("#loginPass") ? $("#loginPass").value : "").trim();
    if (loginMsg) loginMsg.style.display = "none";

    if (!u || !p) {
      if (loginMsg) {
        loginMsg.textContent = "Please enter both username and password.";
        loginMsg.style.display = "block";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing In\u2026";
    }

    fetch("/api/teacher/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: u, pass: p })
    })
    .then(function (r) {
      return r.text().then(function (text) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In";
        }
        var d;
        try { d = JSON.parse(text); } catch(err) { d = { error: "Server error: " + text.substring(0, 200) }; }
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
          if (loginMsg) {
            loginMsg.textContent = d.error || ("Login failed (HTTP " + r.status + ")");
            loginMsg.style.display = "block";
          }
        }
      });
    })
    .catch(function (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
      if (loginMsg) {
        loginMsg.textContent = "Network error: " + err.message;
        loginMsg.style.display = "block";
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }
  // NOTE: Do NOT add a click listener to loginSubmitBtn — form submit handles it already.
  // Adding both causes double-firing which triggers popstate and redirects to /.

  function getTeacherInfo() {
    try {
      var raw = localStorage.getItem("teacher_info");
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function isStreamAllowed(streamName) {
    var info = getTeacherInfo();
    if (streamName === "Rankwise") {
      return !!(info && info.isAdmin); // Only Master Administrator can view Rankwise
    }
    if (!info || info.isAdmin || !info.allowedStreams) return true; // Admin or full access
    if (streamName === "PE - Analysis" || streamName === "Mentor Report") return true; // Read-only viewing allowed
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

  /* ── Refresh from Google Sheets ── */
  function refreshFromSheet(silent) {
    if (!token) return;
    var activeTag = document.activeElement ? document.activeElement.tagName : "";
    if (activeTag === "INPUT" || activeTag === "TEXTAREA" || Object.keys(dirtyRolls).length > 0) {
      return; // Do not refresh while user is typing or has unsaved edits
    }
    
    if (!silent) {
      showMsg("Fetching latest data from Google Sheets…", "info");
    }

    fetch("/api/teacher/save", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, getAuthHeaders()),
      body: JSON.stringify({ action: "refresh", grade: currentGrade || "12" })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        if (!silent) showMsg("Data refreshed! Reloading view…", "success");
        // Reload the current stream/exam view only if no active editing
        var curTag = document.activeElement ? document.activeElement.tagName : "";
        if (curTag !== "INPUT" && Object.keys(dirtyRolls).length === 0) {
          setTimeout(function() {
            loadData(silent);
          }, 800);
        }
      } else {
        if (!silent) showMsg("Refresh failed: " + (data.error || "Unknown error"), "error");
      }
    })
    .catch(function(err) {
      if (!silent) showMsg("Network error during refresh.", "error");
    });
  }

  function autoSelectTeacherStream() {
    var info = getTeacherInfo();

    // Auto-detect grade preference from teacher profile
    if (info && !info.isAdmin && Array.isArray(info.allowedStreams) && info.allowedStreams.length > 0) {
      var streams = info.allowedStreams.map(function(s) { return String(s).toLowerCase(); });
      var hasG10 = streams.some(function(s) {
        return s.indexOf("10") >= 0 || s.indexOf("harmony") >= 0 || s.indexOf("melody") >= 0 || s.indexOf("symphony") >= 0;
      });
      var hasG1112 = streams.some(function(s) {
        return s === "bio - maths" || s === "bio - cs" || s === "maths - cs" || s === "applied math" || s === "cs";
      });

      // If teacher is dedicated to Class 10 (or has Class 10 subjects), default directly to Grade 10
      if (hasG10 && !hasG1112) {
        currentGrade = "10";
        localStorage.setItem("teacher_grade", "10");
      }
    }

    // Sync grade button active UI states
    var btns = document.querySelectorAll(".grade-btn");
    btns.forEach(function (b) {
      if (b.dataset.grade === currentGrade) b.classList.add("active");
      else b.classList.remove("active");
    });

    updateGradeStreamVisibility();

    if (!info || info.isAdmin || !info.allowedStreams) return;
    var cards = document.querySelectorAll(".stream-card");
    var firstAllowed = null;
    cards.forEach(function (c) {
      var st = c.dataset.stream;
      if (c.style.display !== "none" && isStreamAllowed(st) && st !== "PE - Analysis" && st !== "Rankwise" && !firstAllowed) {
        firstAllowed = c;
      }
    });

    if (firstAllowed && (!isStreamAllowed(currentStream) || currentStream === "PE - Analysis" || currentStream === "Rankwise" || (currentGrade === "10" && (currentStream === "Bio - Maths" || currentStream === "Bio - CS" || currentStream === "Maths - CS" || currentStream === "Applied Math" || currentStream === "CS")))) {
      cards.forEach(function (x) { x.classList.remove("active"); });
      firstAllowed.classList.add("active");
      currentStream = firstAllowed.dataset.stream;
    }
  }

  function checkAuth() {
    var badge = $("#teacherBadge");
    var layout = $("#teacherLayout");
    var info = getTeacherInfo();
    var changeNavBtn = $("#changePassNavBtn");

    if (!token || !info) {
      token = "";
      localStorage.removeItem("teacher_token");
      localStorage.removeItem("teacher_info");
      if (loginModal) loginModal.style.display = "flex";
      if (layout) layout.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (badge) badge.style.display = "none";
      if (changeNavBtn) changeNavBtn.style.display = "none";
      if (exportExcelBtn) exportExcelBtn.style.display = "none";
      if (openSheetBtn) openSheetBtn.style.display = "none";
      var adminSubjWrap = $("#adminSubjectSelectorWrap");
      if (adminSubjWrap) adminSubjWrap.style.display = "none";
    } else {
      if (loginModal) loginModal.style.display = "none";
      if (layout) layout.style.display = "";
      if (logoutBtn) logoutBtn.style.display = "inline-block";
      if (changeNavBtn) changeNavBtn.style.display = "inline-block";
      
      // Admin-only tools: "Download Full Excel" & "Open Google Sheet"
      if (exportExcelBtn) {
        exportExcelBtn.style.display = (info && info.isAdmin === true) ? "inline-flex" : "none";
      }
      if (openSheetBtn) {
        openSheetBtn.style.display = (info && info.isAdmin === true) ? "inline-flex" : "none";
      }

      // Subject selector for setting max marks is ONLY visible in the admin portal
      var adminSubjWrap = $("#adminSubjectSelectorWrap");
      if (adminSubjWrap) {
        adminSubjWrap.style.display = (info && info.isAdmin === true) ? "inline-flex" : "none";
      }

      if (badge && info && info.name) {
        var subText = info.subjects ? (" &middot; <span style='font-weight:normal;opacity:0.85;'>" + esc(info.subjects) + "</span>") : "";
        badge.innerHTML = "<strong>" + esc(info.name) + "</strong>" + subText;
        badge.style.display = "inline-flex";
      } else if (badge) {
        badge.style.display = "none";
      }
      autoSelectTeacherStream();
      loadData();
    }
  }

  /* ═══════════ Forgot & Change Password Modal Handlers ═══════════ */
  var forgotModal = $("#forgotModal");
  var forgotForm = $("#forgotForm");
  var forgotMsg = $("#forgotMsg");
  var forgotPassBtn = $("#forgotPassBtn");
  var backToLoginBtn = $("#backToLoginBtn");

  if (forgotPassBtn) {
    forgotPassBtn.addEventListener("click", function () {
      if (loginModal) loginModal.style.display = "none";
      if (forgotModal) forgotModal.style.display = "flex";
      if (forgotMsg) forgotMsg.style.display = "none";
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", function () {
      if (forgotModal) forgotModal.style.display = "none";
      if (loginModal) loginModal.style.display = "flex";
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("#forgotEmail").value.trim();
      var submitBtn = $("#forgotSubmitBtn");
      forgotMsg.style.display = "none";

      if (!email) {
        forgotMsg.className = "message error";
        forgotMsg.textContent = "Please enter your staff email address.";
        forgotMsg.style.display = "block";
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending Instructions\u2026";
      }

      fetch("/api/teacher/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send Email Instructions";
        }
        if (d.error) {
          forgotMsg.className = "message error";
          forgotMsg.textContent = d.error;
          forgotMsg.style.display = "block";
        } else {
          forgotMsg.className = "message ok";
          forgotMsg.textContent = d.message;
          forgotMsg.style.display = "block";
        }
      })
      .catch(function (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send Email Instructions";
        }
        forgotMsg.className = "message error";
        forgotMsg.textContent = "Network error: " + err.message;
        forgotMsg.style.display = "block";
      });
    });
  }

  var changePassModal = $("#changePassModal");
  var changePassForm = $("#changePassForm");
  var changePassMsg = $("#changePassMsg");
  var changePassNavBtn = $("#changePassNavBtn");
  var closeChangePassBtn = $("#closeChangePassBtn");

  if (changePassNavBtn) {
    changePassNavBtn.addEventListener("click", function () {
      if (changePassModal) changePassModal.style.display = "flex";
      if (changePassMsg) changePassMsg.style.display = "none";
      if ($("#currPassInput")) $("#currPassInput").value = "";
      if ($("#newPassInput")) $("#newPassInput").value = "";
      if ($("#confirmPassInput")) $("#confirmPassInput").value = "";
    });
  }

  if (closeChangePassBtn) {
    closeChangePassBtn.addEventListener("click", function () {
      if (changePassModal) changePassModal.style.display = "none";
    });
  }

  if (changePassForm) {
    changePassForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var currPass = $("#currPassInput").value.trim();
      var newPass = $("#newPassInput").value.trim();
      var confirmPass = $("#confirmPassInput").value.trim();
      var submitBtn = $("#changePassSubmitBtn");
      changePassMsg.style.display = "none";

      if (!currPass || !newPass || !confirmPass) {
        changePassMsg.className = "message error";
        changePassMsg.textContent = "Please fill in all password fields.";
        changePassMsg.style.display = "block";
        return;
      }

      if (newPass !== confirmPass) {
        changePassMsg.className = "message error";
        changePassMsg.textContent = "New password and confirm password do not match.";
        changePassMsg.style.display = "block";
        return;
      }

      if (newPass.length < 6) {
        changePassMsg.className = "message error";
        changePassMsg.textContent = "New password must be at least 6 characters long.";
        changePassMsg.style.display = "block";
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Updating Password\u2026";
      }

      fetch("/api/teacher/change-password", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, getAuthHeaders()),
        body: JSON.stringify({ currentPassword: currPass, newPassword: newPass })
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Update Password";
        }
        if (d.error) {
          changePassMsg.className = "message error";
          changePassMsg.textContent = d.error;
          changePassMsg.style.display = "block";
        } else {
          changePassMsg.className = "message ok";
          changePassMsg.textContent = d.message || "Password updated successfully!";
          changePassMsg.style.display = "block";
          setTimeout(function () {
            if (changePassModal) changePassModal.style.display = "none";
          }, 2000);
        }
      })
      .catch(function (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Update Password";
        }
        changePassMsg.className = "message error";
        changePassMsg.textContent = "Network error: " + err.message;
        changePassMsg.style.display = "block";
      });
    });
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
  function loadData(silent) {
    updateOutOfBoxVisibility();
    if (!silent) showMsg("Loading...", "info");

    if (currentStream === "PE - Analysis" || currentStream === "Rankwise") {
      loadPeAnalysis(silent);
      return;
    }

    fetch("/api/teacher/marks?stream=" + encodeURIComponent(currentStream) +
          "&exam=" + encodeURIComponent(currentExam) +
          "&grade=" + encodeURIComponent(currentGrade) +
          "&fresh=1&_t=" + Date.now(), {
      headers: getAuthHeaders()
    })
      .then(function (r) {
        return r.text().then(function (text) {
          if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
          var d;
          try {
            d = JSON.parse(text);
          } catch (err) {
            var cleanTxt = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            d = { error: cleanTxt.substring(0, 150) || ("Server error (HTTP " + r.status + ")") };
          }
          return d;
        });
      })
      .then(function (d) {
        if (d.error) { if (!silent) showMsg(d.error, "error"); return; }
        subjectCols = d.subjects || [];
        currentSubjectFull = d.subjectFull || {};
        studentRows = (d.students || []).slice().sort(function (a, b) {
          return (a.sNo || 0) - (b.sNo || 0);
        });
        titleEl.textContent = "Grade " + currentGrade + " — " + currentStream + " (" + currentExam + ")";
        renderTable();
        if (!silent) hideMsg();
      })
      .catch(function (e) { if (!silent) showMsg("Network error: " + e.message, "error"); });
  }

  /* ═══════════ PE Analysis view ═══════════ */
  function loadPeAnalysis(silent) {
    fetch("/api/teacher/pe-analysis?grade=" + encodeURIComponent(currentGrade) +
          "&fresh=1&_t=" + Date.now(), {
      headers: getAuthHeaders()
    })
      .then(function (r) {
        if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
        return r.json();
      })
      .then(function (d) {
        if (d.error) { if (!silent) showMsg(d.error, "error"); return; }
        renderPeTable(d);
        if (!silent) hideMsg();
      })
      .catch(function (e) { if (!silent) showMsg("Network error: " + e.message, "error"); });
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
      html += '<td class="col-student-name" title="' + esc(st.rollNo) + '"><div class="student-name-box"><span class="student-name-text">' + esc(st.name) + '</span><span class="student-roll-sub">' + esc(st.rollNo) + '</span></div></td>';
      html += '<td class="sno">' + esc(st.stream) + '</td>';
      exams.forEach(function (ex) {
        var tot = st.exams[ex] ? st.exams[ex].total : 0;
        var rank = st.exams[ex] ? st.exams[ex].domainRank : null;
        var display = tot > 0 ? tot : "";
        var rankTxt = rank ? " (#" + rank + ")" : "";
        var isAb = String(display).trim().toUpperCase() === "AB";
        html += '<td><input type="text" class="mark-input pe-mark-input' + (isAb ? ' is-absent' : '') + '" ' +
                'data-roll="' + esc(st.rollNo) + '" ' +
                'data-exam="' + esc(ex) + '" ' +
                'value="' + esc(String(display)) + '" ' +
                'inputmode="text" autocomplete="off" />' +
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
      inp.addEventListener("focus", onMarkFocus);
      inp.addEventListener("input", onPeMarkInput);
      inp.addEventListener("keydown", onMarkKeydown);
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

    var up = raw.toUpperCase();
    var isAb = false;
    if (up === "AB" || up === "B") {
      raw = "AB";
      inp.value = "AB";
      isAb = true;
    } else if (up === "A") {
      raw = "A";
      inp.value = "A";
    } else {
      // Strip any non-numeric characters (only allow 0-9 and at most one decimal dot)
      var clean = raw.replace(/[^0-9.]/g, '');
      var parts = clean.split('.');
      if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      if (raw !== clean) {
        raw = clean;
        inp.value = clean;
      }
    }

    if (isAb) {
      inp.classList.add("is-absent");
    } else {
      inp.classList.remove("is-absent");
    }

    if (raw !== "" && !isAb && raw.toUpperCase() !== "A" && isNaN(parseFloat(raw))) {
      inp.classList.add("invalid");
      return;
    }
    inp.classList.remove("invalid");
    inp.classList.add("changed");

    var valToSave = isAb ? "AB" : raw;

    var initialVal = inp.dataset.initialVal !== undefined ? inp.dataset.initialVal : "";
    if (initialVal !== valToSave) {
      recordUndoAction({
        type: 'pe',
        roll: roll,
        exam: exam,
        oldVal: initialVal,
        newVal: valToSave
      });
      inp.dataset.initialVal = valToSave;
    }

    if (!dirtyRolls[roll]) dirtyRolls[roll] = { exams: {} };
    if (!dirtyRolls[roll].exams) dirtyRolls[roll].exams = {};
    dirtyRolls[roll].exams[exam] = valToSave;
    updateSaveState();

    renderPeSubjectStats(["CU 1", "TE 1", "CU 2", "TE 2"], {});
  }

  /* ═══════════ Render the spreadsheet table ═══════════ */
  function renderTable() {
    var isMentor = (currentStream === "Mentor Report");
    var info = getTeacherInfo();
    var isMaster = !!(info && info.isAdmin === true);
    var isAdmin = !info || info.isAdmin || !info.allowedCodes;
    var showTotalCol = !isMentor && isMaster;

    // For non-admin teachers, only show their handling subject columns (+ always show all for Admin/Mentor)
    var visibleCols = subjectCols.filter(function (s) {
      if (isAdmin || isMentor) return true;
      return isSubjectAllowed(s);
    });

    if (!isAdmin && !isMentor && visibleCols.length === 0) {
      tHead.innerHTML = "<tr><th>S.No</th><th>Roll No</th><th>Student Name</th><th>Status</th></tr>";
      tBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted);font-weight:600;">You do not have any assigned subjects in ' + esc(currentStream) + '. Please select your assigned stream from the sidebar.</td></tr>';
      tFoot.innerHTML = "";
      updateStats(0, 0);
      if (currentViewMode === "cards" && mobileCardsEl) {
        mobileCardsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:600;">You do not have any assigned subjects in ' + esc(currentStream) + '.</div>';
      }
      return;
    }

    // Update subject select options if admin
    var selectEl = $("#maxMarkSubjectSelect");
    if (selectEl && isMaster) {
      var prevSelected = selectEl.value;
      var optsHtml = '<option value="__ALL__">All Subjects</option>';
      visibleCols.forEach(function (s) {
        optsHtml += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
      });
      selectEl.innerHTML = optsHtml;
      if (prevSelected && (prevSelected === "__ALL__" || visibleCols.indexOf(prevSelected) >= 0)) {
        selectEl.value = prevSelected;
      } else {
        selectEl.value = "__ALL__";
      }
    }
    updateMaxMarkButtonsUI();

    // Header
    var selectedSubj = getSelectedSubject();
    var thRow = "<tr><th>S.No</th><th>Roll No</th><th>Student Name</th>";
    visibleCols.forEach(function (s) {
      var fullName = (currentSubjectFull && currentSubjectFull[s]) || getSubjectFullName(s);
      if (s === "TAM" && currentGrade === "10") {
        var tInfo = getTeacherInfo();
        if (tInfo && tInfo.subjects && /hindi/i.test(tInfo.subjects)) {
          fullName = "Hindi (Second Language)";
        }
      }
      var sMax = getSubjectMaxMark(s);
      var maxBadgeHtml = "";
      if (sMax !== 100) {
        if (converterOn) {
          maxBadgeHtml = ' <span style="font-size:0.75rem;color:#2563eb;font-weight:700;">(/100)</span>';
        } else {
          maxBadgeHtml = ' <span style="font-size:0.75rem;color:#0284c7;font-weight:700;">(/' + sMax + ')</span>';
        }
      }
      var hSub = esc(s) + maxBadgeHtml;
      var thClasses = (isMaster && !isMentor) ? ' class="clickable-subj-th' + (selectedSubj === s ? ' active-subj-th' : '') + '"' : '';
      var thTitle = esc(fullName || s) + (isMaster && !isMentor ? ' (Click to select for Max Marks)' : '');
      thRow += "<th" + (isMentor ? ' style="width:100%;"' : '') + thClasses + " data-subj-header='" + esc(s) + "' title='" + thTitle + "'>" + hSub + "</th>";
    });
    if (showTotalCol) thRow += "<th>Total</th>";
    thRow += "</tr>";
    tHead.innerHTML = thRow;

    // Allow Admin to click a subject header to select that subject in the Max Mark toolbar
    if (isMaster && !isMentor) {
      var thList = tHead.querySelectorAll("th.clickable-subj-th");
      thList.forEach(function (th) {
        th.addEventListener("click", function () {
          var clickedSubj = this.dataset.subjHeader;
          if (selectEl && clickedSubj) {
            selectEl.value = clickedSubj;
            updateMaxMarkButtonsUI();
          }
        });
      });
    }

    // Body
    var html = "";
    var filledCells = 0, totalCells = 0;

    studentRows.forEach(function (st, idx) {
      html += '<tr data-roll="' + esc(st.rollNo) + '">';
      html += '<td class="sno">' + (st.sNo || idx + 1) + '</td>';
      html += '<td class="sno" style="font-weight:600;color:var(--fg);">' + esc(st.rollNo) + '</td>';
      html += '<td class="col-student-name" title="' + esc(st.rollNo) + '"><div class="student-name-box"><span class="student-name-text">' + esc(st.name) + '</span><span class="student-roll-sub">' + esc(st.rollNo) + '</span></div></td>';

      visibleCols.forEach(function (s) {
        var sMax = getSubjectMaxMark(s);
        var baseMark = (st.marks[s] != null && st.marks[s] !== "") ? st.marks[s] : "";
        var display = baseMark;

        if (sMax !== 100 && baseMark !== "" && String(baseMark).toLowerCase() !== "ab") {
          if (converterOn) {
            display = baseMark;
          } else {
            display = (st.rawMarks && st.rawMarks[s] !== undefined)
              ? st.rawMarks[s]
              : getOriginalMark(String(baseMark), sMax);
          }
        }
        display = (display === null || display === undefined) ? "" : display;

        totalCells++;
        if (display !== "") filledCells++;
        
        var canEdit = isMentor ? true : isSubjectAllowed(s);

        var isAb = String(display).trim().toUpperCase() === "AB";
        var modeStr = isMentor ? 'type="url" inputmode="url" placeholder="Paste Google Drive link here..."' : 'type="text" inputmode="text"';
        var clsStr = isMentor ? 'mark-input mentor-input' : (canEdit ? ('mark-input' + (isAb ? ' is-absent' : '')) : ('mark-input disabled-input' + (isAb ? ' is-absent' : '')));
        var disabledAttr = canEdit ? '' : 'disabled title="Only authorized subject teacher can edit ' + esc(s) + '"';

        html += '<td' + (isMentor ? ' style="width:100%;padding:4px 8px;"' : '') + '><input ' + modeStr + ' class="' + clsStr + '" ' +
                'data-roll="' + esc(st.rollNo) + '" ' +
                'data-subj="' + esc(s) + '" ' +
                'value="' + esc(String(display)) + '" ' +
                disabledAttr + ' ' +
                'autocomplete="off" /></td>';
      });

      // Total column (auto-computed for exams) — ONLY visible to Master Administrator
      if (showTotalCol) {
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
      inp.addEventListener("focus", onMarkFocus);
      inp.addEventListener("input", onMarkInput);
      inp.addEventListener("blur", onMarkBlur);
      inp.addEventListener("keydown", onMarkKeydown);
    });

    // Also render mobile cards if in card view
    if (currentViewMode === "cards") renderMobileCards();
  }

  /* ═══════════ Mobile Card View ═══════════ */
  function renderMobileCards() {
    if (!mobileCardsEl) return;
    var isMentor = (currentStream === "Mentor Report");
    var info = getTeacherInfo();
    var isAdmin = !info || info.isAdmin || !info.allowedCodes;
    var visibleCols = subjectCols.filter(function(s) {
      if (isAdmin || isMentor) return true;
      return isSubjectAllowed(s);
    });
    if (!isAdmin && !isMentor && visibleCols.length === 0) {
      mobileCardsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:600;">You do not have any assigned subjects in ' + esc(currentStream) + '.</div>';
      return;
    }

    var q = searchBox ? searchBox.value.trim().toLowerCase() : "";
    var html = "";
    var filledCells = 0, totalCells = 0;

    studentRows.forEach(function(st, idx) {
      // Search filter
      var roll = (st.rollNo || "").toLowerCase();
      var name = (st.name || "").toLowerCase();
      var hidden = q && roll.indexOf(q) < 0 && name.indexOf(q) < 0;
      var hiddenAttr = hidden ? ' style="display:none;"' : '';

      var total = computeTotal(st.marks);

      html += '<div class="student-card-item" data-roll="' + esc(st.rollNo) + '"' + hiddenAttr + '>';

      // Card header: Name + Total
      html += '<div class="card-header-row">';
      html += '<div class="card-student-info">';
      html += '<span class="card-student-name">' + esc(st.name) + '</span>';
      html += '<span class="card-student-roll">Roll No: ' + esc(st.rollNo) + ' &nbsp;|&nbsp; #' + (st.sNo || idx + 1) + '</span>';
      html += '</div>';
      var info = getTeacherInfo();
      var isMaster = !!(info && info.isAdmin === true);
      var showTotalCol = !isMentor && isMaster;
      if (showTotalCol) {
        html += '<span class="card-student-total" id="card-total-' + esc(st.rollNo) + '">' + (total || 0) + '</span>';
      }
      html += '</div>';

      // Subject fields grid
      html += '<div class="card-subj-grid">';
      visibleCols.forEach(function(s) {
        var sMax = getSubjectMaxMark(s);
        var baseMark = (st.marks[s] != null && st.marks[s] !== "") ? st.marks[s] : "";
        var display = baseMark;
        if (sMax !== 100 && baseMark !== "" && String(baseMark).toLowerCase() !== "ab") {
          if (converterOn) {
            display = baseMark;
          } else {
            display = (st.rawMarks && st.rawMarks[s] !== undefined)
              ? st.rawMarks[s]
              : getOriginalMark(String(baseMark), sMax);
          }
        }
        display = (display === null || display === undefined) ? "" : display;
        totalCells++;
        if (display !== "") filledCells++;
        var canEdit = isMentor ? true : isSubjectAllowed(s);
        var isAb = String(display).trim().toUpperCase() === "AB";
        var modeStr = isMentor ? 'type="url" inputmode="url" placeholder="Drive link..."' : 'type="text" inputmode="text"';
        var clsStr = isMentor ? 'mark-input mentor-input' : (canEdit ? ('mark-input' + (isAb ? ' is-absent' : '')) : ('mark-input disabled-input' + (isAb ? ' is-absent' : '')));
        var disabledAttr = canEdit ? '' : 'disabled';

        html += '<div class="card-subj-field">';
        var fullName = (currentSubjectFull && currentSubjectFull[s]) || getSubjectFullName(s);
        var maxBadge = (sMax !== 100) ? (converterOn ? ' (/100)' : ' (/' + sMax + ')') : '';
        html += '<span class="card-subj-label" title="' + esc(fullName || s) + '">' + esc(s) + maxBadge + '</span>';
        html += '<input ' + modeStr + ' class="' + clsStr + '" '
              + 'data-roll="' + esc(st.rollNo) + '" '
              + 'data-subj="' + esc(s) + '" '
              + 'value="' + esc(String(display)) + '" '
              + disabledAttr + ' autocomplete="off" />';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });

    mobileCardsEl.innerHTML = html;
    updateStats(filledCells, totalCells);

    // Wire events on card inputs
    var cardInputs = mobileCardsEl.querySelectorAll(".mark-input");
    cardInputs.forEach(function(inp) {
      inp.addEventListener("blur", onMarkBlur);
      inp.addEventListener("input", function(e) {
        onMarkInput(e);
        // Update card total badge
        var roll = inp.dataset.roll;
        var card = mobileCardsEl.querySelector('[data-roll="' + roll + '"]');
        if (card) {
          var totalBadge = document.getElementById("card-total-" + roll);
          if (totalBadge) {
            var allInputs = card.querySelectorAll(".mark-input");
            var sum = 0;
            allInputs.forEach(function(i) {
              var v = parseFloat(i.value);
              if (!isNaN(v)) sum += v;
            });
            totalBadge.textContent = sum;
          }
        }
      });
      inp.addEventListener("focus", function() { this.select(); });
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
    if (!isAdmin && !isMentor && visibleCols.length === 0) {
      tFoot.innerHTML = "";
      return;
    }

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
        if (raw === "") {
          stats[subj].push(null); // empty
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

      var isMaster = !!(info && info.isAdmin === true);
      if (!isMentor && isMaster) {
        footHtml += '<td class="stat-val"></td>'; // Total column
      }
      footHtml += '</tr>';
    });

    tFoot.innerHTML = footHtml;
  }

  /* ═══════════ Out-Of Mark Conversion ═══════════ */
  function updateOutOfBoxVisibility() {
    var outBox = document.querySelector(".out-of-box");
    if (!outBox) return;
    if (currentStream === "PE - Analysis" || currentStream === "Rankwise" || currentStream === "Mentor Report") {
      outBox.style.display = "none";
    } else {
      outBox.style.display = "inline-flex";
    }
  }

  function getOutOfMax() {
    if (currentStream === "PE - Analysis" || currentStream === "Rankwise" || currentStream === "Mentor Report") {
      return 100;
    }
    var outEl = $("#outOfInput");
    if (!outEl) return 100;
    var v = parseFloat(outEl.value);
    if (v === 50 || v === 70 || v === 80) return v;
    return 100;
  }

  function getSubjectMaxMark(subj) {
    if (currentStream === "PE - Analysis" || currentStream === "Rankwise" || currentStream === "Mentor Report") {
      return 100;
    }
    if (subj && subjectMaxMarks[subj]) {
      var v = subjectMaxMarks[subj];
      if (v === 50 || v === 70 || v === 80) return v;
    }
    return getOutOfMax();
  }

  function getOriginalMark(raw, max) {
    if (raw === "" || raw === null || raw === undefined) return raw;
    var num = parseFloat(raw);
    if (isNaN(num)) return raw;
    if (!max || max === 100) return raw;
    var orig = (num * max) / 100;
    orig = Math.round(orig * 10) / 10;
    if (orig % 1 === 0) orig = Math.round(orig);
    return String(orig);
  }

  function convertMarkValue(raw, max) {
    if (raw === "") return raw;
    var num = parseFloat(raw);
    if (isNaN(num)) return raw;
    if (!max || max === 100) return raw;
    var converted = (num / max) * 100;
    if (converted > 100) converted = 100;
    converted = Math.round(converted * 10) / 10;
    if (converted % 1 === 0) converted = Math.round(converted);
    return String(converted);
  }

  function onMarkBlur(e) {
    var inp = e.target;
    var roll = inp.dataset.roll;
    var subj = inp.dataset.subj;
    var raw  = inp.value.trim();

    if (raw === "") {
      inp.classList.remove("is-absent");
      return;
    }

    var up = raw.toUpperCase();
    if (up === "AB" || up === "A" || up === "B") {
      inp.value = "AB";
      inp.classList.add("is-absent");
      var st = studentRows.find(function(r) { return String(r.rollNo) === String(roll); });
      if (st) {
        if (!st.rawMarks) st.rawMarks = Object.assign({}, st.marks || {});
        st.rawMarks[subj] = "AB";
        st.marks[subj] = "AB";
      }
      inp.dataset.rawVal = "AB";
      if (!dirtyRolls[roll]) dirtyRolls[roll] = {};
      dirtyRolls[roll][subj] = "AB";
      updateSaveState();
      recalcRowTotal(roll);
      recountFilled();
      renderSubjectStats();
      return;
    }
    inp.classList.remove("is-absent");

    var num = parseFloat(raw);
    if (isNaN(num)) return;

    var max = getSubjectMaxMark(subj);

    // When converter is ON, show converted value in input on blur; if OFF, show raw entered mark
    if (converterOn && max !== 100) {
      inp.value = convertMarkValue(raw, max);
    } else {
      inp.value = raw;
    }
  }

  /* ═══════════ Undo / Redo System (Ctrl + Z / Ctrl + Y) ═══════════ */
  var undoStack = [];
  var redoStack = [];

  function recordUndoAction(action) {
    if (action.oldVal === action.newVal) return;
    undoStack.push(action);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  function applyCellChange(action, isUndo) {
    var valToApply = isUndo ? action.oldVal : action.newVal;
    var roll = action.roll;

    if (action.type === 'mark') {
      var subj = action.subj;
      var inp = document.querySelector('input[data-roll="' + roll + '"][data-subj="' + subj + '"]');
      if (inp) {
        inp.value = valToApply;
        inp.dataset.initialVal = valToApply;
        inp.classList.remove("invalid");
        inp.classList.add("changed");
      }
      if (!dirtyRolls[roll]) dirtyRolls[roll] = {};
      dirtyRolls[roll][subj] = valToApply;
      recalcRowTotal(roll);
      recountFilled();
      renderSubjectStats();
    } else if (action.type === 'pe') {
      var exam = action.exam;
      var inp = document.querySelector('input[data-roll="' + roll + '"][data-exam="' + exam + '"]');
      if (inp) {
        inp.value = valToApply;
        inp.dataset.initialVal = valToApply;
        inp.classList.remove("invalid");
        inp.classList.add("changed");
      }
      if (!dirtyRolls[roll]) dirtyRolls[roll] = { exams: {} };
      if (!dirtyRolls[roll].exams) dirtyRolls[roll].exams = {};
      dirtyRolls[roll].exams[exam] = valToApply;
      renderPeSubjectStats(["CU 1", "TE 1", "CU 2", "TE 2"], {});
    }
    updateSaveState();
  }

  function doUndo() {
    if (!undoStack.length) {
      showMsg("Nothing to undo.", "info");
      return;
    }
    var action = undoStack.pop();
    redoStack.push(action);
    applyCellChange(action, true);
    showMsg("Undo applied (Ctrl + Z).", "info");
  }

  function doRedo() {
    if (!redoStack.length) {
      showMsg("Nothing to redo.", "info");
      return;
    }
    var action = redoStack.pop();
    undoStack.push(action);
    applyCellChange(action, false);
    showMsg("Redo applied (Ctrl + Y).", "info");
  }

  document.addEventListener("keydown", function (e) {
    var isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;

    if (e.key === "z" || e.key === "Z") {
      if (e.shiftKey) {
        e.preventDefault();
        doRedo();
      } else {
        e.preventDefault();
        doUndo();
      }
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      doRedo();
    }
  });

  function onMarkFocus(e) {
    var inp = e.target;
    if (inp.dataset.initialVal === undefined) {
      inp.dataset.initialVal = inp.value;
    }
    inp.select();
  }

  /* ═══════════ Cell input handler ═══════════ */
  function onMarkInput(e) {
    var inp = e.target;
    var roll = inp.dataset.roll;
    var subj = inp.dataset.subj;
    var raw  = inp.value.trim();

    var isMentor = (currentStream === "Mentor Report");

    // Check if user is typing AB (absent)
    var up = raw.toUpperCase();
    var isAb = false;
    if (!isMentor && (up === "AB" || up === "B")) {
      raw = "AB";
      inp.value = "AB";
      isAb = true;
      inp.classList.add("is-absent");
    } else if (!isMentor && up === "A") {
      // User has typed just "A" — partial AB, allow it to continue
      inp.classList.remove("is-absent");
      inp.classList.remove("invalid");
      return; // Wait for the next keystroke
    } else {
      inp.classList.remove("is-absent");
      if (!isMentor) {
        // Strip any non-numeric characters (only allow 0-9 and at most one decimal dot)
        var clean = raw.replace(/[^0-9.]/g, '');
        var parts = clean.split('.');
        if (parts.length > 2) {
          clean = parts[0] + '.' + parts.slice(1).join('');
        }
        if (raw !== clean) {
          raw = clean;
          inp.value = clean;
        }
      }
    }

    // Validate: empty, AB, or a number
    if (raw !== "" && !isMentor && !isAb && isNaN(parseFloat(raw))) {
      inp.classList.add("invalid");
      return;
    }
    inp.classList.remove("invalid");
    inp.classList.add("changed");

    var max = getSubjectMaxMark(subj);
    var valToSave = isAb ? "AB" : raw;
    var rawValue = isAb ? "AB" : raw;

    if (!isAb && raw !== "" && !isMentor && !isNaN(parseFloat(raw)) && max !== 100) {
      if (converterOn) {
        valToSave = raw;
        rawValue = getOriginalMark(raw, max);
      } else {
        valToSave = convertMarkValue(raw, max);
        rawValue = raw;
      }
    }

    var st = studentRows.find(function(r) { return String(r.rollNo) === String(roll); });
    if (st) {
      if (!st.rawMarks) st.rawMarks = Object.assign({}, st.marks || {});
      st.rawMarks[subj] = rawValue;
      st.marks[subj] = valToSave;
    }
    inp.dataset.rawVal = rawValue;

    var initialVal = inp.dataset.initialVal !== undefined ? inp.dataset.initialVal : "";
    if (initialVal !== valToSave) {
      recordUndoAction({
        type: 'mark',
        roll: roll,
        subj: subj,
        oldVal: initialVal,
        newVal: valToSave
      });
      inp.dataset.initialVal = valToSave;
    }

    // Track dirty
    if (!dirtyRolls[roll]) dirtyRolls[roll] = {};
    dirtyRolls[roll][subj] = valToSave;
    updateSaveState();

    // Update total in the row
    recalcRowTotal(roll);
    recountFilled();
    renderSubjectStats();
  }

  /* ═══════════ Keyboard navigation ═══════════ */
  function onMarkKeydown(e) {
    var inp = e.target;
    var isMentor = (currentStream === "Mentor Report");

    // Block alphabetic keystrokes on mark input fields — except A and B (for "AB" absent marking)
    // Also allow shortcut keys like Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+A
    if (!isMentor && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key && e.key.length === 1 && !/[0-9.aAbB]/.test(e.key)) {
        e.preventDefault();
        return;
      }
    }

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
      // Move to next visible row, SAME subject column (or first available input)
      var next = row.nextElementSibling;
      while (next && next.classList.contains("hidden-row")) next = next.nextElementSibling;
      if (next) {
        var nextInputs = Array.from(next.querySelectorAll(".mark-input"));
        if (nextInputs[colIdx]) {
          nextInputs[colIdx].focus();
        } else {
          var firstInput = next.querySelector(".mark-input");
          if (firstInput) firstInput.focus();
        }
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
    // Filter table rows
    var rows = tBody.querySelectorAll("tr");
    rows.forEach(function (r) {
      var roll = (r.dataset.roll || "").toLowerCase();
      var name = (r.children[2] ? r.children[2].textContent : "").toLowerCase();
      if (!q || roll.indexOf(q) >= 0 || name.indexOf(q) >= 0) {
        r.classList.remove("hidden-row");
      } else {
        r.classList.add("hidden-row");
      }
    });
    // Filter mobile cards
    if (mobileCardsEl) {
      var cards = mobileCardsEl.querySelectorAll(".student-card-item");
      cards.forEach(function(card) {
        var roll = (card.dataset.roll || "").toLowerCase();
        var nameEl = card.querySelector(".card-student-name");
        var name = nameEl ? nameEl.textContent.toLowerCase() : "";
        card.style.display = (!q || roll.indexOf(q) >= 0 || name.indexOf(q) >= 0) ? "" : "none";
      });
    }
  }

  /* ═══════════ Save to server ═══════════ */
  var isSaving = false;

  function saveAll(silent) {
    if (isSaving) {
      // If a save is already in flight, schedule another save after it completes
      scheduleAutoSave();
      return;
    }

    var keys = Object.keys(dirtyRolls);
    if (!keys.length) {
      if (!silent) showMsg("Nothing to save — no changes detected.", "info");
      return;
    }

    isSaving = true;
    var max = getOutOfMax();
    var doConvert = converterOn && max !== 100;

    var updates = keys.map(function (roll) {
      if (currentStream === "PE - Analysis" || currentStream === "Rankwise") {
        return { rollNo: roll, exams: Object.assign({}, dirtyRolls[roll].exams || dirtyRolls[roll]) };
      }
      // When converter is ON, convert dirty marks to /100 before saving
      if (doConvert) {
        var convertedMarks = {};
        var raw = dirtyRolls[roll];
        for (var subj in raw) {
          convertedMarks[subj] = convertMarkValue(String(raw[subj]), max);
        }
        return { rollNo: roll, marks: convertedMarks };
      }
      return { rollNo: roll, marks: Object.assign({}, dirtyRolls[roll]) };
    });

    if (!silent && saveBtn) {
      saveBtn.classList.add("saving");
      saveBtn.textContent = "Saving\u2026";
    }
    if (saveStatusText) saveStatusText.textContent = "Auto-saving…";
    showMsg((silent ? "Auto-saving " : "Saving ") + updates.length + " student(s)…", "info");

    fetch("/api/teacher/save", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, getAuthHeaders()),
      body: JSON.stringify({ stream: currentStream, exam: currentExam, updates: updates, grade: currentGrade })
    })
    .then(function (r) {
      return r.text().then(function (text) {
        if (r.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
        var d;
        try {
          d = JSON.parse(text);
        } catch (err) {
          var cleanTxt = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          d = { error: cleanTxt.substring(0, 150) || ("Server error (HTTP " + r.status + ")") };
        }
        return d;
      });
    })
    .then(function (d) {
      isSaving = false;
      if (saveBtn) { saveBtn.classList.remove("saving"); saveBtn.innerHTML = '<svg viewBox="0 0 24 24" class="btn-ic"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Marks'; }
      if (d.error) {
        showMsg("Error: " + d.error, "error");
        updateSaveState();
        return;
      }

      if (silent) {
        showMsg("Auto-saved " + d.count + " student(s)", "ok");
        setTimeout(hideMsg, 3000);
      } else {
        showMsg("Saved " + d.count + " student(s) successfully!", "ok");
      }

      // Flash saved cells green
      tBody.querySelectorAll(".mark-input.changed").forEach(function (inp) {
        inp.classList.remove("changed");
        inp.classList.add("saved");
        setTimeout(function () { inp.classList.remove("saved"); }, 1500);
      });

      // Clear only the keys/subjects that were saved in this batch
      updates.forEach(function (upd) {
        var roll = upd.rollNo;
        if (dirtyRolls[roll]) {
          if (upd.marks) {
            for (var s in upd.marks) {
              if (dirtyRolls[roll][s] === upd.marks[s]) {
                delete dirtyRolls[roll][s];
              }
            }
            if (Object.keys(dirtyRolls[roll]).length === 0) {
              delete dirtyRolls[roll];
            }
          } else {
            delete dirtyRolls[roll];
          }
        }
      });

      updateSaveState();
      recountFilled();
      renderSubjectStats();
    })
    .catch(function (e) {
      isSaving = false;
      if (saveBtn) { saveBtn.classList.remove("saving"); saveBtn.innerHTML = '<svg viewBox="0 0 24 24" class="btn-ic"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save All Marks'; }
      showMsg("Network error: " + e.message, "error");
      updateSaveState();
    });
  }

  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (saveStatusText) saveStatusText.textContent = "Auto-save in 3s…";
    autoSaveTimer = setTimeout(function () {
      autoSaveTimer = null;
      saveAll(true); // silent auto-save
    }, AUTO_SAVE_DELAY);
  }

  /* ═══════════ Helpers ═══════════ */
  function resetDirty() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    dirtyRolls = {};
    updateSaveState();
  }

  function updateSaveState() {
    var changed = Object.keys(dirtyRolls).length;
    if (!saveStatusText || !saveStatus) return;
    if (changed) {
      saveStatusText.textContent = changed + " student" + (changed === 1 ? "" : "s") + " with unsaved changes — auto-saving shortly";
      saveStatus.classList.add("has-changes");
      if (saveBtn) saveBtn.setAttribute("aria-label", "Save changes for " + changed + " student" + (changed === 1 ? "" : "s"));
      scheduleAutoSave();
    } else {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      saveStatusText.textContent = "All changes saved";
      saveStatus.classList.remove("has-changes");
      if (saveBtn) saveBtn.setAttribute("aria-label", "Save all marks");
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
    if (countEl) countEl.textContent = studentRows.length + " students";
    if (filledEl) filledEl.textContent = filled + " filled";
    if (emptyEl) emptyEl.textContent = (total - filled) + " empty";
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

  /* ═══════════ Background Real-Time Auto-Sync ═══════════ */
  // Seamlessly polls Google Sheet every 8s when user is not actively editing
  setInterval(function () {
    if (!token) return;
    var activeTag = document.activeElement ? document.activeElement.tagName : "";
    if (activeTag === "INPUT" || activeTag === "TEXTAREA" || Object.keys(dirtyRolls).length > 0 || isSaving) {
      return; // Do not reload while user is actively typing or has unsaved edits
    }
    loadData(true);
  }, 8000);
})();
