/* ============================================================
   Question Paper Setter Engine & UI Controller
   CBSE Class 12 / High School Exam Paper Shuffler & Formatter
   ============================================================ */

(function () {
  "use strict";

  /* ── Staff Authorization Guard ── */
  var AUTHORIZED_USER = "dhisounprabu@ksrakshara.org";
  var teacherInfo = null;
  var teacherToken = "";
  try {
    teacherInfo = JSON.parse(localStorage.getItem("teacher_info") || "null");
    teacherToken = localStorage.getItem("teacher_token") || "";
  } catch (e) {}

  var currentUser = (teacherInfo && (teacherInfo.user || teacherInfo.email) || "").toLowerCase();
  var isAuthorized = teacherToken && (
    currentUser === AUTHORIZED_USER ||
    currentUser === "dhisounprabu" ||
    (teacherInfo && teacherInfo.isAdmin === true)
  );

  if (!isAuthorized) {
    function showAccessDenied() {
      var container = document.querySelector(".ps-container");
      if (container) container.style.display = "none";

      var accessModal = document.createElement("div");
      accessModal.className = "login-modal-overlay";
      accessModal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;";
      accessModal.innerHTML =
        '<div style="background:#fff;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.25);max-width:460px;width:100%;padding:36px 28px;text-align:center;font-family:system-ui,-apple-system,sans-serif;">' +
          '<div style="width:60px;height:60px;border-radius:50%;background:#fee2e2;color:#dc2626;display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;">' +
            '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
          '</div>' +
          '<h2 style="margin:0 0 10px;font-size:1.4rem;color:#0f172a;font-weight:700;">Access Restricted</h2>' +
          '<p style="color:#64748b;font-size:0.94rem;line-height:1.55;margin-bottom:24px;">' +
            'The Question Paper Setter is exclusively restricted to authorized personnel (<strong>Mr. Dhisoun Prabu. D</strong>). Please sign in with an authorized account on the Teacher Portal.' +
          '</p>' +
          '<a href="/teacher/" style="display:inline-flex;align-items:center;justify-content:center;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:11px 26px;border-radius:8px;font-size:0.95rem;box-shadow:0 2px 8px rgba(29,78,216,0.3);">Return to Teacher Portal</a>' +
        '</div>';
      document.body.appendChild(accessModal);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showAccessDenied);
    } else {
      showAccessDenied();
    }
    return; // Halt Question Paper Setter initialization
  }

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  }

  /* ── State ── */
  var parsedPaper = null;
  var generatedSets = [];
  var currentActiveTab = 0; // 0: Set A, 1: Set B, etc., -1: Matrix
  var numSets = 3;
  var extractedPaperImages = {};

  /* ── DOM Elements ── */
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('paperFileInput');
  var fileBadge = document.getElementById('fileSelectedBadge');
  var setsSelect = document.getElementById('numSetsSelect');
  var generateBtn = document.getElementById('generateSetsBtn');
  var resultsSection = document.getElementById('resultsSection');
  var tabsList = document.getElementById('tabsList');
  var paperPreview = document.getElementById('paperPreview');
  var matrixPreview = document.getElementById('matrixPreview');
  var printSetBtn = document.getElementById('printSetBtn');
  var downloadDocBtn = document.getElementById('downloadDocBtn');
  var downloadAllBtn = document.getElementById('downloadAllBtn');
  var loadSampleTableBtn = document.getElementById('loadSampleTableBtn');

  /* ── Shuffling Permutation Functions ── */

  // Balanced permutation generator for 4 options [0, 1, 2, 3]
  // Generates different balanced permutations across sets
  var OPTION_PERMUTATIONS = [
    [0, 1, 2, 3], // Set A: a, b, c, d
    [2, 3, 0, 1], // Set B: c, d, a, b (shifted)
    [3, 0, 2, 1], // Set C: d, a, c, b (swapped)
    [1, 2, 3, 0]  // Set D: b, c, d, a (rotated)
  ];

  var OPT_LABELS = ["a", "b", "c", "d", "e"];

  function permuteOptions(options, setIdx, qIdx) {
    if (!options || options.length <= 1) return { options: options || [], mapping: {} };
    var len = options.length;
    // Derive a unique deterministic shift for this question + set combination
    var offset = (setIdx * 2 + qIdx * 3) % len;
    var newOpts = [];
    var mapping = {}; // new label -> original label

    for (var i = 0; i < len; i++) {
      var origIdx;
      if (len === 4 && OPTION_PERMUTATIONS[setIdx % 4]) {
        origIdx = (OPTION_PERMUTATIONS[setIdx % 4][i] + qIdx) % len;
      } else {
        origIdx = (i + offset) % len;
      }
      var origOpt = options[origIdx];
      var origText = (typeof origOpt === 'string') ? origOpt : (origOpt && (origOpt.text !== undefined ? origOpt.text : (origOpt.option || origOpt.value || '')));
      var origLabel = (origOpt && origOpt.label) ? origOpt.label : (OPT_LABELS[origIdx] || String.fromCharCode(97 + origIdx));
      var newLabel = OPT_LABELS[i] || String.fromCharCode(97 + i);
      newOpts.push({
        label: newLabel,
        text: String(origText || '').trim(),
        originalLabel: origLabel
      });
      mapping[newLabel] = origLabel;
    }

    return { options: newOpts, mapping: mapping };
  }

  // Question shuffler for Section B and Section C
  function shuffleQuestions(questions, setIdx, seedOffset) {
    if (!questions || questions.length <= 1) return { questions: questions, mapping: {} };
    var n = questions.length;
    var indices = [];
    for (var i = 0; i < n; i++) indices.push(i);

    // Apply deterministic systematic permutation matching user's exam pattern
    var permutedIndices = [];
    var step = (setIdx === 1) ? 2 : ((setIdx === 2) ? 3 : 1);
    var shift = (setIdx * (seedOffset || 1)) % n;

    var used = {};
    for (var k = 0; k < n; k++) {
      var target = (shift + k * step) % n;
      while (used[target]) {
        target = (target + 1) % n;
      }
      used[target] = true;
      permutedIndices.push(target);
    }

    var resultQuestions = [];
    var mapping = {}; // newQNo -> origQNo

    for (var j = 0; j < n; j++) {
      var origIdx = permutedIndices[j];
      var origQ = questions[origIdx];
      var newQNo = questions[0].qNo + j; // Renumber sequentially from section start
      var cloned = JSON.parse(JSON.stringify(origQ));
      cloned.qNo = newQNo;
      cloned.originalQNo = origQ.qNo;
      if (origQ.image) cloned.image = origQ.image;
      resultQuestions.push(cloned);
      mapping[newQNo] = origQ.qNo;
    }

    return { questions: resultQuestions, mapping: mapping };
  }

  /* ── Multi-Set Generator Engine ── */
  function generateSetsFromPaper(paper, count) {
    var sets = [];
    var setNames = ["SET A", "SET B", "SET C", "SET D"];

    for (var s = 0; s < count; s++) {
      var setName = setNames[s] || ("SET " + String.fromCharCode(65 + s));
      var isOriginal = (s === 0);

      var newSections = [];
      var setMapping = {
        setName: setName,
        sectionA: {}, // qNo -> { 'a': 'c', ... }
        sectionB: {}, // newQNo -> origQNo
        sectionC: {}  // newQNo -> origQNo
      };

      paper.sections.forEach(function (sec, secIdx) {
        var newSec = {
          name: sec.name,
          description: sec.description,
          marksPerQ: sec.marksPerQ,
          shuffleType: sec.shuffleType,
          questions: []
        };

        // Check if this section actually has any questions with options (MCQs)
        var hasOptions = (sec.questions || []).some(function (q) {
          return q.options && q.options.length > 0;
        });

        // Determine shuffle behavior: use shuffleType field (from Gemini)
        // or fall back intelligently based on question content
        var behavior = sec.shuffleType || 'none';
        if (behavior === 'options' && !hasOptions) {
          // If tagged as options but questions have no MCQs, shuffle the questions instead!
          behavior = 'questions';
        } else if (behavior === 'none' && !sec.shuffleType) {
          if (hasOptions) {
            behavior = 'options';
          } else if (sec.questions && sec.questions.length > 1) {
            behavior = 'questions';
          }
        }

        if (isOriginal) {
          // Set A is exact original
          newSec.questions = JSON.parse(JSON.stringify(sec.questions));
          sec.questions.forEach(function (origQ, qi) {
            if (origQ.image && newSec.questions[qi]) {
              newSec.questions[qi].image = origQ.image;
            }
          });
        } else if (behavior === 'options') {
          // Shuffle option orders (MCQs)
          sec.questions.forEach(function (q, qIdx) {
            var cloned = JSON.parse(JSON.stringify(q));
            if (q.image) cloned.image = q.image;
            if (cloned.options && cloned.options.length > 0) {
              var permRes = permuteOptions(cloned.options, s, qIdx);
              cloned.options = permRes.options;
              if (!setMapping.optionSections) setMapping.optionSections = {};
              if (!setMapping.optionSections[sec.name]) setMapping.optionSections[sec.name] = {};
              setMapping.optionSections[sec.name][cloned.qNo] = permRes.mapping;
              // Also store in legacy sectionA for backward compat
              setMapping.sectionA[cloned.qNo] = permRes.mapping;
            }
            newSec.questions.push(cloned);
          });
        } else if (behavior === 'questions') {
          // Shuffle question orders & renumber
          var res = shuffleQuestions(sec.questions, s, secIdx + 1);
          newSec.questions = res.questions;
          if (!setMapping.questionSections) setMapping.questionSections = {};
          setMapping.questionSections[sec.name] = res.mapping;
          // Also store in legacy fields for backward compat
          if (sec.name.indexOf("Section B") >= 0) setMapping.sectionB = res.mapping;
          else if (sec.name.indexOf("Section C") >= 0) setMapping.sectionC = res.mapping;
        } else {
          // Keep original sequence (case-based, passage-based, etc.)
          newSec.questions = JSON.parse(JSON.stringify(sec.questions));
          sec.questions.forEach(function (origQ, qi) {
            if (origQ.image && newSec.questions[qi]) {
              newSec.questions[qi].image = origQ.image;
            }
          });
        }

        newSections.push(newSec);
      });

      var fullTitle = paper.examTitle;
      if (s > 0 && fullTitle.indexOf("SET") === -1) {
        fullTitle += " (" + setName + ")";
      } else if (s === 0 && fullTitle.indexOf("SET") === -1) {
        fullTitle += " (SET A)";
      }

      sets.push({
        setName: setName,
        isOriginal: isOriginal,
        schoolName: paper.schoolName,
        examTitle: fullTitle,
        rawTitle: paper.examTitle,
        date: paper.date,
        grade: paper.grade,
        marks: paper.marks,
        subject: paper.subject,
        duration: paper.duration,
        instructions: paper.instructions,
        sections: newSections,
        images: paper.images || extractedPaperImages || {},
        mapping: setMapping
      });
    }

    return sets;
  }

  /* ── Plaintext & Markdown Parser (Extracts Exam Structure) ── */
  function parsePaperFromText(rawText) {
    if (!rawText || !rawText.trim()) return null;
    var lines = rawText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

    var paper = {
      schoolName: "",
      examTitle: "",
      date: "",
      grade: "",
      marks: "",
      subject: "",
      duration: "",
      instructions: [],
      sections: []
    };

    var currentSection = null;
    var currentQuestion = null;
    var inInstructions = false;

    lines.forEach(function (rawLine) {
      // Strip HTML and markdown asterisks for header detection
      var cleanLine = rawLine.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[\*_]/g, '').trim();
      if (!cleanLine) return;

      // Header extraction
      if (!paper.schoolName && /school|academy|college|vidyalaya|university|institute|international|public/i.test(cleanLine) && cleanLine.length < 90) {
        paper.schoolName = cleanLine.replace(/^\W+/, '').trim();
        return;
      }
      if (!paper.examTitle && /(?:Cummulative|Cumulative|Periodic|Annual|Mid[- ]term|Slip\s+Test|Assessment|Model|Term|Unit\s+Test|Examination|Exam)/i.test(cleanLine) && cleanLine.length < 90 && !cleanLine.includes(':')) {
        paper.examTitle = cleanLine.replace(/\s*\(SET\s*[A-Z]\)/i, '').replace(/^\W+/, '').trim();
        return;
      }
      if (/Date\s*[:=]/i.test(cleanLine)) {
        var dm = cleanLine.match(/Date\s*[:=]\s*(.*?)(?=\s+(?:Marks|Grade|Class|Subject|Sub|Duration|Time|Name)\s*[:=]|\t|$)/i);
        if (dm) paper.date = dm[1].trim();
      }
      if (/Marks\s*[:=]\s*(\d+)/i.test(cleanLine)) {
        var mm = cleanLine.match(/Marks\s*[:=]\s*(\d+)/i);
        if (mm && (!paper.marks || parseInt(mm[1], 10) > parseInt(paper.marks, 10))) paper.marks = mm[1].trim();
      }
      if (/(?:Grade|Class)\s*[:=\-–—]/i.test(cleanLine)) {
        var gm = cleanLine.match(/(?:Grade|Class)\s*[:=\-–—]\s*(.*?)(?=\s+(?:Marks|Maximum Marks|Date|Subject|Sub|Duration|Time|Name)\s*[:=]|\t|$)/i);
        if (gm) paper.grade = gm[1].trim();
      }
      if (/(?:Subject|Sub)\s*[:=]/i.test(cleanLine)) {
        var sm = cleanLine.match(/(?:Subject|Sub)\s*[:=]\s*(.*?)(?=\s+(?:Marks|Maximum Marks|Date|Grade|Class|Duration|Time|Name)\s*[:=]|\t|$)/i);
        if (sm) paper.subject = sm[1].trim();
      }
      if (/(?:Duration|Time)\s*[:=]/i.test(cleanLine)) {
        var durM = cleanLine.match(/(?:Duration|Time)\s*[:=]\s*(.*?)(?=\s+(?:Marks|Maximum Marks|Date|Grade|Class|Subject|Sub|Name)\s*[:=]|\t|$)/i);
        if (durM) paper.duration = durM[1].trim();
      }

      // General Instructions header
      if (/General\s+Instructions/i.test(cleanLine)) {
        inInstructions = true;
        return;
      }

      // Section header detection (strictly standalone section lines, e.g. "## Section A" or "Section A", not sentences)
      var secMatch = cleanLine.match(/^(?:##\s*|#\s*)?(?:Section|Part)\s+([A-E])\b(?:\s*[-:]\s*(.*))?$/i);
      var isDescriptiveSentence = /consists\s+of|contains|carries|marks\s+each|all\s+questions/i.test(cleanLine);
      if (secMatch && !isDescriptiveSentence) {
        inInstructions = false;
        if (currentQuestion && currentSection) {
          currentSection.questions.push(currentQuestion);
          currentQuestion = null;
        }
        var secLetter = secMatch[1].toUpperCase();
        var shuffleType = (secLetter === "A") ? "options" : ((secLetter === "B" || secLetter === "C") ? "questions" : "none");
        var marksPerQ = (secLetter === "A") ? "1" : ((secLetter === "B") ? "2" : ((secLetter === "C") ? "3" : ((secLetter === "D") ? "4" : "5")));

        currentSection = {
          name: "Section " + secLetter,
          description: cleanLine.replace(/^#+\s*/, ''),
          shuffleType: shuffleType,
          marksPerQ: marksPerQ,
          questions: []
        };
        paper.sections.push(currentSection);
        return;
      }

      // Inside General Instructions
      if (inInstructions && currentSection === null) {
        if (/^\d+\.\s*/.test(cleanLine)) {
          paper.instructions.push(cleanLine.replace(/^\d+\.\s*/, ''));
        } else if (cleanLine.length > 5) {
          paper.instructions.push(cleanLine);
        }
        return;
      }

      // Question start detection e.g. "1. A function f...", "21. Let A = ..."
      // Guard: Table rows e.g. "1 | ARUN | ..." or lines with pipes/tabs must NOT be matched as new questions!
      var isTableRowLine = /^\s*\|/.test(cleanLine) || (cleanLine.match(/\|/g) || []).length >= 2 || /^\+[-+]+\+$/.test(cleanLine) || (cleanLine.match(/\t/g) || []).length >= 2;
      var qMatch = !isTableRowLine ? cleanLine.match(/^(?:Q(?:uestion)?[\.\s]*)?(\d+)[\.\)\:\s\-]+(.+)/i) : null;

      if (qMatch && !qMatch[2].includes('|') && (qMatch[2].match(/\t/g) || []).length < 2) {
        var qNum = parseInt(qMatch[1], 10);

        // Sequential guard: If currentQuestion exists and question number jumps backwards, it's a sub-part inside currentQuestion
        if (currentQuestion && qNum <= currentQuestion.qNo && currentQuestion.qNo >= 2) {
          currentQuestion.text += "\n" + rawLine;
          return;
        }

        if (!currentSection) {
          currentSection = {
            name: "Questions",
            description: "General Questions",
            shuffleType: "questions",
            marksPerQ: "1",
            questions: []
          };
          paper.sections.push(currentSection);
        }
        if (currentQuestion) {
          currentSection.questions.push(currentQuestion);
        }

        var qText = qMatch[2].trim();
        var qMarks = currentSection.marksPerQ;

        // Check if marks indicator at end e.g. [1] or [2 Marks] or [2+1 Marks]
        var markMatch = qText.match(/\[(\d+(?:\+\d+)?)\s*(?:Marks?|M)?\]\s*$/i);
        if (markMatch) {
          qMarks = markMatch[1];
          qText = qText.replace(/\[\d+(?:\+\d+)?\s*(?:Marks?|M)?\]\s*$/i, '').trim();
        }

        currentQuestion = {
          qNo: qNum,
          text: qText,
          marks: qMarks,
          options: [],
          orText: null
        };
        return;
      }

      // MCQ options detection inside current question
      // Match lines like "a) -1 b) 0 c) 1 d) none" or single "a) -1"
      if (currentQuestion && /^[a-d]\)/i.test(cleanLine)) {
        var optMatches = cleanLine.matchAll(/([a-d])\)\s*([^a-d\)]+)(?=[a-d]\)|$)/gi);
        var foundAny = false;
        for (var m of optMatches) {
          foundAny = true;
          currentQuestion.options.push({
            label: m[1].toLowerCase(),
            text: m[2].trim()
          });
        }
        if (!foundAny) {
          var singleMatch = cleanLine.match(/^([a-d])\)\s*(.+)/i);
          if (singleMatch) {
            currentQuestion.options.push({
              label: singleMatch[1].toLowerCase(),
              text: singleMatch[2].trim()
            });
          }
        }
        return;
      }

      // OR separator detection
      if (currentQuestion && /^OR$/i.test(cleanLine)) {
        currentQuestion._inOr = true;
        currentQuestion.orText = "";
        return;
      }

      // Appending to OR text or question body - preserve exact rawLine for tables & markdown
      if (currentQuestion) {
        if (currentQuestion._inOr) {
          currentQuestion.orText = (currentQuestion.orText ? (currentQuestion.orText + "\n") : "") + rawLine;
        } else {
          currentQuestion.text += "\n" + rawLine;
        }
      }
    });

    if (currentQuestion && currentSection) {
      currentSection.questions.push(currentQuestion);
    }

    // Filter out sections with 0 questions (e.g. from general instruction text)
    paper.sections = paper.sections.filter(function (s) {
      return s.questions && s.questions.length > 0;
    });

    // Post-process sections: if classified as 'options' but has no MCQs, switch to 'questions'
    paper.sections.forEach(function (sec) {
      var hasOpts = (sec.questions || []).some(function (q) {
        return q.options && q.options.length > 0;
      });
      if (sec.shuffleType === 'options' && !hasOpts) {
        sec.shuffleType = 'questions';
      }
    });

    return paper;
  }

  async function handleFile(file) {
    if (!file) return;
    resultsSection.style.display = 'none';
    fileBadge.textContent = file.name + " (" + (file.size / 1024).toFixed(1) + " KB)";
    fileBadge.style.display = 'inline-flex';
    fileBadge.style.background = '#e0f2fe';
    fileBadge.style.color = '#0369a1';
    fileBadge.style.border = 'none';

    var ext = file.name.split('.').pop().toLowerCase();

    // Show loading indicator
    showParsingLoader("Extracting text from " + file.name + "...");

    try {
      var extractedText = '';
      if (ext === 'pdf') {
        extractedText = await extractPdfText(file);
      } else if (ext === 'docx' || ext === 'doc') {
        extractedText = await extractDocxText(file);
      } else {
        extractedText = await file.text();
      }

      if (!extractedText || extractedText.trim().length < 20) {
        throw new Error("Could not extract meaningful text from the file. The file might be a scanned image PDF.");
      }

      // Send to Gemini AI for intelligent parsing
      updateParsingLoader("AI is analyzing your question paper...");
      await parseWithGemini(extractedText);

    } catch (err) {
      console.error("Error processing file:", err);
      hideParsingLoader();
      alert("Error: " + err.message);
    }
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) {
      throw new Error("PDF library not loaded");
    }
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var fullText = "";
    var pdfImgCounter = Object.keys(extractedPaperImages).length + 1;

    for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      var page = await pdf.getPage(pageNum);
      var content = await page.getTextContent();
      var lastY = null;
      var lastX = null;
      var pageText = "";

      content.items.forEach(function (item) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 9) {
          pageText += "\n";
          lastX = null;
        } else if (lastY !== null) {
          var deltaX = (lastX !== null) ? (item.transform[4] - lastX) : 0;
          if (deltaX > 20) {
            pageText += "\t";
          } else if (deltaX > 2) {
            pageText += " ";
          }
        }
        pageText += item.str;
        lastY = item.transform[5];
        lastX = item.transform[4] + (item.width || (item.str.length * 6));
      });

      // 1. Offscreen render ensures all embedded images are decoded and settled by PDF.js worker
      try {
        var viewport = page.getViewport({ scale: 1.0 });
        var renderCanvas = document.createElement('canvas');
        renderCanvas.width = Math.min(viewport.width, 1200);
        renderCanvas.height = Math.min(viewport.height, 1600);
        var renderCtx = renderCanvas.getContext('2d');
        await page.render({ canvasContext: renderCtx, viewport: viewport }).promise;
      } catch (rErr) {
        console.warn("[PDF Render]", rErr);
      }

      // 2. Scan operator list for embedded PDF images
      try {
        var opList = await page.getOperatorList();
        for (var i = 0; i < opList.fnArray.length; i++) {
          var fn = opList.fnArray[i];
          if (window.pdfjsLib.OPS && (fn === window.pdfjsLib.OPS.paintImageXObject || fn === window.pdfjsLib.OPS.paintInlineImageXObject)) {
            var imgName = opList.argsArray[i] && opList.argsArray[i][0];
            if (imgName && page.objs) {
              var imgObj = null;
              if (page.objs.has && page.objs.has(imgName)) {
                imgObj = page.objs.get(imgName);
              } else {
                imgObj = await new Promise(function (res) {
                  try {
                    page.objs.get(imgName, function (obj) { res(obj); });
                  } catch (e) {
                    res(null);
                  }
                });
              }

              if (imgObj) {
                var w = imgObj.width || (imgObj.bitmap ? imgObj.bitmap.width : 0);
                var h = imgObj.height || (imgObj.bitmap ? imgObj.bitmap.height : 0);
                if (w >= 35 && h >= 35) {
                  var canvas = document.createElement('canvas');
                  canvas.width = w;
                  canvas.height = h;
                  var ctx = canvas.getContext('2d');
                  if (imgObj.bitmap) {
                    ctx.drawImage(imgObj.bitmap, 0, 0);
                  } else if (imgObj.data) {
                    var imgData = ctx.createImageData(w, h);
                    var srcData = imgObj.data;
                    var totalPx = w * h;
                    if (srcData.length === totalPx * 3) {
                      for (var p = 0; p < totalPx; p++) {
                        imgData.data[p * 4] = srcData[p * 3];
                        imgData.data[p * 4 + 1] = srcData[p * 3 + 1];
                        imgData.data[p * 4 + 2] = srcData[p * 3 + 2];
                        imgData.data[p * 4 + 3] = 255;
                      }
                    } else if (srcData.length === totalPx * 4) {
                      imgData.data.set(srcData);
                    }
                    ctx.putImageData(imgData, 0, 0);
                  }
                  var dataUri = canvas.toDataURL('image/png');
                  if (dataUri && dataUri.length > 250) {
                    var token = '[IMAGE_' + pdfImgCounter + ']';
                    extractedPaperImages[token] = dataUri;
                    extractedPaperImages['IMAGE_' + pdfImgCounter] = dataUri;
                    pdfImgCounter++;
                    pageText += '\n\n' + token + '\n\n';
                  }
                }
              }
            }
          }
        }
      } catch (pdfImgErr) {
        console.warn("[PDF Parser] Image notice:", pdfImgErr);
      }

      fullText += pageText + "\n\n";
    }

    return fullText;
  }

  // ==========================================
  // High-Fidelity DOCX & OMML Math Extraction
  // ==========================================

  function getVal(elem, attrName) {
    if (!elem || !elem.attributes) return null;
    attrName = attrName || 'val';
    for (var i = 0; i < elem.attributes.length; i++) {
      var attr = elem.attributes[i];
      if (attr.localName === attrName || attr.name === attrName || attr.name.endsWith(':' + attrName)) {
        return attr.value;
      }
    }
    return null;
  }

  function findChild(elem, localName) {
    if (!elem || !elem.childNodes) return null;
    for (var i = 0; i < elem.childNodes.length; i++) {
      var child = elem.childNodes[i];
      if (child.nodeType === 1 && child.localName === localName) {
        return child;
      }
    }
    return null;
  }

  function findChildren(elem, localName) {
    var res = [];
    if (!elem || !elem.childNodes) return res;
    for (var i = 0; i < elem.childNodes.length; i++) {
      var child = elem.childNodes[i];
      if (child.nodeType === 1 && (!localName || child.localName === localName)) {
        res.push(child);
      }
    }
    return res;
  }

  function ommlToLatex(elem) {
    if (!elem) return '';
    var tag = elem.localName;

    if (tag === 'oMath' || tag === 'oMathPara') {
      var str = '';
      for (var i = 0; i < elem.childNodes.length; i++) {
        if (elem.childNodes[i].nodeType === 1) {
          str += ommlToLatex(elem.childNodes[i]);
        }
      }
      return str.trim();
    }

    if (tag === 'r') {
      var text = '';
      for (var i = 0; i < elem.childNodes.length; i++) {
        var c = elem.childNodes[i];
        if (c.nodeType === 1 && c.localName === 't') {
          var t = c.textContent || '';
          t = t.replace(/\u2260/g, ' \\neq ')
               .replace(/\u2264/g, ' \\leq ')
               .replace(/\u2265/g, ' \\geq ')
               .replace(/\u00b1/g, ' \\pm ')
               .replace(/\u00d7/g, ' \\times ')
               .replace(/\u00f7/g, ' \\div ')
               .replace(/\u2192/g, ' \\to ')
               .replace(/\u221e/g, ' \\infty ');
          text += t;
        }
      }
      return text;
    }

    if (tag === 'f') {
      var numElem = findChild(elem, 'num');
      var denElem = findChild(elem, 'den');
      var numStr = numElem ? ommlToLatex(numElem) : '';
      var denStr = denElem ? ommlToLatex(denElem) : '';
      return '\\frac{' + numStr + '}{' + denStr + '}';
    }

    if (tag === 'num' || tag === 'den' || tag === 'e') {
      var parts = '';
      for (var i = 0; i < elem.childNodes.length; i++) {
        if (elem.childNodes[i].nodeType === 1) {
          parts += ommlToLatex(elem.childNodes[i]);
        }
      }
      return parts;
    }

    if (tag === 'sSup') {
      var baseElem = findChild(elem, 'e');
      var supElem = findChild(elem, 'sup');
      var bStr = baseElem ? ommlToLatex(baseElem) : '';
      var sStr = supElem ? ommlToLatex(supElem) : '';
      return bStr + '^{' + sStr + '}';
    }

    if (tag === 'sSub') {
      var baseElem = findChild(elem, 'e');
      var subElem = findChild(elem, 'sub');
      var bStr = baseElem ? ommlToLatex(baseElem) : '';
      var subStr = subElem ? ommlToLatex(subElem) : '';
      return bStr + '_{' + subStr + '}';
    }

    if (tag === 'sSubSup') {
      var baseElem = findChild(elem, 'e');
      var subElem = findChild(elem, 'sub');
      var supElem = findChild(elem, 'sup');
      var bStr = baseElem ? ommlToLatex(baseElem) : '';
      var subStr = subElem ? ommlToLatex(subElem) : '';
      var supStr = supElem ? ommlToLatex(supElem) : '';
      return bStr + '_{' + subStr + '}^{' + supStr + '}';
    }

    if (tag === 'rad') {
      var degElem = findChild(elem, 'deg');
      var baseElem = findChild(elem, 'e');
      var bStr = baseElem ? ommlToLatex(baseElem) : '';
      var radPr = findChild(elem, 'radPr');
      var degHide = radPr ? findChild(radPr, 'degHide') : null;
      var isHidden = degHide && (getVal(degHide) === 'on' || getVal(degHide) === '1');
      if (degElem && !isHidden && (degElem.textContent || '').trim()) {
        return '\\sqrt[' + ommlToLatex(degElem) + ']{' + bStr + '}';
      }
      return '\\sqrt{' + bStr + '}';
    }

    if (tag === 'nary') {
      var naryPr = findChild(elem, 'naryPr');
      var chrElem = naryPr ? findChild(naryPr, 'chr') : null;
      var opChar = chrElem ? (getVal(chrElem) || '∫') : '∫';
      var latexOp = '\\int';
      if (opChar === '∫') latexOp = '\\int';
      else if (opChar === '∑') latexOp = '\\sum';
      else if (opChar === '∏') latexOp = '\\prod';
      else latexOp = opChar;

      var subHide = naryPr ? findChild(naryPr, 'subHide') : null;
      var supHide = naryPr ? findChild(naryPr, 'supHide') : null;
      var subHidden = subHide && (getVal(subHide) === 'on' || getVal(subHide) === '1');
      var supHidden = supHide && (getVal(supHide) === 'on' || getVal(supHide) === '1');

      var limits = '';
      if (!subHidden) {
        var subElem = findChild(elem, 'sub');
        var subTxt = subElem ? ommlToLatex(subElem) : '';
        if (subTxt.trim()) limits += '_{' + subTxt + '}';
      }
      if (!supHidden) {
        var supElem = findChild(elem, 'sup');
        var supTxt = supElem ? ommlToLatex(supElem) : '';
        if (supTxt.trim()) limits += '^{' + supTxt + '}';
      }
      var baseElem = findChild(elem, 'e');
      var bStr = baseElem ? ommlToLatex(baseElem) : '';
      return latexOp + limits + ' ' + bStr;
    }

    if (tag === 'd') {
      var dPr = findChild(elem, 'dPr');
      var begElem = dPr ? findChild(dPr, 'begChr') : null;
      var endElem = dPr ? findChild(dPr, 'endChr') : null;
      var beg = begElem ? (getVal(begElem) || '(') : '(';
      var end = endElem ? (getVal(endElem) || ')') : ')';

      var eElems = findChildren(elem, 'e');
      var innerParts = [];
      for (var i = 0; i < eElems.length; i++) {
        innerParts.push(ommlToLatex(eElems[i]));
      }
      var inner = innerParts.join(', ');
      if (beg === '|' && end === '|') return '|' + inner + '|';
      if (beg === '(' && end === ')') return '(' + inner + ')';
      if (beg === '[' && end === ']') return '[' + inner + ']';
      if (beg === '{' && end === '}') return '\\{' + inner + '\\}';
      return beg + inner + end;
    }

    if (tag === 'bar') {
      var baseElem = findChild(elem, 'e');
      return '\\bar{' + (baseElem ? ommlToLatex(baseElem) : '') + '}';
    }

    if (tag === 'box') {
      var str = '';
      for (var i = 0; i < elem.childNodes.length; i++) {
        if (elem.childNodes[i].nodeType === 1) str += ommlToLatex(elem.childNodes[i]);
      }
      return str;
    }

    if (['ctrlPr', 'fPr', 'sSupPr', 'sSubPr', 'naryPr', 'dPr', 'radPr', 'pPr', 'rPr'].indexOf(tag) !== -1) {
      return '';
    }
    var res = '';
    for (var i = 0; i < elem.childNodes.length; i++) {
      if (elem.childNodes[i].nodeType === 1) {
        res += ommlToLatex(elem.childNodes[i]);
      }
    }
    return res;
  }

  var xmlDocxImgCounter = 1;

  function parseWordParagraph(p) {
    var parts = [];
    for (var i = 0; i < p.childNodes.length; i++) {
      var child = p.childNodes[i];
      if (child.nodeType !== 1) continue;
      var tag = child.localName;

      if (tag === 'r') {
        for (var j = 0; j < child.childNodes.length; j++) {
          var c = child.childNodes[j];
          if (c.nodeType !== 1) continue;
          if (c.localName === 't') {
            parts.push(c.textContent || '');
          } else if (c.localName === 'tab') {
            parts.push('    ');
          } else if (c.localName === 'br') {
            parts.push('\n');
          } else if (c.localName === 'drawing' || c.localName === 'pict') {
            parts.push(' [IMAGE_' + (xmlDocxImgCounter++) + '] ');
          }
        }
      } else if (tag === 'drawing' || tag === 'pict') {
        parts.push(' [IMAGE_' + (xmlDocxImgCounter++) + '] ');
      } else if (tag === 'oMath' || tag === 'oMathPara') {
        var mathStr = ommlToLatex(child);
        if (mathStr && mathStr.trim()) {
          parts.push(' $' + mathStr.trim() + '$ ');
        }
      } else if (tag === 'hyperlink') {
        var runs = findChildren(child, 'r');
        for (var r = 0; r < runs.length; r++) {
          var tElem = findChild(runs[r], 't');
          if (tElem) parts.push(tElem.textContent || '');
        }
      }
    }
    return parts.join('').trim();
  }

  function parseWordTable(tbl) {
    var rows = findChildren(tbl, 'tr');
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = findChildren(rows[r], 'tc');
      var rowVals = [];
      for (var c = 0; c < cells.length; c++) {
        var ps = findChildren(cells[c], 'p');
        var cellTexts = [];
        for (var p = 0; p < ps.length; p++) {
          var pt = parseWordParagraph(ps[p]);
          if (pt) cellTexts.push(pt);
        }
        rowVals.push(cellTexts.join(' ').replace(/\|/g, '/'));
      }
      lines.push('| ' + rowVals.join(' | ') + ' |');
      if (r === 0) {
        var sep = rowVals.map(function() { return '---'; });
        lines.push('| ' + sep.join(' | ') + ' |');
      }
    }
    return lines.join('\n');
  }

  function parseDocxDocumentXml(xmlString) {
    if (!xmlString || typeof DOMParser === 'undefined') return null;
    xmlDocxImgCounter = 1;
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlString, 'application/xml');
    var all = doc.getElementsByTagName('*');
    var body = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].localName === 'body') { body = all[i]; break; }
    }
    if (!body) return null;

    var lines = [];
    for (var i = 0; i < body.childNodes.length; i++) {
      var child = body.childNodes[i];
      if (child.nodeType !== 1) continue;
      var tag = child.localName;

      if (tag === 'p') {
        var pText = parseWordParagraph(child);
        if (pText) lines.push(pText);
      } else if (tag === 'tbl') {
        var tblText = parseWordTable(child);
        if (tblText) {
          lines.push(tblText);
          lines.push('');
        }
      } else if (tag === 'sdt') {
        var sdtContent = findChild(child, 'sdtContent');
        if (sdtContent) {
          for (var j = 0; j < sdtContent.childNodes.length; j++) {
            var sc = sdtContent.childNodes[j];
            if (sc.nodeType !== 1) continue;
            if (sc.localName === 'p') {
              var pt = parseWordParagraph(sc);
              if (pt) lines.push(pt);
            } else if (sc.localName === 'tbl') {
              var tt = parseWordTable(sc);
              if (tt) { lines.push(tt); lines.push(''); }
            }
          }
        }
      }
    }
    return lines.join('\n');
  }

  async function extractDocxXml(arrayBuffer) {
    try {
      var bytes = new Uint8Array(arrayBuffer);
      var view = new DataView(arrayBuffer);

      // Find End of Central Directory Record (EOCD)
      var eocdOffset = -1;
      var maxSearch = Math.min(bytes.length, 65557);
      for (var i = bytes.length - 22; i >= bytes.length - maxSearch; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
          eocdOffset = i;
          break;
        }
      }

      var decoder = new TextDecoder('utf-8');

      if (eocdOffset !== -1) {
        var totalEntries = view.getUint16(eocdOffset + 10, true);
        var cdOffset = view.getUint32(eocdOffset + 16, true);
        var cdCur = cdOffset;

        for (var e = 0; e < totalEntries; e++) {
          if (cdCur + 46 > bytes.length || view.getUint32(cdCur, true) !== 0x02014b50) break;
          var compMethod = view.getUint16(cdCur + 10, true);
          var compSize = view.getUint32(cdCur + 20, true);
          var nameLen = view.getUint16(cdCur + 28, true);
          var extraLen = view.getUint16(cdCur + 30, true);
          var commentLen = view.getUint16(cdCur + 32, true);
          var localHdrOffset = view.getUint32(cdCur + 42, true);

          var nameBytes = bytes.subarray(cdCur + 46, cdCur + 46 + nameLen);
          var name = decoder.decode(nameBytes);

          if (name === 'word/document.xml') {
            var localNameLen = view.getUint16(localHdrOffset + 26, true);
            var localExtraLen = view.getUint16(localHdrOffset + 28, true);
            var dataStart = localHdrOffset + 30 + localNameLen + localExtraLen;
            var compData = bytes.subarray(dataStart, dataStart + compSize);

            if (compMethod === 0) {
              return decoder.decode(compData);
            } else if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
              var ds = new DecompressionStream('deflate-raw');
              var writer = ds.writable.getWriter();
              writer.write(compData);
              writer.close();
              var res = new Response(ds.readable);
              var decompBuf = await res.arrayBuffer();
              return decoder.decode(decompBuf);
            }
          }
          cdCur += 46 + nameLen + extraLen + commentLen;
        }
      }

      // Fallback: scan local file headers directly
      var offset = 0;
      while (offset < bytes.length - 30) {
        if (view.getUint32(offset, true) === 0x04034b50) {
          var compMethodL = view.getUint16(offset + 8, true);
          var compSizeL = view.getUint32(offset + 18, true);
          var nameLenL = view.getUint16(offset + 26, true);
          var extraLenL = view.getUint16(offset + 28, true);
          var nameL = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLenL));
          var dataStartL = offset + 30 + nameLenL + extraLenL;

          if (nameL === 'word/document.xml' && compSizeL > 0) {
            var compDataL = bytes.subarray(dataStartL, dataStartL + compSizeL);
            if (compMethodL === 0) {
              return decoder.decode(compDataL);
            } else if (compMethodL === 8 && typeof DecompressionStream !== 'undefined') {
              var dsL = new DecompressionStream('deflate-raw');
              var writerL = dsL.writable.getWriter();
              writerL.write(compDataL);
              writerL.close();
              var resL = new Response(dsL.readable);
              var decompBufL = await resL.arrayBuffer();
              return decoder.decode(decompBufL);
            }
          }
          offset = dataStartL + compSizeL;
        } else {
          offset++;
        }
      }
    } catch (err) {
      console.warn("[DOCX Parser] Native zip extraction notice:", err);
    }
    return null;
  }

  async function extractDocxText(file) {
    var arrayBuffer = await file.arrayBuffer();
    extractedPaperImages = {};
    var imgCounter = 1;

    // 1. Convert with Mammoth using dataUri to extract embedded images & diagrams
    if (window.mammoth) {
      try {
        var options = {
          convertImage: window.mammoth.images.dataUri
        };
        var htmlResult = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
        var html = (htmlResult && htmlResult.value) ? htmlResult.value : '';

        if (html) {
          // Intercept embedded images and assign tokens [IMAGE_1], [IMAGE_2]
          html = html.replace(/<img\b[^>]*?\bsrc=["'](data:image\/[^"']+)["'][^>]*>/gi, function (match, dataUri) {
            var token = '[IMAGE_' + imgCounter + ']';
            extractedPaperImages[token] = dataUri;
            extractedPaperImages['IMAGE_' + imgCounter] = dataUri;
            imgCounter++;
            return '\n\n' + token + '\n\n';
          });

          // Convert HTML tables into clean Markdown tables
          var markdownText = convertHtmlToCleanText(html);

          if (markdownText && markdownText.trim().length >= 30) {
            return markdownText;
          }
        }
      } catch (mammothErr) {
        console.warn("[DOCX Parser] Mammoth notice:", mammothErr);
      }
    }

    // 2. High-fidelity native XML extraction fallback
    try {
      var xmlString = await extractDocxXml(arrayBuffer);
      if (xmlString) {
        var extractedFromXml = parseDocxDocumentXml(xmlString);
        if (extractedFromXml && extractedFromXml.trim().length >= 30) {
          console.log("[DOCX Parser] Extracted high-fidelity text with OMML math formulas (" + extractedFromXml.length + " chars)");
          return extractedFromXml;
        }
      }
    } catch (xmlErr) {
      console.warn("[DOCX Parser] Native XML parser notice:", xmlErr);
    }

    // 3. Fallback to raw text
    if (window.mammoth) {
      var fallback = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return fallback.value;
    }

    throw new Error("Could not parse DOCX document.");
  }

  function updateUploadSuccessBadge(paper) {
    var totalQ = 0;
    if (paper.sections) {
      paper.sections.forEach(function (s) {
        totalQ += (s.questions ? s.questions.length : 0);
      });
    }
    var title = paper.examTitle || paper.subject || 'Question Paper';
    fileBadge.innerHTML = '&#10003; <strong>' + escapeHtml(title) + '</strong> (' + (paper.sections ? paper.sections.length : 0) + ' sections, ' + totalQ + ' questions ready) &mdash; Click &ldquo;Generate Sets&rdquo; below';
    fileBadge.style.display = 'inline-flex';
    fileBadge.style.background = '#ecfdf5';
    fileBadge.style.color = '#065f46';
    fileBadge.style.border = '1px solid #6ee7b7';
  }

  function linkImagesToQuestions(paper) {
    if (!paper || !paper.sections) return;
    var images = paper.images || extractedPaperImages || {};
    // Filter out EMF format (school logos) because browsers cannot render image/x-emf
    var imageKeys = Object.keys(images).filter(function (k) {
      return !k.startsWith('[') && !String(images[k] || '').startsWith('data:image/x-emf');
    });
    var usedImages = {};

    // 1st Pass: Match exact tokens e.g. [IMAGE_1], [IMAGE_2] in text/orText
    paper.sections.forEach(function (sec) {
      if (!sec.questions) return;
      sec.questions.forEach(function (q) {
        var text = (q.text || '') + ' ' + (q.orText || '');
        var m = text.match(/\[(?:IMAGE|IMG|FIGURE)_?(\d+)\]/i);
        if (m) {
          var token = m[0];
          var key1 = token;
          var key2 = 'IMAGE_' + m[1];
          var imgUri = images[key1] || images[key2];
          if (imgUri && !String(imgUri).startsWith('data:image/x-emf')) {
            q.image = imgUri;
            usedImages[key2] = true;
          }
        }
      });
    });

    // 2nd Pass: If there are unlinked extracted images, automatically match questions referencing diagrams/figures
    var unlinked = imageKeys.filter(function (k) { return !usedImages[k]; });
    if (unlinked.length > 0) {
      var unlinkedIdx = 0;
      paper.sections.forEach(function (sec) {
        if (!sec.questions || unlinkedIdx >= unlinked.length) return;
        sec.questions.forEach(function (q) {
          if (unlinkedIdx >= unlinked.length) return;
          if (q.image) return; // already has image
          var t = ((q.text || '') + ' ' + (q.orText || '')).toLowerCase();
          if (/diagram|circuit|figure|graph|plot|truth table|image|shown below|refer to the/i.test(t)) {
            var k = unlinked[unlinkedIdx++];
            q.image = images[k];
            if (q.text.indexOf('[IMAGE_') === -1) {
              q.text += '\n\n[' + k + ']\n';
            }
          }
        });
      });
    }
  }

  async function parseWithGemini(text) {
    try {
      var reqHeaders = { 'Content-Type': 'application/json' };
      if (teacherToken) {
        reqHeaders['Authorization'] = 'Bearer ' + teacherToken;
      }
      var response = await fetch('/api/parse-paper', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ text: text })
      });

      var data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI parsing failed (status ' + response.status + ')');
      }

      if (data.ok && data.paper) {
        data.paper.images = Object.assign({}, extractedPaperImages);
        linkImagesToQuestions(data.paper);
        parsedPaper = data.paper;
        hideParsingLoader();
        resultsSection.style.display = 'none';
        updateUploadSuccessBadge(data.paper);
        return;
      }

      throw new Error('Unexpected response from AI parser.');

    } catch (err) {
      console.warn("AI parse error, trying local parser fallback:", err);
      updateParsingLoader("Falling back to local parser...");
      
      var paper = parsePaperFromText(text);
      hideParsingLoader();

      var hasQuestions = paper && paper.sections && paper.sections.some(function(s) {
        return s.questions && s.questions.length > 0;
      });

      if (hasQuestions) {
        paper.images = Object.assign({}, extractedPaperImages);
        linkImagesToQuestions(paper);
        parsedPaper = paper;
        resultsSection.style.display = 'none';
        updateUploadSuccessBadge(paper);
      } else {
        alert("Could not parse the question paper.\n\nDetails: " + (err.message || 'Unknown error') + "\n\nPlease ensure the paper text is readable and contains clearly numbered questions.");
      }
    }
  }

  /* ── Parsing Loader UI ── */
  function showParsingLoader(msg) {
    var existing = document.getElementById('parsingLoader');
    if (existing) existing.remove();

    var loader = document.createElement('div');
    loader.id = 'parsingLoader';
    loader.className = 'ps-parsing-loader';
    loader.innerHTML = '<div class="ps-loader-spinner"></div><div class="ps-loader-text">' + (msg || 'Processing...') + '</div>';
    
    var controlPanel = document.querySelector('.ps-control-panel');
    if (controlPanel && controlPanel.parentNode) {
      controlPanel.parentNode.insertBefore(loader, controlPanel.nextSibling);
    }
  }

  function updateParsingLoader(msg) {
    var loaderText = document.querySelector('#parsingLoader .ps-loader-text');
    if (loaderText) loaderText.textContent = msg;
  }

  function hideParsingLoader() {
    var existing = document.getElementById('parsingLoader');
    if (existing) existing.remove();
  }

  /* ── UI Rendering ── */
  function renderAll() {
    if (!parsedPaper) return;
    numSets = parseInt(setsSelect.value, 10) || 3;
    generatedSets = generateSetsFromPaper(parsedPaper, numSets);

    resultsSection.style.display = 'block';
    renderTabs();
    renderCurrentTab();
  }

  function renderTabs() {
    tabsList.innerHTML = "";
    generatedSets.forEach(function (set, idx) {
      var btn = document.createElement('button');
      btn.className = 'ps-tab' + (idx === currentActiveTab ? ' active' : '');
      btn.innerHTML = '<span>' + set.setName + '</span>' + (idx === 0 ? ' <span class="ps-tab-badge">Original</span>' : '');
      btn.addEventListener('click', function () {
        currentActiveTab = idx;
        renderTabs();
        renderCurrentTab();
      });
      tabsList.appendChild(btn);
    });

    // Shuffling Matrix Tab
    var matrixBtn = document.createElement('button');
    matrixBtn.className = 'ps-tab' + (currentActiveTab === -1 ? ' active' : '');
    matrixBtn.innerHTML = '<span>Teacher Shuffling Matrix</span> <span class="ps-tab-badge" style="background:#fef3c7;color:#92400e;">Answer Key</span>';
    matrixBtn.addEventListener('click', function () {
      currentActiveTab = -1;
      renderTabs();
      renderCurrentTab();
    });
    tabsList.appendChild(matrixBtn);
  }

  function renderCurrentTab() {
    if (currentActiveTab === -1) {
      paperPreview.style.display = 'none';
      matrixPreview.style.display = 'block';
      renderMatrix();
    } else {
      paperPreview.style.display = 'block';
      matrixPreview.style.display = 'none';
      var set = generatedSets[currentActiveTab];
      renderExamPaper(set);
    }
  }

  function renderExamPaper(set) {
    var html = '';
    html += '<div class="exam-paper-outer-border">';

    // Header
    html += '  <div class="exam-header">';
    if (set.schoolName) {
      html += '    <img src="/logo.jpg" alt="Logo" class="exam-crest-img" onerror="this.style.display=\'none\'" />';
      html += '    <div class="exam-school-name">' + escapeHtml(set.schoolName) + '</div>';
    }
    if (set.examTitle) {
      html += '    <div class="exam-title-row">' + escapeHtml(set.examTitle) + '</div>';
    }
    var hasMeta = set.grade || set.subject || set.date || set.marks || set.duration;
    if (hasMeta) {
      html += '    <div class="exam-meta-grid">';
      html += '      <div class="exam-meta-col-left">';
      html += '        <div>Name : __________________________________</div>';
      if (set.grade) html += '        <div style="margin-top:4px;">Grade : ' + escapeHtml(set.grade) + '</div>';
      if (set.subject) html += '        <div style="margin-top:4px;">Subject : ' + escapeHtml(set.subject) + '</div>';
      html += '      </div>';
      html += '      <div class="exam-meta-col-right">';
      if (set.date) html += '        <div>Date : ' + escapeHtml(set.date) + '</div>';
      if (set.marks) html += '        <div style="margin-top:4px;">Marks : ' + escapeHtml(set.marks) + '</div>';
      if (set.duration) html += '        <div style="margin-top:4px;">Duration : ' + escapeHtml(set.duration) + '</div>';
      html += '      </div>';
      html += '    </div>';
    }
    html += '  </div>';

    // Instructions
    if (set.instructions && set.instructions.length > 0) {
      html += '<div class="exam-instructions-box">';
      html += '  <strong>General Instructions:</strong>';
      html += '  <ol>';
      set.instructions.forEach(function (inst) {
        html += '<li>' + escapeHtml(inst) + '</li>';
      });
      html += '  </ol>';
      html += '</div>';
    }

    // Sections & Questions
    set.sections.forEach(function (sec) {
      html += '<table class="exam-table">';
      html += '  <thead>';
      html += '    <tr><th colspan="3" class="exam-section-header-cell">' + escapeHtml(sec.name) + '</th></tr>';
      html += '  </thead>';
      html += '  <tbody>';

      sec.questions.forEach(function (q) {
        html += '  <tr>';
        html += '    <td class="exam-qno-col">' + q.qNo + '</td>';
        html += '    <td class="exam-qbody-col">';
        html += '      <div>' + formatQuestionContent(q.text, false, set.images) + '</div>';

        // Direct question diagram (if q.image is attached and not already inside q.text)
        var textHasImg = /\[(?:IMAGE|IMG|FIGURE)_?\d+\]/i.test(q.text || '');
        if (q.image && !textHasImg) {
          html += '    <div class="exam-q-img-box">';
          html += '      <img src="' + q.image + '" class="exam-question-img" alt="Diagram for Question ' + q.qNo + '" />';
          html += '      <div class="no-print" style="margin-top:6px; display:flex; gap:8px; justify-content:center;">';
          html += '        <label class="exam-img-attach-btn" title="Replace this diagram">';
          html += '          <input type="file" accept="image/*" class="exam-img-input" data-qno="' + q.qNo + '" data-origqno="' + (q.originalQNo || q.qNo) + '" style="display:none;" />';
          html += '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
          html += '          <span>Replace Diagram</span>';
          html += '        </label>';
          html += '        <button type="button" class="exam-img-attach-btn exam-img-remove-btn" data-qno="' + q.qNo + '" data-origqno="' + (q.originalQNo || q.qNo) + '" style="color:#dc2626;border-color:#fecaca;" title="Remove diagram">';
          html += '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          html += '          <span>Remove</span>';
          html += '        </button>';
          html += '      </div>';
          html += '    </div>';
        } else if (!q.image && !textHasImg) {
          html += '    <div class="no-print" style="margin-top:6px;">';
          html += '      <label class="exam-img-attach-btn" title="Attach a diagram or figure to Question ' + q.qNo + '">';
          html += '        <input type="file" accept="image/*" class="exam-img-input" data-qno="' + q.qNo + '" data-origqno="' + (q.originalQNo || q.qNo) + '" style="display:none;" />';
          html += '        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
          html += '        <span>Attach Diagram</span>';
          html += '      </label>';
          html += '    </div>';
        }

        // Options for Section A
        if (q.options && q.options.length > 0) {
          html += '    <div class="exam-options-grid">';
          q.options.forEach(function (opt, optIdx) {
            var lbl = (opt && opt.label) ? opt.label : String.fromCharCode(97 + optIdx);
            var txt = (typeof opt === 'string') ? opt : (opt ? (opt.text !== undefined ? opt.text : (opt.option || opt.value || '')) : '');
            html += '    <div class="exam-option-item"><strong>' + escapeHtml(lbl) + ')</strong> ' + formatQuestionContent(txt, false, set.images) + '</div>';
          });
          html += '    </div>';
        }

        // Internal choice (OR)
        if (q.orText) {
          html += '    <div class="exam-or-divider">OR</div>';
          html += '    <div>' + formatQuestionContent(q.orText, false, set.images) + '</div>';
        }

        html += '    </td>';
        html += '    <td class="exam-marks-col">[' + (q.marks || '1') + ']</td>';
        html += '  </tr>';
      });

      html += '  </tbody>';
      html += '</table>';
    });

    html += '</div>'; // outer border
    paperPreview.innerHTML = html;

    // Render KaTeX math equations if KaTeX is available
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(paperPreview, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (err) {
        console.warn('KaTeX auto-render note:', err);
      }
    }
  }

  function renderMatrix() {
    var html = '';
    html += '<div class="matrix-container">';
    html += '  <div class="matrix-header">';
    html += '    <h3>Master Question & Option Shuffling Matrix</h3>';
    html += '    <p>Use this reference table to evaluate answer sheets across all generated sets.</p>';
    html += '  </div>';

    // Iterate through ALL sections dynamically
    var origSet = generatedSets[0];
    if (!origSet) { matrixPreview.innerHTML = '<p>No data available.</p>'; return; }

    origSet.sections.forEach(function (sec) {
      var hasOptions = (sec.questions || []).some(function (q) {
        return q.options && q.options.length > 0;
      });

      var behavior = sec.shuffleType || 'none';
      if (behavior === 'options' && !hasOptions) {
        behavior = 'questions';
      } else if (behavior === 'none' && !sec.shuffleType) {
        if (hasOptions) behavior = 'options';
        else if (sec.questions && sec.questions.length > 1) behavior = 'questions';
      }

      if (behavior === 'options') {
        // Option mapping table for MCQ sections
        html += '  <h4 style="margin:20px 0 8px;color:#1e293b;">' + escapeHtml(sec.name) + ': Option Mapping per Question</h4>';
        html += '  <table class="matrix-table">';
        html += '    <thead><tr><th>Question</th><th>Set A (Original)</th>';
        for (var si = 1; si < generatedSets.length; si++) {
          html += '<th>' + generatedSets[si].setName + ' Mapping (New &larr; Orig)</th>';
        }
        html += '    </tr></thead><tbody>';

        sec.questions.forEach(function (q) {
          html += '<tr>';
          html += '  <td><strong>Q' + q.qNo + '</strong></td>';
          var labels = (q.options || []).map(function (o, oi) {
            return (o && o.label) ? o.label : String.fromCharCode(97 + oi);
          }).join(', ') || 'a, b, c, d';
          html += '  <td><span class="matrix-badge-orig">' + labels + '</span></td>';
          for (var si2 = 1; si2 < generatedSets.length; si2++) {
            var mapSrc = generatedSets[si2].mapping;
            // Try new format first, then legacy
            var map = (mapSrc.optionSections && mapSrc.optionSections[sec.name] && mapSrc.optionSections[sec.name][q.qNo]) ||
                      (mapSrc.sectionA && mapSrc.sectionA[q.qNo]) || {};
            var mapStr = Object.keys(map).map(function (k) { return '<strong>' + k + '</strong>&rarr;' + map[k]; }).join(', ');
            html += '<td><span class="matrix-badge-mapped">' + (mapStr || '—') + '</span></td>';
          }
          html += '</tr>';
        });

        html += '  </tbody></table>';

      } else if (behavior === 'questions') {
        // Question order mapping table
        html += '  <h4 style="margin:24px 0 8px;color:#1e293b;">' + escapeHtml(sec.name) + ': Question Order Mapping</h4>';
        html += '  <table class="matrix-table">';
        html += '    <thead><tr><th>Question in Set A</th>';
        for (var sj = 1; sj < generatedSets.length; sj++) {
          html += '<th>Question in ' + generatedSets[sj].setName + '</th>';
        }
        html += '    </tr></thead><tbody>';

        sec.questions.forEach(function (q) {
          html += '<tr>';
          var preview = q.text ? q.text.slice(0, 45) : '';
          html += '  <td><strong>Q' + q.qNo + '</strong> (' + escapeHtml(preview) + '...)</td>';
          for (var sj2 = 1; sj2 < generatedSets.length; sj2++) {
            var mapSrc2 = generatedSets[sj2].mapping;
            // Try new format first, then legacy
            var qMap = (mapSrc2.questionSections && mapSrc2.questionSections[sec.name]) ||
                       (sec.name.indexOf("Section B") >= 0 && mapSrc2.sectionB) ||
                       (sec.name.indexOf("Section C") >= 0 && mapSrc2.sectionC) || {};
            var targetQ = null;
            for (var nQ in qMap) {
              if (qMap[nQ] === q.qNo) { targetQ = nQ; break; }
            }
            html += '<td><span class="matrix-badge-mapped">Q' + (targetQ || q.qNo) + '</span></td>';
          }
          html += '</tr>';
        });

        html += '  </tbody></table>';
      }
      // 'none' sections don't need a mapping table
    });

    html += '</div>';
    matrixPreview.innerHTML = html;
  }

  /* ── Export & Print ── */
  function printCurrentSet() {
    window.print();
  }

  function downloadSetAsWord(set) {
    var content = buildWordHtml(set);
    var blob = new Blob(['\ufeff' + content], { type: 'application/msword;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (set.schoolName + '_' + set.examTitle).replace(/[^a-zA-Z0-9_-]/g, '_') + '.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadAllSets() {
    generatedSets.forEach(function (set, i) {
      setTimeout(function () {
        downloadSetAsWord(set);
      }, i * 350);
    });
  }

  function buildWordHtml(set) {
    var bodyHtml = '';
    bodyHtml += '<div style="font-family:\'Times New Roman\', Times, serif; font-size:12pt; margin:20px;">';
    bodyHtml += '  <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">';
    bodyHtml += '    <h2 style="margin:0 0 4px 0; font-size:16pt;">' + escapeHtml(set.schoolName) + '</h2>';
    bodyHtml += '    <h3 style="margin:0 0 8px 0; font-size:13pt;">' + escapeHtml(set.examTitle) + '</h3>';
    bodyHtml += '    <table style="width:100%; border:none; font-weight:bold; font-size:11pt;">';
    bodyHtml += '      <tr><td>Name: ______________________</td><td style="text-align:right;">Date: ' + escapeHtml(set.date) + '</td></tr>';
    bodyHtml += '      <tr><td>Grade: ' + escapeHtml(set.grade) + '</td><td style="text-align:right;">Marks: ' + escapeHtml(set.marks) + '</td></tr>';
    bodyHtml += '      <tr><td>Subject: ' + escapeHtml(set.subject) + '</td><td style="text-align:right;">Duration: ' + escapeHtml(set.duration) + '</td></tr>';
    bodyHtml += '    </table>';
    bodyHtml += '  </div>';

    if (set.instructions && set.instructions.length > 0) {
      bodyHtml += '<div style="margin-bottom:12px; font-size:10.5pt; border-bottom:1px solid #000; padding-bottom:8px;">';
      bodyHtml += '  <strong>General Instructions:</strong><ol>';
      set.instructions.forEach(function (inst) {
        bodyHtml += '<li>' + escapeHtml(inst) + '</li>';
      });
      bodyHtml += '  </ol></div>';
    }

    set.sections.forEach(function (sec) {
      bodyHtml += '<table style="width:100%; border-collapse:collapse; margin-bottom:16px;" border="1">';
      bodyHtml += '  <tr style="background:#f1f5f9;"><th colspan="3" style="padding:6px; font-size:12pt; text-align:center;">' + escapeHtml(sec.name) + '</th></tr>';

      sec.questions.forEach(function (q) {
        bodyHtml += '<tr>';
        bodyHtml += '  <td style="width:36px; text-align:center; font-weight:bold; vertical-align:top; padding:6px;">' + q.qNo + '</td>';
        bodyHtml += '  <td style="vertical-align:top; padding:6px;">' + formatQuestionContent(q.text, true, set.images);

        var textHasImg = /\[(?:IMAGE|IMG|FIGURE)_?\d+\]/i.test(q.text || '');
        if (q.image && !textHasImg) {
          bodyHtml += '<div style="text-align:center; margin:8px auto; page-break-inside:avoid;"><img src="' + q.image + '" style="max-width:380px; max-height:240px; height:auto; border:1px solid #000; display:block; margin:0 auto;" /></div>';
        }

        if (q.options && q.options.length > 0) {
          bodyHtml += '  <table style="width:100%; border:none; margin-top:6px;"><tr>';
          q.options.forEach(function (opt, idx) {
            var lbl = (opt && opt.label) ? opt.label : String.fromCharCode(97 + idx);
            var txt = (typeof opt === 'string') ? opt : (opt ? (opt.text !== undefined ? opt.text : (opt.option || opt.value || '')) : '');
            bodyHtml += '<td style="width:50%; border:none; padding:2px 0;"><strong>' + escapeHtml(lbl) + ')</strong> ' + formatQuestionContent(txt, true, set.images) + '</td>';
            if (idx % 2 === 1 && idx < q.options.length - 1) bodyHtml += '</tr><tr>';
          });
          bodyHtml += '  </tr></table>';
        }

        if (q.orText) {
          bodyHtml += '<div style="text-align:center; font-weight:bold; margin:6px 0;">OR</div>';
          bodyHtml += '<div>' + formatQuestionContent(q.orText, true, set.images) + '</div>';
        }

        bodyHtml += '  </td>';
        bodyHtml += '  <td style="width:40px; text-align:center; font-weight:bold; vertical-align:top; padding:6px;">[' + (q.marks || '1') + ']</td>';
        bodyHtml += '</tr>';
      });

      bodyHtml += '</table>';
    });

    bodyHtml += '</div>';

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(set.examTitle) + '</title></head><body>' + bodyHtml + '</body></html>';
  }

  /* ── Utilities ── */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ── Universal Markdown Table Generator from DOM Table Node ── */
  function convertTableNodeToMarkdown(tbl) {
    if (!tbl) return '';
    var rows = Array.from(tbl.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr'));
    if (rows.length === 0) {
      rows = Array.from(tbl.querySelectorAll('tr')).filter(function (tr) { return tr.closest('table') === tbl; });
    }
    if (rows.length === 0) return '';

    var maxCols = 0;
    var rowData = [];
    rows.forEach(function (tr) {
      var cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
      if (cells.length === 0) {
        cells = Array.from(tr.querySelectorAll('th, td')).filter(function (td) { return td.closest('table') === tbl; });
      }
      var vals = [];
      cells.forEach(function (c) {
        var text = c.textContent.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
        var span = parseInt(c.getAttribute('colspan') || '1', 10) || 1;
        vals.push(text);
        for (var s = 1; s < span; s++) {
          vals.push('');
        }
      });
      if (vals.length > maxCols) maxCols = vals.length;
      rowData.push(vals);
    });

    if (maxCols === 0) return '';

    // If 1x1 table containing a paragraph of text, it's just a boxed callout/question, not a data grid
    if (maxCols === 1 && rowData.length === 1) {
      return '\n\n' + rowData[0][0] + '\n\n';
    }

    // Pad all rows to maxCols
    rowData.forEach(function (vals) {
      while (vals.length < maxCols) vals.push('');
    });

    var mdRows = [];
    rowData.forEach(function (vals, rIdx) {
      mdRows.push('| ' + vals.join(' | ') + ' |');
      if (rIdx === 0) {
        var sep = [];
        for (var c = 0; c < maxCols; c++) sep.push('---');
        mdRows.push('| ' + sep.join(' | ') + ' |');
      }
    });

    return '\n\n' + mdRows.join('\n') + '\n\n';
  }

  /* Converts HTML tables into clean Markdown tables or unpacks exam layout tables */
  function convertHtmlTablesToMarkdown(html) {
    if (!html || typeof html !== 'string' || html.indexOf('<table') === -1) return html;

    // In browser environment, use native DOM parser for 100% accurate nested table handling
    if (typeof document !== 'undefined') {
      try {
        var container = document.createElement('div');
        container.innerHTML = html;

        // 1. Unpack nested tables first! (e.g. data tables inside question cells)
        var nestedTables = Array.from(container.querySelectorAll('table table'));
        nestedTables.forEach(function (nestedTbl) {
          if (!nestedTbl.parentNode) return;
          var md = convertTableNodeToMarkdown(nestedTbl);
          var placeholder = document.createTextNode(md);
          nestedTbl.parentNode.replaceChild(placeholder, nestedTbl);
        });

        // 2. Now process remaining top-level tables
        var allTables = Array.from(container.querySelectorAll('table'));
        allTables.forEach(function (tbl) {
          if (!tbl.parentNode) return;

          var rows = Array.from(tbl.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr'));
          if (rows.length === 0) {
            rows = Array.from(tbl.querySelectorAll('tr')).filter(function (tr) { return tr.closest('table') === tbl; });
          }

          var qCount = 0;
          var secCount = 0;

          rows.forEach(function (tr) {
            var cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
            if (cells.length === 0) {
              cells = Array.from(tr.querySelectorAll('th, td')).filter(function (td) { return td.closest('table') === tbl; });
            }
            if (cells.length > 0) {
              var c0 = cells[0].textContent.trim();
              if (c0.match(/^Q?\.?\s*\d+\.?$/i)) qCount++;
              var rowText = cells.map(function (c) { return c.textContent; }).join(' ');
              if (rowText.match(/\b(?:Section|Part)\s+[A-E]\b/i)) secCount++;
            }
          });

          var isLayoutTable = (qCount >= 2 || (qCount >= 1 && secCount >= 1) || (rows.length >= 10 && qCount >= 1));

          if (isLayoutTable) {
            var frag = document.createDocumentFragment();
            rows.forEach(function (tr) {
              var cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
              if (cells.length === 0) {
                cells = Array.from(tr.querySelectorAll('th, td')).filter(function (td) { return td.closest('table') === tbl; });
              }
              if (cells.length === 0) return;
              var cellTexts = cells.map(function (c) { return c.textContent.trim(); });
              var fullRowText = cellTexts.join(' ').trim();

              // Check if section header
              var secMatch = fullRowText.match(/^(?:Section|Part)\s+([A-E])\b[:\s-]*(.*)$/i);
              if (secMatch && cellTexts.length <= 3 && !cellTexts[0].match(/^\d+$/)) {
                var pSec = document.createElement('p');
                pSec.textContent = '\n\n## Section ' + secMatch[1].toUpperCase() + (secMatch[2] ? ' - ' + secMatch[2] : '') + '\n';
                frag.appendChild(pSec);
                return;
              }

              // Check if question row
              var qNoMatch = cellTexts[0].match(/^Q?\.?\s*(\d+)\.?$/i);
              if (qNoMatch && cells.length >= 2) {
                var qNum = qNoMatch[1];
                var qBody = cells[1].innerHTML.trim();
                var marks = cells.length >= 3 ? cells[2].textContent.trim() : '';
                var pQ = document.createElement('p');
                pQ.innerHTML = '\n' + qNum + '. ' + qBody + (marks ? (' [' + marks + ' Marks]') : '') + '\n';
                frag.appendChild(pQ);
                return;
              }

              if (fullRowText) {
                var pOther = document.createElement('p');
                pOther.innerHTML = '\n' + cells.map(function (c) { return c.innerHTML; }).join('\n') + '\n';
                frag.appendChild(pOther);
              }
            });
            tbl.parentNode.replaceChild(frag, tbl);
          } else {
            // Real standalone data table: Convert to markdown table
            var mdTable = convertTableNodeToMarkdown(tbl);
            var textNode = document.createTextNode(mdTable);
            tbl.parentNode.replaceChild(textNode, tbl);
          }
        });

        return container.innerHTML;
      } catch (domErr) {
        console.warn('[Table Unpacker DOM fallback]', domErr);
      }
    }

    // Regex fallback
    return html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, function (match, inner) {
      var trMatches = inner.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      if (trMatches.length === 0) return '';

      var qNoCount = 0;
      var sectionCount = 0;
      var parsedRows = [];

      trMatches.forEach(function (trHtml) {
        var cellMatches = trHtml.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
        var cells = [];
        cellMatches.forEach(function (cHtml) {
          var content = cHtml.replace(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
                             .replace(/<\/p>/gi, '\n')
                             .replace(/<br\s*[\/]?>/gi, '\n')
                             .replace(/<[^>]+>/g, '')
                             .replace(/&nbsp;/gi, ' ')
                             .replace(/\s+/g, ' ')
                             .trim();
          cells.push(content);
        });
        parsedRows.push(cells);

        var nonEmpty = cells.filter(Boolean);
        var rowText = nonEmpty.join(' ');
        if (/^Section\s+[A-E]/i.test(rowText.trim())) {
          sectionCount++;
        } else if (nonEmpty.length >= 2 && /^\d{1,3}$/.test(nonEmpty[0])) {
          qNoCount++;
        }
      });

      var isLayoutTable = (qNoCount >= 2 || (sectionCount >= 1 && qNoCount >= 1));

      if (isLayoutTable) {
        var lines = [];
        parsedRows.forEach(function (cells) {
          var nonEmpty = cells.filter(Boolean);
          if (nonEmpty.length === 0) return;

          if (nonEmpty.length === 1 && /^Section\s+[A-E]/i.test(nonEmpty[0])) {
            lines.push('\n\n## ' + nonEmpty[0] + '\n');
            return;
          }

          if (/^\d+$/.test(nonEmpty[0])) {
            var qNo = nonEmpty[0];
            var qText = nonEmpty[1] || '';
            var qMarks = nonEmpty[2] || '';
            var line = '\n' + qNo + '. ' + qText;
            if (qMarks) {
              line += ' [' + qMarks + ' Marks]';
            }
            lines.push(line);
            return;
          }

          var joined = nonEmpty.join('\n');
          if (joined) lines.push(joined);
        });
        return '\n\n' + lines.join('\n') + '\n\n';
      }

      var maxCols = 0;
      parsedRows.forEach(function (r) { if (r.length > maxCols) maxCols = r.length; });
      if (maxCols === 0) return '';

      var mdLines = [];
      var header = parsedRows[0];
      while (header.length < maxCols) header.push('');
      mdLines.push('| ' + header.join(' | ') + ' |');
      mdLines.push('| ' + header.map(function () { return '---'; }).join(' | ') + ' |');

      for (var r = 1; r < parsedRows.length; r++) {
        var row = parsedRows[r];
        while (row.length < maxCols) row.push('');
        mdLines.push('| ' + row.join(' | ') + ' |');
      }

      return '\n\n' + mdLines.join('\n') + '\n\n';
    });
  }

  function convertHtmlToCleanText(html) {
    if (!html) return '';
    var text = convertHtmlTablesToMarkdown(html);
    text = text.replace(/<\/h[1-6]>/gi, '\n\n')
               .replace(/<\/p>/gi, '\n\n')
               .replace(/<\/li>/gi, '\n')
               .replace(/<br\s*[\/]?>/gi, '\n')
               .replace(/<\/tr>/gi, '\n')
               .replace(/<\/div>/gi, '\n')
               .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
               .replace(/<b>(.*?)<\/b>/gi, '**$1**')
               .replace(/<em>(.*?)<\/em>/gi, '*$1*')
               .replace(/<i>(.*?)<\/i>/gi, '*$1*')
               .replace(/<[^>]+>/g, '')
               .replace(/&nbsp;/gi, ' ')
               .replace(/&amp;/gi, '&')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&quot;/gi, '"');
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  function formatInlineText(str) {
    if (!str) return '';
    // Temporary tokens for KaTeX math expressions so markdown styling does not corrupt them
    var mathTokens = [];
    var s = String(str).replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, function (match) {
      var token = '@@MATH_TOKEN_' + mathTokens.length + '@@';
      mathTokens.push(match);
      return token;
    });

    s = escapeHtml(s);

    // Markdown bold **text** or __text__
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Markdown italic *text* (excluding inside words)
    s = s.replace(/(?:^|[^\*])\*([^\*]+?)\*(?:[^\*]|$)/g, function (m, p1) {
      return m.replace('*' + p1 + '*', '<em>' + p1 + '</em>');
    });

    // Inline code `text`
    s = s.replace(/`([^`]+)`/g, '<code class="exam-inline-code">$1</code>');

    // Restore math tokens
    mathTokens.forEach(function (m, idx) {
      s = s.replace('@@MATH_TOKEN_' + idx + '@@', m);
    });

    return s;
  }

  function maskMathForTable(str) {
    return (str || '').replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g, function (m) {
      return '_'.repeat(m.length);
    });
  }

  function isTableDelimiterRow(line) {
    var s = (line || '').trim();
    if (!s) return false;
    return /^\|?(\s*:?-{2,}:?\s*\|?)+$/.test(s) || /^\+[-+]+\+$/.test(s);
  }

  function isTableRowLine(line) {
    var s = (line || '').trim();
    if (!s) return false;
    if (isTableDelimiterRow(s)) return true;
    if ((s.match(/\t/g) || []).length >= 1) return true;

    // Mask math delimiters ($...$) so formulas with absolute values (|x|) are NOT mistaken for table columns
    var masked = maskMathForTable(s).trim();
    if (masked.startsWith('|') && masked.endsWith('|') && (masked.match(/\|/g) || []).length >= 2) {
      return true;
    }
    if ((masked.match(/\|/g) || []).length >= 1) {
      var parts = masked.split('|');
      if (parts.length >= 3) return true;
      if (masked.startsWith('|') || masked.endsWith('|')) return true;
    }
    return false;
  }

  function splitTableRow(line) {
    var s = (line || '').trim();
    if (s.indexOf('\t') >= 0) {
      return s.split('\t').map(function (c) { return c.trim(); });
    }

    // Split by pipe '|', preserving pipes inside LaTeX math delimiters ($...$)
    var cells = [];
    var cur = '';
    var inMath = false;

    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '$') {
        inMath = !inMath;
        cur += ch;
      } else if (ch === '|' && !inMath) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());

    if (s.startsWith('|') && cells.length > 0 && cells[0] === '') cells.shift();
    if (s.endsWith('|') && cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  }

  function isNumericVal(str) {
    if (!str) return false;
    var s = String(str).trim();
    return /^[\d\.\-\/\:]+$/.test(s) || s.length <= 2;
  }

  function renderTableBlock(lines, title, isWord) {
    if (!lines || lines.length === 0) return '';

    var headerCells = null;
    var dataRows = [];
    var alignments = [];

    for (var k = 0; k < lines.length; k++) {
      var rawL = lines[k].trim();
      if (isTableDelimiterRow(rawL)) {
        if (rawL.indexOf('-') >= 0 && (rawL.indexOf('|') >= 0 || rawL.indexOf('+') >= 0)) {
          var delimParts = splitTableRow(rawL);
          alignments = delimParts.map(function (d) {
            d = d.trim();
            var starts = d.startsWith(':');
            var ends = d.endsWith(':');
            if (starts && ends) return 'center';
            if (ends) return 'right';
            return 'left';
          });
        }
        continue;
      }

      var cells = splitTableRow(rawL);
      if (!headerCells && dataRows.length === 0) {
        headerCells = cells;
      } else {
        dataRows.push(cells);
      }
    }

    if (!headerCells && dataRows.length === 0) return '';
    if (!headerCells) {
      headerCells = dataRows.shift();
    }

    var colCount = headerCells.length;

    var html = '';
    if (isWord) {
      html += '<div style="margin:12px auto; text-align:center;">';
      if (title) {
        html += '<div style="font-weight:bold; font-size:11pt; margin-bottom:5px; text-align:center; font-family:\'Times New Roman\', serif; text-transform:uppercase;">' + escapeHtml(title) + '</div>';
      }
      html += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; border:1.5px solid #000; margin:0 auto; font-family:\'Times New Roman\', serif; font-size:10.5pt; width:95%;">';
      html += '<thead><tr style="background:#f1f5f9; font-weight:bold;">';
      headerCells.forEach(function (h, ci) {
        var align = alignments[ci] || (isNumericVal(h) ? 'center' : 'center');
        html += '<th style="border:1px solid #000; padding:5px 8px; text-align:' + align + ';">' + formatInlineText(h) + '</th>';
      });
      html += '</tr></thead><tbody>';
      dataRows.forEach(function (row) {
        html += '<tr>';
        for (var ci = 0; ci < colCount; ci++) {
          var c = row[ci] !== undefined ? row[ci] : '';
          var align = alignments[ci] || (isNumericVal(c) ? 'center' : 'left');
          html += '<td style="border:1px solid #000; padding:4px 8px; text-align:' + align + ';">' + formatInlineText(c) + '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="exam-table-wrapper">';
      if (title) {
        html += '<div class="exam-table-title">' + escapeHtml(title) + '</div>';
      }
      html += '<table class="exam-inner-table">';
      html += '<thead><tr>';
      headerCells.forEach(function (h, ci) {
        var align = alignments[ci] || 'center';
        var alignClass = align === 'center' ? ' class="text-center"' : (align === 'right' ? ' class="text-right"' : '');
        html += '<th' + alignClass + '>' + formatInlineText(h) + '</th>';
      });
      html += '</tr></thead><tbody>';
      dataRows.forEach(function (row) {
        html += '<tr>';
        for (var ci = 0; ci < colCount; ci++) {
          var c = row[ci] !== undefined ? row[ci] : '';
          var align = alignments[ci] || (isNumericVal(c) ? 'center' : 'left');
          var alignClass = align === 'center' ? ' class="text-center"' : (align === 'right' ? ' class="text-right"' : '');
          html += '<td' + alignClass + '>' + formatInlineText(c) + '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    return html;
  }

  /* Universal question formatter: handles tables, math, bold, code, images, and line breaks */
  function formatQuestionContent(rawText, isWord, images) {
    if (!rawText) return '';
    var text = String(rawText);
    var imgMap = images || (parsedPaper && parsedPaper.images) || extractedPaperImages || {};

    // If text contains HTML table tags, convert to markdown first
    if (text.indexOf('<table') >= 0) {
      text = convertHtmlTablesToMarkdown(text);
    }

    // Global replacement of image tokens [IMAGE_X], [IMG_X], [FIGURE_X] wherever they appear
    text = text.replace(/\[(?:IMAGE|IMG|FIGURE)_?(\d+)\]/gi, function (match, num) {
      var key1 = match;
      var key2 = 'IMAGE_' + num;
      var imgUri = imgMap[key1] || imgMap[key2];
      if (imgUri && !String(imgUri).startsWith('data:image/x-emf')) {
        if (isWord) {
          return '\n\n<div style="text-align:center; margin:10px auto; page-break-inside:avoid;"><img src="' + imgUri + '" style="max-width:380px; max-height:240px; height:auto; border:1px solid #000; display:block; margin:0 auto;" /></div>\n\n';
        } else {
          return '\n\n<div class="exam-q-img-box"><img src="' + imgUri + '" class="exam-question-img" alt="Question Diagram" /></div>\n\n';
        }
      }
      return match;
    });

    var lines = text.split(/\r?\n/);
    var resultParts = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Check if line is a remaining image placeholder (already handled above, or standalone)
      var imgMatch = line.trim().match(/^\[(?:IMAGE|IMG|FIGURE)_?(\d+)\]$/i);
      if (imgMatch) {
        var token = imgMatch[0];
        var key = 'IMAGE_' + imgMatch[1];
        var imgUri = imgMap[token] || imgMap[key];
        if (imgUri && !String(imgUri).startsWith('data:image/x-emf')) {
          if (isWord) {
            resultParts.push('<div style="text-align:center; margin:10px auto; page-break-inside:avoid;"><img src="' + imgUri + '" style="max-width:380px; max-height:240px; height:auto; border:1px solid #000; display:block; margin:0 auto;" /></div>');
          } else {
            resultParts.push('<div class="exam-q-img-box"><img src="' + imgUri + '" class="exam-question-img" alt="Question Diagram" /></div>');
          }
          i++;
          continue;
        }
      }

      // Check if line is a table title e.g. "TABLE: CLUB" or "**TABLE: CLUB**"
      var titleMatch = line.trim().match(/^(?:\*{1,2}|_{1,2})?\s*(TABLE\s*[:\-]?\s*[A-Za-z0-9_\s]+)(?:\*{1,2}|_{1,2})?$/i);
      var pendingTitle = null;
      if (titleMatch) {
        var lookAhead = i + 1;
        while (lookAhead < lines.length && !lines[lookAhead].trim()) lookAhead++;
        if (lookAhead < lines.length && isTableRowLine(lines[lookAhead])) {
          pendingTitle = titleMatch[1].trim();
          i = lookAhead;
          line = lines[i];
        }
      }

      // Check if line begins a table block
      if (isTableRowLine(line)) {
        var tableLines = [];
        while (i < lines.length && (isTableRowLine(lines[i]) || (tableLines.length > 0 && lines[i].trim() === ''))) {
          if (lines[i].trim() === '') {
            // Check if table continues after blank line
            var peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && isTableRowLine(lines[peek])) {
              i++;
              continue;
            } else {
              break;
            }
          }
          tableLines.push(lines[i]);
          i++;
        }
        var tableHtml = renderTableBlock(tableLines, pendingTitle, isWord);
        resultParts.push(tableHtml);
        continue;
      }

      if (pendingTitle) {
        if (isWord) {
          resultParts.push('<div style="font-weight:bold; font-size:11pt; margin:6px 0; text-align:center; font-family:\'Times New Roman\', serif; text-transform:uppercase;">' + escapeHtml(pendingTitle) + '</div>');
        } else {
          resultParts.push('<div class="exam-table-title">' + escapeHtml(pendingTitle) + '</div>');
        }
      }

      // Format inline text and replace any inline [IMAGE_1] tokens
      var formattedLine = formatInlineText(line);
      formattedLine = formattedLine.replace(/\[(?:IMAGE|IMG|FIGURE)_?(\d+)\]/gi, function(m, num) {
        var uri = imgMap[m] || imgMap['IMAGE_' + num];
        if (uri) {
          if (isWord) {
            return '<br/><div style="text-align:center; margin:8px auto; page-break-inside:avoid;"><img src="' + uri + '" style="max-width:380px; max-height:240px; height:auto; border:1px solid #000; display:block; margin:0 auto;" /></div><br/>';
          } else {
            return '<div class="exam-q-img-box"><img src="' + uri + '" class="exam-question-img" alt="Question Diagram" /></div>';
          }
        }
        return m;
      });

      resultParts.push(formattedLine);
      i++;
    }

    return resultParts.join('<br/>\n');
  }

  function formatMathText(str) {
    return formatQuestionContent(str, false);
  }

  /* Sample Paper featuring exact exam table structure (TABLE: CLUB) */
  function loadSamplePaperWithTable() {
    var sample = {
      schoolName: "KSR AKSHARA ACADEMY",
      examTitle: "TERM END EXAMINATION I - 2026-27",
      date: "24-09-2026",
      grade: "XII",
      marks: "70",
      subject: "Computer Science (083)",
      duration: "3 Hrs.",
      instructions: [
        "Please check that this question paper contains 4 printed pages.",
        "All questions are compulsory.",
        "Section A contains Multiple Choice Questions of 1 mark each.",
        "Section B contains Short Answer Questions of 2 marks each.",
        "Section C contains Table Application & SQL Query Questions of 5 marks."
      ],
      sections: [
        {
          name: "Section A",
          description: "Multiple Choice Questions (1 Mark Each)",
          shuffleType: "options",
          marksPerQ: "1",
          questions: [
            {
              qNo: 1,
              text: "Which SQL clause is used to filter records grouped by the GROUP BY clause?",
              marks: "1",
              options: [
                { label: "a", text: "WHERE" },
                { label: "b", text: "HAVING" },
                { label: "c", text: "ORDER BY" },
                { label: "d", text: "FROM" }
              ]
            },
            {
              qNo: 2,
              text: "Which of the following commands in SQL is used to permanently remove a table along with its definition and data?",
              marks: "1",
              options: [
                { label: "a", text: "DROP TABLE" },
                { label: "b", text: "DELETE FROM" },
                { label: "c", text: "TRUNCATE TABLE" },
                { label: "d", text: "ALTER TABLE" }
              ]
            }
          ]
        },
        {
          name: "Section B",
          description: "Short Answer Questions (2 Marks Each)",
          shuffleType: "questions",
          marksPerQ: "2",
          questions: [
            {
              qNo: 3,
              text: "Differentiate between DDL (Data Definition Language) and DML (Data Manipulation Language) commands in MySQL with two examples each.",
              marks: "2",
              options: []
            },
            {
              qNo: 4,
              text: "Identify the logic gate represented by the circuit diagram below and draw its truth table for inputs A and B.",
              marks: "2",
              options: [],
              image: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 120" width="340" height="120"><rect width="340" height="120" fill="#ffffff"/><path d="M 40 40 L 110 40 M 40 80 L 110 80" stroke="#000000" stroke-width="2.5"/><text x="22" y="45" font-family="Arial, sans-serif" font-size="14" font-weight="bold">A</text><text x="22" y="85" font-family="Arial, sans-serif" font-size="14" font-weight="bold">B</text><path d="M 110 25 C 130 40 130 80 110 95 C 145 95 180 82 200 60 C 180 38 145 25 110 25 Z" fill="#f8fafc" stroke="#000000" stroke-width="2.5"/><circle cx="207" cy="60" r="7" fill="#ffffff" stroke="#000000" stroke-width="2.5"/><path d="M 214 60 L 290 60" stroke="#000000" stroke-width="2.5"/><text x="302" y="65" font-family="Arial, sans-serif" font-size="14" font-weight="bold">Y</text><text x="135" y="65" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">NOR</text></svg>')
            }
          ]
        },
        {
          name: "Section C",
          description: "Database Application & Table Queries (5 Marks)",
          shuffleType: "none",
          marksPerQ: "5",
          questions: [
            {
              qNo: 5,
              text: "Consider the following table CLUB and answer the queries that follow:\n\n**TABLE: CLUB**\n| COACH_ID | COACHNAME | AGE | SPORTS | DOJ | PAY | SEX |\n|:---:|:---|:---:|:---|:---:|:---:|:---:|\n| 1 | ARUN | 35 | KARATE | 27/03/1996 | 1000 | M |\n| 2 | RAVINA | 34 | KARATE | 20/01/1998 | 1200 | F |\n| 3 | KARAN | 34 | SQUASH | 19/02/1998 | 2000 | M |\n| 4 | TARUN | 33 | BASKETBALL | 01/01/1998 | 1500 | M |\n| 5 | ANKITA | 36 | SWIMMING | 12/01/1998 | 750 | F |\n\n(a) Write SQL query to show all information about the coaches of KARATE club.\n(b) Write SQL query to display coach name, sports and pay for all female coaches.\n(c) Write SQL query to display details of coaches whose pay is greater than 1000.\n(d) Write SQL query to display the sports where pay is between 1000 and 1600.\n(e) Write SQL query to count the number of coaches whose age is greater than 34.",
              marks: "5",
              options: []
            }
          ]
        }
      ]
    };

    parsedPaper = sample;
    updateUploadSuccessBadge(sample);
    renderAll();
    setTimeout(function () {
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  /* ── Interactive Image Attachment & Removal Handlers ── */
  function handleImageAttach(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var origQNo = parseInt(e.target.dataset.origqno || e.target.dataset.qno, 10);
    var reader = new FileReader();
    reader.onload = function (evt) {
      var dataUrl = evt.target.result;
      // Update parsedPaper
      if (parsedPaper && parsedPaper.sections) {
        parsedPaper.sections.forEach(function (sec) {
          (sec.questions || []).forEach(function (q) {
            if (q.qNo === origQNo) {
              q.image = dataUrl;
            }
          });
        });
      }
      // Update all generated sets
      if (generatedSets && generatedSets.length > 0) {
        generatedSets.forEach(function (set) {
          (set.sections || []).forEach(function (sec) {
            (sec.questions || []).forEach(function (q) {
              if ((q.originalQNo || q.qNo) === origQNo) {
                q.image = dataUrl;
              }
            });
          });
        });
      }
      // Re-render
      var currentTabIdx = currentActiveTab;
      renderAll();
      currentActiveTab = currentTabIdx;
      renderTabs();
      renderCurrentTab();
    };
    reader.readAsDataURL(file);
  }

  function handleImageRemove(btn) {
    var origQNo = parseInt(btn.dataset.origqno || btn.dataset.qno, 10);
    if (parsedPaper && parsedPaper.sections) {
      parsedPaper.sections.forEach(function (sec) {
        (sec.questions || []).forEach(function (q) {
          if (q.qNo === origQNo) {
            delete q.image;
          }
        });
      });
    }
    if (generatedSets && generatedSets.length > 0) {
      generatedSets.forEach(function (set) {
        (set.sections || []).forEach(function (sec) {
          (sec.questions || []).forEach(function (q) {
            if ((q.originalQNo || q.qNo) === origQNo) {
              delete q.image;
            }
          });
        });
      });
    }
    var currentTabIdx = currentActiveTab;
    renderAll();
    currentActiveTab = currentTabIdx;
    renderTabs();
    renderCurrentTab();
  }

  /* ── Event Listeners ── */
  function init() {
    // Dropzone events
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        handleFile(fileInput.files[0]);
      }
    });

    if (loadSampleTableBtn) {
      loadSampleTableBtn.addEventListener('click', loadSamplePaperWithTable);
    }

    // Dynamic delegation for Question Diagram Attach & Remove
    paperPreview.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('exam-img-input')) {
        handleImageAttach(e);
      }
    });
    paperPreview.addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.exam-img-remove-btn');
      if (removeBtn) {
        handleImageRemove(removeBtn);
      }
    });

    // Control buttons
    generateBtn.addEventListener('click', function () {
      if (!parsedPaper) {
        alert('Please upload a question paper first (PDF or DOCX).');
        return;
      }
      currentActiveTab = 0;
      renderAll();
      setTimeout(function () {
        resultsSection.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });

    setsSelect.addEventListener('change', function () {
      if (parsedPaper && resultsSection.style.display !== 'none') {
        renderAll();
      }
    });

    printSetBtn.addEventListener('click', printCurrentSet);
    downloadDocBtn.addEventListener('click', function () {
      if (currentActiveTab >= 0 && generatedSets[currentActiveTab]) {
        downloadSetAsWord(generatedSets[currentActiveTab]);
      }
    });
    downloadAllBtn.addEventListener('click', downloadAllSets);

    // Start empty — teacher must upload a file or click "Load Sample Paper"
  }

  document.addEventListener('DOMContentLoaded', init);
})();
