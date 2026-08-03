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

  // ---------- Vercel serverless API mode ----------

  var SYSTEM_PROMPT =
    "You are a universal senior examiner and master evaluator for KSR Akshara Academy. " +
    "You will be given arbitrary exam documents: SYLLABUS (optional), QUESTION PAPER, and STUDENT'S WRITTEN ANSWER SHEET for any subject, any class/grade, and any exam pattern.\n\n" +
    "UNIVERSAL EVALUATION & MARK ACCURACY RULES:\n" +
    "1. DYNAMIC DOCUMENT ANALYSIS: Examine the cover page and contents of the provided answer sheet and question paper to dynamically extract the exact Student Name, Grade/Class/Section, Subject Title & Code, Exam Title, Date, and Maximum Marks of the paper.\n" +
    "2. COVER PAGE MARK GRID TRANSCRIBER: If the cover page or header of the answer sheet contains an official teacher mark grid/table or overall recorded score (e.g. 45/50, 62/70, 88/100):\n" +
    "   a. Transcribe the EXACT section/part marks and total marks as recorded by the teacher.\n" +
    "   b. Set totalMarksObtained and evaluatedTotalMarks to match the official recorded total.\n" +
    "   c. If no cover page table exists, evaluate each section/question against the provided Question Paper and sum the marks scored.\n" +
    "3. SECTION BREAKDOWN: Identify all sections/parts present in the paper (e.g. Section A, Section B, Part 1, Part 2, etc.). For each section, provide the section name, question type (e.g. MCQs, Short Answer, Long Answer, Case Study, Practical), section total max marks, section obtained marks, and performance level.\n" +
    "4. DYNAMIC SUBJECT-SPECIFIC FEEDBACK: Tailor Strengths, Areas for Improvement, and Actionable Recommendations specifically to the subject being graded (e.g. Mathematics, Physics, Chemistry, Biology, Computer Science, English, Accountancy, Business Studies, Economics, etc.). Cite specific question numbers and topic concepts from the uploaded paper.\n" +
    "5. FOOTNOTE: Set footnote to empty string '' if section marks sum up to the total. If there is a discrepancy between cover page total and section sum, briefly note it in the footnote.\n\n" +
    "Instructions for output JSON fields:\n" +
    "- studentName: Student's name found on answer sheet, or 'Student' if unreadable.\n" +
    "- gradeSection: Grade and section as stated on paper (e.g. 'Grade XII - Harmony', 'Class 10', 'Grade XI').\n" +
    "- subject: Full subject name and code as stated on paper (e.g. 'Mathematics (041)', 'Physics (042)', 'Chemistry (043)', 'Computer Science (083)', 'Accountancy (055)', 'English Core (301)').\n" +
    "- examTitle: Exam title (e.g. 'Unit Test 1', 'Periodic Exam 2', 'Full Portion Exam', 'Cumulative Examination').\n" +
    "- dateOfExam: Date of examination as stated on paper or current date.\n" +
    "- totalMaxMarks: Maximum total marks of the paper (numeric).\n" +
    "- totalMarksObtained: Total marks obtained (numeric).\n" +
    "- evaluatedTotalMarks: Sum of evaluated section marks (numeric).\n" +
    "- summaryPerformanceLevel: Overall evaluation summary.\n" +
    "- footnote: Discrepancy note or empty string ''.\n" +
    "- sections: Array of section objects { sectionName, questionType, totalMarks, obtainedMarks, performanceLevel } matching the paper structure.\n" +
    "- coreConcepts: Array of 3-5 objects { title, detail } highlighting key core subject concepts tested in the paper (e.g. Electrostatics, Capacitance, Current Electricity, Gauss's Law, etc.).\n" +
    "- studyTips: Array of 4-6 objects { title, detail } providing actionable, subject-tailored study tips & strategies (e.g. Master the MCQs, Visualize Vector Problems, Clarify Material Properties, Understand 'Why' Not Just 'What', Check Your Signs).\n" +
    "- strengths: Array of 3-5 objects { title, detail } with subject-specific feedback.\n" +
    "- areasForImprovement: Array of 3-5 objects { title, detail } with subject-specific feedback.\n";

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
      coreConcepts: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" } },
          required: ["title", "detail"]
        }
      },
      studyTips: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" } },
          required: ["title", "detail"]
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
      }
    },
    required: [
      "studentName", "gradeSection", "subject", "examTitle", "dateOfExam",
      "totalMaxMarks", "totalMarksObtained", "sections",
      "strengths", "areasForImprovement", "coreConcepts", "studyTips"
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
          var maxPages = Math.min(pdf.numPages, 15);
          var promises = [];
          for (var i = 1; i <= maxPages; i++) {
            (function (pageNum) {
              promises.push(pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent().then(function (textContent) {
                  var pageStr = textContent.items.map(function (item) { return item.str; }).join(" ");
                  return "--- Page " + pageNum + " ---\n" + pageStr;
                });
              }));
            })(i);
          }
          Promise.all(promises).then(function (pagesText) {
            var fullText = pagesText.join("\n\n").trim();
            resolve(fullText.length > 30 ? fullText : null);
          }).catch(function () { resolve(null); });
        }).catch(function () { resolve(null); });
      };
      fr.onerror = function () { resolve(null); };
      fr.readAsArrayBuffer(file);
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxDim = 1400;
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.70);
        var comma = dataUrl.indexOf(",");
        resolve({ mimeType: "image/jpeg", data: dataUrl.slice(comma + 1), name: file.name });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        readAsBase64(file).then(resolve);
      };
      img.src = url;
    });
  }

  function renderPdfPagesToJpegs(file) {
    if (!window.pdfjsLib) return readAsBase64(file);
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        var typedarray = new Uint8Array(fr.result);
        window.pdfjsLib.getDocument(typedarray).promise.then(function (pdf) {
          var maxPages = Math.min(pdf.numPages, 12);
          var renderPromises = [];

          for (var i = 1; i <= maxPages; i++) {
            (function(pNum) {
              renderPromises.push(
                pdf.getPage(pNum).then(function (page) {
                  var viewport = page.getViewport({ scale: 1.2 });
                  var canvas = document.createElement("canvas");
                  canvas.width = viewport.width;
                  canvas.height = viewport.height;
                  var ctx = canvas.getContext("2d");
                  return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                    var maxW = 1000;
                    var finalCanvas = canvas;
                    if (canvas.width > maxW) {
                      var scale = maxW / canvas.width;
                      var scCanvas = document.createElement("canvas");
                      scCanvas.width = maxW;
                      scCanvas.height = Math.round(canvas.height * scale);
                      var scCtx = scCanvas.getContext("2d");
                      scCtx.drawImage(canvas, 0, 0, scCanvas.width, scCanvas.height);
                      finalCanvas = scCanvas;
                    }
                    var dataUrl = finalCanvas.toDataURL("image/jpeg", 0.55);
                    var comma = dataUrl.indexOf(",");
                    return { mimeType: "image/jpeg", data: dataUrl.slice(comma + 1) };
                  });
                })
              );
            })(i);
          }

          Promise.all(renderPromises).then(function (imgs) {
            resolve({ images: imgs, name: file.name });
          }).catch(function () {
            readAsBase64(file).then(resolve);
          });
        }).catch(function () {
          readAsBase64(file).then(resolve);
        });
      };
      fr.onerror = function () { readAsBase64(file).then(resolve); };
      fr.readAsArrayBuffer(file);
    });
  }

  function readFile(input) {
    var f = input.files && input.files[0];
    if (!f) return Promise.resolve(null);

    // If PDF, try text extraction first. If text content is substantial (> 120 chars), send text.
    // If text is minimal/empty (scanned PDF), render pages as JPEGs so even 30MB PDFs compress to ~800KB!
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      return extractPdfText(f).then(function (pdfText) {
        var cleanText = pdfText ? pdfText.replace(/--- Page \d+ ---/g, "").trim() : "";
        if (cleanText.length > 120) {
          return { text: pdfText, name: f.name };
        }
        return renderPdfPagesToJpegs(f);
      });
    }

    // If image, compress image
    if (f.type && f.type.startsWith("image/")) {
      return compressImage(f);
    }

    return readAsBase64(f);
  }

  function readAsBase64(f) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var comma = s.indexOf(",");
        var mime = f.type;
        if (!mime || mime === "application/octet-stream") {
          if (f.name.toLowerCase().endsWith(".pdf")) mime = "application/pdf";
          else if (f.name.toLowerCase().endsWith(".png")) mime = "image/png";
          else mime = "image/jpeg";
        }
        resolve({ mimeType: mime, data: s.slice(comma + 1), name: f.name });
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

  // ---------- call secure serverless endpoint ----------
  function callGemini(inputs) {
    var payloadStr = JSON.stringify({
      syllabus: inputs.syllabus,
      questionPaper: inputs.questionPaper,
      answerPaper: inputs.answerPaper,
      notes: inputs.notes
    });

    if (payloadStr.length > 3.8 * 1024 * 1024) {
      return Promise.reject(new Error("Uploaded files are too large for serverless processing (exceeds 3.5MB limit). Please upload PDF/image files under 3MB or paste plain text."));
    }

    return fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadStr
    }).then(function (res) {
      return res.text().then(function (raw) {
        var b;
        try { b = JSON.parse(raw); }
        catch (e) { b = { error: raw || ("HTTP " + res.status + " Server Error") }; }
        
        if (!res.ok || b.error) {
          throw new Error(b.error || "Server failed to process request.");
        }
        return b;
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
      var hasQuestion = question && (question.text || question.data || (Array.isArray(question.images) && question.images.length > 0));
      var hasAnswer = answer && (answer.text || answer.data || (Array.isArray(answer.images) && answer.images.length > 0));

      if (!hasQuestion) {
        m.className = "message error"; m.innerHTML = "Please provide the Question Paper (text or file).";
        return;
      }
      if (!hasAnswer) {
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

    // 6. Core Concepts Assessed
    h += "<div class='pdf-sec-bar'>5. Core Concepts Assessed</div>";
    h += renderBulletList(rep.coreConcepts);

    // 7. Actionable Study Tips
    h += "<div class='pdf-sec-bar'>6. Actionable Study Tips</div>";
    h += renderBulletList(rep.studyTips || rep.actionableRecommendations);

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
