/* Staff report generator — front end.
   Login mints a token (server-side HMAC); every generate call carries it so the
   Gemini endpoint can't be hit without signing in. Files are read in the browser
   and sent as base64; the API key lives only on the server. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function num(n) { return (n == null || isNaN(n)) ? "—" : (Math.round(n * 100) / 100); }

  var SESSION_KEY = "akshara_gen_auth";
  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }
  function isAuthed() { var s = session(); return !!(s && s.token && s.until > Date.now()); }
  function saveSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  // ---------- login ----------
  function showLogin() { $("#genCard").hidden = true; $("#genResultWrap").hidden = true; $("#loginOverlay").hidden = false; setTimeout(function () { $("#loginUser").focus(); }, 50); }
  function showApp() { $("#loginOverlay").hidden = true; $("#genCard").hidden = false; }

  $("#loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("#loginBtn"), m = $("#loginMsg");
    btn.disabled = true; m.className = "message"; m.innerHTML = "";
    fetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("#loginUser").value.trim(), password: $("#loginPass").value })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (res.body.ok && res.body.token) {
          saveSession({ token: res.body.token, until: res.body.until });
          showApp();
        } else {
          m.className = "message error"; m.innerHTML = esc(res.body.error || "Invalid credentials");
          btn.disabled = false;
        }
      })
      .catch(function () { m.className = "message error"; m.innerHTML = "Could not reach server. Try again."; btn.disabled = false; });
  });

  $("#logoutBtn").addEventListener("click", function () { clearSession(); showLogin(); });

  // ---------- file helpers ----------
  function readFile(input) {
    var f = input.files && input.files[0];
    if (!f) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var comma = s.indexOf(",");
        resolve({ mimeType: f.type || "application/octet-stream", data: s.slice(comma + 1), name: f.name });
      };
      fr.onerror = function () { reject(new Error("Could not read " + f.name)); };
      fr.readAsDataURL(f);
    });
  }
  // whichever the user filled: text wins, else the file
  function collect(textSel, fileSel) {
    var t = $(textSel).value.trim();
    if (t) return Promise.resolve({ text: t });
    return readFile($(fileSel));
  }

  // ---------- generate ----------
  $("#genForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!isAuthed()) { showLogin(); return; }
    var btn = $("#genBtn"), m = $("#genMsg");
    m.className = "message"; m.innerHTML = "";

    Promise.all([
      collect("#syllabusText", "#syllabusFile"),
      collect("#questionText", "#questionFile"),
      collect("#answerText", "#answerFile")
    ]).then(function (parts) {
      var answer = parts[2];
      if (!answer || (!answer.text && !answer.data)) {
        m.className = "message error"; m.innerHTML = "Please provide the student's answer sheet (text or file).";
        return;
      }
      btn.disabled = true;
      m.className = "message info";
      m.innerHTML = "Evaluating&hellip; this can take up to a minute.<span class='gen-busy'>Please keep this tab open.</span>";

      var s = session();
      return fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (s && s.token) },
        body: JSON.stringify({
          token: s && s.token,
          syllabus: parts[0], questionPaper: parts[1], answerPaper: answer,
          notes: $("#notesText").value.trim()
        })
      })
        .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (res.status === 401) { clearSession(); showLogin(); return; }
          if (res.status !== 200) {
            m.className = "message error"; m.innerHTML = esc(res.body.error || "Generation failed.");
            return;
          }
          m.className = "message"; m.innerHTML = "";
          renderReport(res.body.report, res.body.model);
        });
    }).catch(function (e) {
      btn.disabled = false;
      m.className = "message error"; m.innerHTML = esc((e && e.message) || "Something went wrong.");
    });
  });

  $("#genBackBtn").addEventListener("click", function () {
    $("#genResultWrap").hidden = true; $("#genCard").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#printGenBtn").addEventListener("click", function () { window.print(); });

  // ---------- render ----------
  function today() {
    return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function card(n, lbl) {
    return "<div class='card'><div class='num'>" + n + "</div><div class='lbl'>" + esc(lbl) + "</div></div>";
  }
  function list(arr) {
    if (!arr || !arr.length) return "<p class='gen-feedback'>—</p>";
    return "<ul class='gen-list'>" + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }

  function renderReport(rep, model) {
    rep = rep || {};
    var host = $("#genReport");
    var awarded = rep.totalMarksAwarded, max = rep.totalMaxMarks;
    var pct = rep.percentage;
    if ((pct == null || isNaN(pct)) && max) pct = Math.round(awarded / max * 1000) / 10;

    var h = "";
    h += "<div class='rep-head'>" +
      "<div class='rep-banner'>Akshara Academy &middot; Grade XII</div>" +
      "<h2>AI Evaluation Report</h2>" +
      "<div class='school'>" + esc(rep.subject || "Subject") +
      (rep.examTitle ? " &middot; " + esc(rep.examTitle) : "") + " &middot; " + today() + "</div>" +
      (rep.grade ? "<div class='gen-grade-badge'>Grade: " + esc(rep.grade) + "</div>" : "") +
      "</div>";

    // student info
    h += "<div class='sec-title'>1. Student Information</div>";
    h += "<div class='info'>" +
      cell("Name", rep.studentName || "—") +
      cell("Roll Number", rep.rollNo || "—") +
      cell("Subject", rep.subject || "—") +
      cell("Report Date", today()) +
      "</div>";

    // per-question table
    h += "<div class='sec-title'>2. Question-wise Evaluation</div>";
    h += "<div class='tbl-scroll'><table class='grid'><thead><tr>" +
      "<th>Q. No</th><th>Question</th><th>Max</th><th>Awarded</th><th>Remarks</th>" +
      "</tr></thead><tbody>";
    (rep.questions || []).forEach(function (q) {
      h += "<tr>" +
        "<td class='subj'>" + esc(q.number) + "</td>" +
        "<td class='gen-remarks'>" + esc(q.question || "—") + "</td>" +
        "<td>" + num(q.maxMarks) + "</td>" +
        "<td class='your-mark'>" + num(q.marksAwarded) + "</td>" +
        "<td class='gen-remarks'>" + esc(q.remarks || "") + "</td>" +
        "</tr>";
    });
    h += "<tr class='total-row'><td class='subj' colspan='2'>Total</td>" +
      "<td>" + num(max) + "</td><td>" + num(awarded) + "</td><td></td></tr>";
    h += "</tbody></table></div>";

    // summary cards
    h += "<div class='cards'>" +
      card(num(awarded) + " / " + num(max), "Total Marks") +
      card((pct != null && !isNaN(pct) ? pct + "%" : "—"), "Percentage") +
      card(esc(rep.grade || "—"), "Grade") +
      "</div>";

    // feedback
    h += "<div class='sec-title'>3. Strengths</div>" + list(rep.strengths);
    h += "<div class='sec-title'>4. Areas for Improvement</div>" + list(rep.areasForImprovement);
    h += "<div class='sec-title'>5. Overall Feedback</div>" +
      "<p class='gen-feedback'>" + esc(rep.overallFeedback || "—") + "</p>";

    h += "<p class='ai-note'>Generated by AI (" + esc(model || "Gemini") +
      "). Please review before sharing with students or parents.</p>";

    host.innerHTML = h;
    $("#genCard").hidden = true;
    $("#genResultWrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cell(k, v) {
    return "<div class='cell'><div class='k'>" + esc(k) + "</div><div class='v'>" + esc(v) + "</div></div>";
  }

  // ---------- boot ----------
  if (isAuthed()) showApp(); else showLogin();
})();
