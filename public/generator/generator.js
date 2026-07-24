/* Student report generator — front end.
   Files are read in the browser and sent as base64; the API key lives only on the server. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function num(n) { return (n == null || isNaN(n)) ? "—" : (Math.round(n * 100) / 100); }

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

  function collect(textSel, fileSel) {
    var t = $(textSel).value.trim();
    if (t) return Promise.resolve({ text: t });
    return readFile($(fileSel));
  }

  // ---------- generate ----------
  $("#genForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("#genBtn"), m = $("#genMsg");
    m.className = "message"; m.innerHTML = "";

    Promise.all([
      collect("#syllabusText", "#syllabusFile"),
      collect("#questionText", "#questionFile"),
      collect("#answerText", "#answerFile")
    ]).then(function (parts) {
      var question = parts[1];
      var answer = parts[2];
      if (!question || (!question.text && !question.data)) {
        m.className = "message error"; m.innerHTML = "Please provide the Question Paper (text or file).";
        return;
      }
      if (!answer || (!answer.text && !answer.data)) {
        m.className = "message error"; m.innerHTML = "Please provide the student's Answer Sheet (text or file).";
        return;
      }
      btn.disabled = true;
      m.className = "message info";
      m.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;"><span id="genStatusText">Reading answer sheet &amp; question paper&hellip;</span><span id="genPctText">5%</span></div>' +
                    '<div class="gen-progress-track"><div id="genProgressBar" class="gen-progress-bar" style="width:5%"></div></div>' +
                    '<div style="font-size:.78rem;color:var(--muted);margin-top:6px;">Please keep this tab open while AI evaluates the marks.</div>';

      var pct = 5;
      var statusEl = $("#genStatusText");
      var pctEl = $("#genPctText");
      var barEl = $("#genProgressBar");

      var progressTimer = setInterval(function () {
        if (pct < 92) {
          pct += (pct < 40 ? 4 : (pct < 75 ? 2 : 1));
          if (pct === 25) { if (statusEl) statusEl.textContent = "Analyzing question paper & syllabus rubric..."; }
          else if (pct === 50) { if (statusEl) statusEl.textContent = "Grading section marks & detecting discrepancies..."; }
          else if (pct === 80) { if (statusEl) statusEl.textContent = "Generating actionable student recommendations..."; }

          if (pctEl) pctEl.textContent = pct + "%";
          if (barEl) barEl.style.width = pct + "%";
        }
      }, 500);

      return fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syllabus: parts[0], questionPaper: question, answerPaper: answer,
          notes: $("#notesText").value.trim()
        })
      })
        .then(function (r) {
          return r.text().then(function (txt) {
            var b;
            try { b = JSON.parse(txt); }
            catch (e) { b = { error: txt || ("HTTP " + r.status + " Server Error") }; }
            return { status: r.status, body: b };
          });
        })
        .then(function (res) {
          clearInterval(progressTimer);
          btn.disabled = false;
          if (res.status !== 200 || (res.body && res.body.error)) {
            m.className = "message error"; m.innerHTML = esc((res.body && res.body.error) || "Generation failed.");
            return;
          }
          if (barEl) barEl.style.width = "100%";
          if (pctEl) pctEl.textContent = "100%";
          m.className = "message"; m.innerHTML = "";
          renderReport(res.body.report, res.body.model);
        })
        .catch(function (err) {
          clearInterval(progressTimer);
          btn.disabled = false;
          m.className = "message error"; m.innerHTML = esc(err.message || "Network request failed.");
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
    return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function renderReport(rep, model) {
    rep = rep || {};
    var host = $("#genReport");

    var studentName = rep.studentName || "—";
    var gradeSection = rep.gradeSection || "Grade XII";
    var subject = rep.subject || "Subject";
    var dateOfExam = rep.dateOfExam || today();
    var examTitle = rep.examTitle || "Cumulative Examination 2026-27";
    var maxMarks = rep.totalMaxMarks != null ? rep.totalMaxMarks : 70;
    var obtainedMarks = rep.totalMarksObtained != null ? rep.totalMarksObtained : (rep.evaluatedTotalMarks != null ? rep.evaluatedTotalMarks : 0);

    var h = "";

    // 1. Title & Subtitle Header
    h += "<div class='pdf-report-header'>" +
      "<h1 class='pdf-title'>STUDENT PERFORMANCE REPORT</h1>" +
      "<div class='pdf-subtitle'>KSR Akshara Academy &mdash; " + esc(examTitle) + "</div>" +
      "<div class='pdf-header-line'></div>" +
      "</div>";

    // 2. Student & Examination Profile
    h += "<div class='pdf-sec-bar'>1. Student &amp; Examination Profile</div>";
    h += "<div class='pdf-profile-grid'>" +
      "<div class='pdf-p-row'>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Student Name:</span> <span class='pdf-p-val'>" + esc(studentName) + "</span></div>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Grade / Section:</span> <span class='pdf-p-val'>" + esc(gradeSection) + "</span></div>" +
      "</div>" +
      "<div class='pdf-p-row'>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Subject:</span> <span class='pdf-p-val'>" + esc(subject) + "</span></div>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Date of Exam:</span> <span class='pdf-p-val'>" + esc(dateOfExam) + "</span></div>" +
      "</div>" +
      "<div class='pdf-p-row pdf-p-row-last'>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Maximum Marks:</span> <span class='pdf-p-val'>" + num(maxMarks) + "</span></div>" +
        "<div class='pdf-p-cell'><span class='pdf-p-lbl'>Marks Obtained:</span> <span class='pdf-score-pill'>" + num(obtainedMarks) + " / " + num(maxMarks) + "</span></div>" +
      "</div>" +
      "</div>";

    // 3. Section-Wise Performance Breakdown
    h += "<div class='pdf-sec-bar'>2. Section-Wise Performance Breakdown</div>";
    h += "<div class='tbl-scroll'><table class='pdf-table'>" +
      "<thead><tr>" +
      "<th>Section</th><th>Question Type</th><th>Total Marks</th><th>Obtained</th><th>Performance Level</th>" +
      "</tr></thead><tbody>";

    var sections = rep.sections || [];
    var sumTotal = 0;
    var sumObtained = 0;

    sections.forEach(function (s) {
      var tm = s.totalMarks != null ? s.totalMarks : (s.maxMarks || 0);
      var om = s.obtainedMarks != null ? s.obtainedMarks : (s.marksAwarded || 0);
      sumTotal += tm;
      sumObtained += om;
      h += "<tr>" +
        "<td class='pdf-td-bold'>" + esc(s.sectionName || s.section || s.number || "—") + "</td>" +
        "<td>" + esc(s.questionType || s.question || "—") + "</td>" +
        "<td class='pdf-td-center'>" + num(tm) + "</td>" +
        "<td class='pdf-td-center'>" + num(om) + "</td>" +
        "<td>" + esc(s.performanceLevel || s.remarks || "—") + "</td>" +
        "</tr>";
    });

    var totalObtainedDisp = rep.evaluatedTotalMarks != null ? num(rep.evaluatedTotalMarks) : num(sumObtained || obtainedMarks);
    var overallPerf = rep.summaryPerformanceLevel || rep.grade || "Good with targeted gaps";

    h += "<tr class='pdf-total-row'>" +
      "<td class='pdf-td-bold'>Total Evaluation</td>" +
      "<td></td>" +
      "<td class='pdf-td-center'>" + num(sumTotal || maxMarks) + "</td>" +
      "<td class='pdf-td-center'>" + totalObtainedDisp + (rep.footnote ? "*" : "") + "</td>" +
      "<td>" + esc(overallPerf) + "</td>" +
      "</tr>";
    h += "</tbody></table></div>";

    if (rep.footnote) {
      h += "<div class='pdf-footnote'>" + esc(rep.footnote) + "</div>";
    }

    // 4. Key Strengths
    h += "<div class='pdf-sec-bar'>3. Key Strengths</div>";
    h += renderBulletList(rep.strengths);

    // 5. Key Areas for Improvement
    h += "<div class='pdf-sec-bar'>4. Key Areas for Improvement</div>";
    h += renderBulletList(rep.areasForImprovement);

    // 6. Actionable Recommendations
    h += "<div class='pdf-sec-bar'>5. Actionable Recommendations</div>";
    h += renderBulletList(rep.actionableRecommendations || rep.recommendations);

    h += "<p class='ai-note'>Generated by AI (" + esc(model || "Gemini") + ").</p>";

    host.innerHTML = h;
    $("#genCard").hidden = true;
    $("#genResultWrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderBulletList(arr) {
    if (!arr || !arr.length) return "<p class='pdf-empty'>&mdash;</p>";
    var html = "<ul class='pdf-bullet-list'>";
    arr.forEach(function (item) {
      if (typeof item === 'string') {
        html += "<li>" + esc(item) + "</li>";
      } else if (item && typeof item === 'object') {
        var t = item.title ? "<strong>" + esc(item.title) + ":</strong> " : "";
        html += "<li>" + t + esc(item.detail || item.text || item.description || "") + "</li>";
      }
    });
    html += "</ul>";
    return html;
  }
})();
