/* Student report generator — front end.
   Calls Gemini API directly from the browser to avoid Netlify serverless timeout limits. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function num(n) { return (n == null || isNaN(n)) ? "\u2014" : (Math.round(n * 100) / 100); }

  // ---------- Gemini config ----------
  var _k = atob("QVEuQWI4Uk42SWhUdUlseUpYTURrdFQ2bF9ncl9SWVBqQ1dkdGtYNnA3SzRIbk5GLWZHN2c=");
  var GEMINI_MODEL = "gemini-2.5-flash";
  var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL + ":generateContent?key=" + encodeURIComponent(_k);

  var SYSTEM_PROMPT =
    "You are a strict but fair senior examiner at KSR Akshara Academy grading a " +
    "student's exam. You are given three inputs: SYLLABUS (optional), QUESTION PAPER, and student's WRITTEN ANSWER SHEET.\n\n" +
    "Read the answer sheet carefully, match each answer to its question, evaluate it against the question paper and syllabus, and generate a structured STUDENT PERFORMANCE REPORT.\n\n" +
    "Instructions for output JSON:\n" +
    "- studentName: Student's name if found on answer sheet (e.g. 'Kanimitha. M.'), otherwise 'Student'.\n" +
    "- gradeSection: Grade and section e.g. 'Grade XII - Harmony'.\n" +
    "- subject: Subject title and code, e.g. 'Physics (042)'.\n" +
    "- examTitle: Exam title, e.g. 'Cumulative Examination 2026-27'.\n" +
    "- dateOfExam: Date of examination e.g. 'June 1, 2026' or current date.\n" +
    "- totalMaxMarks: Total maximum marks for the paper (e.g. 70).\n" +
    "- totalMarksObtained: Total marks scored on the cover/overall.\n" +
    "- evaluatedTotalMarks: Total sum across evaluated sections.\n" +
    "- summaryPerformanceLevel: Brief overall summary e.g. 'Good with targeted gaps', 'Outstanding', or 'Needs Improvement'.\n" +
    "- footnote: Optional note if evaluated total differs slightly from recorded cover total. If no discrepancy, set to empty string.\n" +
    "- sections: Group questions by section (e.g. Section A, Section B, Section C, Section D, Section E). For each section provide:\n" +
    "    - sectionName: e.g. 'Section A'\n" +
    "    - questionType: e.g. 'Multiple Choice & Assertion-Reason', 'Short Answer I', 'Short Answer II', 'Case-Based Questions', 'Long Answer / Derivations'\n" +
    "    - totalMarks: Total marks in this section\n" +
    "    - obtainedMarks: Marks scored in this section\n" +
    "    - performanceLevel: Brief rating like 'Needs Significant Improvement', 'Outstanding (100%)', 'Average', 'Very Good'\n" +
    "- strengths: Array of 3 to 5 objects with { title, detail } highlighting key strengths.\n" +
    "- areasForImprovement: Array of 3 to 5 objects with { title, detail } highlighting key weaknesses.\n" +
    "- actionableRecommendations: Array of 3 to 5 objects with { title, detail } giving concrete advice.\n";

  var RESPONSE_SCHEMA = {
    type: "object",
    properties: {
      studentName: { type: "string" },
      gradeSection: { type: "string" },
      subject: { type: "string" },
      examTitle: { type: "string" },
      dateOfExam: { type: "string" },
      totalMaxMarks: { type: "number" },
      totalMarksObtained: { type: "number" },
      evaluatedTotalMarks: { type: "number" },
      summaryPerformanceLevel: { type: "string" },
      footnote: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sectionName: { type: "string" },
            questionType: { type: "string" },
            totalMarks: { type: "number" },
            obtainedMarks: { type: "number" },
            performanceLevel: { type: "string" }
          },
          required: ["sectionName", "questionType", "totalMarks", "obtainedMarks", "performanceLevel"]
        }
      },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" } },
          required: ["title", "detail"]
        }
      },
      areasForImprovement: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" } },
          required: ["title", "detail"]
        }
      },
      actionableRecommendations: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" } },
          required: ["title", "detail"]
        }
      }
    },
    required: [
      "studentName", "gradeSection", "subject", "examTitle", "dateOfExam",
      "totalMaxMarks", "totalMarksObtained", "sections",
      "strengths", "areasForImprovement", "actionableRecommendations"
    ]
  };

  // ---------- file helpers ----------
  function extractPdfText(file) {
    if (!window.pdfjsLib) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        var typedarray = new Uint8Array(fr.result);
        window.pdfjsLib.getDocument(typedarray).promise.then(function (pdf) {
          var maxPages = Math.min(pdf.numPages, 10);
          var count = 0;
          var fullText = "";
          for (var i = 1; i <= maxPages; i++) {
            (function (pageNum) {
              pdf.getPage(pageNum).then(function (page) {
                page.getTextContent().then(function (textContent) {
                  var pageStr = textContent.items.map(function (item) { return item.str; }).join(" ");
                  fullText += "\n--- Page " + pageNum + " ---\n" + pageStr;
                  count++;
                  if (count === maxPages) {
                    resolve(fullText.trim());
                  }
                });
              });
            })(i);
          }
        }).catch(function () { resolve(null); });
      };
      fr.onerror = function () { resolve(null); };
      fr.readAsArrayBuffer(file);
    });
  }

  function readFile(input) {
    var f = input.files && input.files[0];
    if (!f) return Promise.resolve(null);

    if (f.type === "application/pdf" || (f.name && f.name.toLowerCase().endsWith(".pdf"))) {
      return extractPdfText(f).then(function (txt) {
        if (txt && txt.trim().length > 30) {
          return { text: txt, name: f.name };
        }
        return readAsBase64(f);
      });
    }
    return readAsBase64(f);
  }

  function readAsBase64(f) {
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

  // ---------- build Gemini request parts ----------
  function buildParts(inputs) {
    var parts = [{ text: SYSTEM_PROMPT }];

    function addInput(label, input) {
      if (!input) return;
      parts.push({ text: "\n===== " + label + " =====" });
      if (input.text && input.text.trim()) {
        parts.push({ text: input.text.trim() });
      } else if (input.data && input.mimeType) {
        parts.push({ inlineData: { mimeType: input.mimeType, data: input.data } });
      }
    }

    addInput("SYLLABUS", inputs.syllabus);
    addInput("QUESTION PAPER", inputs.questionPaper);
    addInput("STUDENT WRITTEN ANSWER SHEET", inputs.answerPaper);

    if (inputs.notes && inputs.notes.trim()) {
      parts.push({ text: "\n===== ADDITIONAL INSTRUCTIONS =====\n" + inputs.notes.trim() });
    }
    parts.push({ text: "\nNow produce the structured evaluation report matching the schema." });
    return parts;
  }

  // ---------- call Gemini directly ----------
  function callGemini(inputs) {
    var body = {
      contents: [{ role: "user", parts: buildParts(inputs) }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    };

    return fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (raw) {
        if (!res.ok) {
          var msg = "Gemini API error (HTTP " + res.status + ")";
          try { var j = JSON.parse(raw); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
          throw new Error(msg);
        }
        var data = JSON.parse(raw);
        var candidate = data.candidates && data.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
          throw new Error("Gemini returned empty response.");
        }
        var textOut = candidate.content.parts[0].text;
        if (!textOut) throw new Error("Gemini returned empty text.");
        return { report: JSON.parse(textOut), model: "Gemini (" + GEMINI_MODEL + ")" };
      });
    });
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

      var statusStage = 0;
      var progressTimer = setInterval(function () {
        if (pct < 92) {
          // Slow climb over ~2 minutes: 5% to 92% in ~120 seconds
          pct += (pct < 35 ? 1.2 : (pct < 65 ? 0.7 : 0.5));
          if (pct > 92) pct = 92;

          // 5 status stages at different milestones
          if (statusStage === 0 && pct >= 15) {
            statusStage = 1;
            if (statusEl) statusEl.textContent = "Extracting text from uploaded files...";
          } else if (statusStage === 1 && pct >= 30) {
            statusStage = 2;
            if (statusEl) statusEl.textContent = "Analyzing question paper & syllabus rubric...";
          } else if (statusStage === 2 && pct >= 50) {
            statusStage = 3;
            if (statusEl) statusEl.textContent = "Grading section marks & detecting discrepancies...";
          } else if (statusStage === 3 && pct >= 70) {
            statusStage = 4;
            if (statusEl) statusEl.textContent = "Generating strengths, improvements & recommendations...";
          } else if (statusStage === 4 && pct >= 85) {
            statusStage = 5;
            if (statusEl) statusEl.textContent = "Finalizing student performance report...";
          }

          if (pctEl) pctEl.textContent = Math.round(pct) + "%";
          if (barEl) barEl.style.width = pct + "%";
        }
      }, 1000);

      return callGemini({
        syllabus: parts[0],
        questionPaper: question,
        answerPaper: answer,
        notes: $("#notesText").value.trim()
      })
        .then(function (result) {
          clearInterval(progressTimer);
          btn.disabled = false;
          if (barEl) barEl.style.width = "100%";
          if (pctEl) pctEl.textContent = "100%";
          m.className = "message"; m.innerHTML = "";
          renderReport(result.report, result.model);
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

    var studentName = rep.studentName || "\u2014";
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
        "<td class='pdf-td-bold'>" + esc(s.sectionName || s.section || s.number || "\u2014") + "</td>" +
        "<td>" + esc(s.questionType || s.question || "\u2014") + "</td>" +
        "<td class='pdf-td-center'>" + num(tm) + "</td>" +
        "<td class='pdf-td-center'>" + num(om) + "</td>" +
        "<td>" + esc(s.performanceLevel || s.remarks || "\u2014") + "</td>" +
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
