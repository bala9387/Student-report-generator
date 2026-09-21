/* ============================================================
   Question Paper Setter Engine & UI Controller
   CBSE Class 12 / High School Exam Paper Shuffler & Formatter
   ============================================================ */

(function () {
  "use strict";

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  }

  /* ── State ── */
  var parsedPaper = null;
  var generatedSets = [];
  var currentActiveTab = 0; // 0: Set A, 1: Set B, etc., -1: Matrix
  var numSets = 3;

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
        } else if (behavior === 'options') {
          // Shuffle option orders (MCQs)
          sec.questions.forEach(function (q, qIdx) {
            var cloned = JSON.parse(JSON.stringify(q));
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

    lines.forEach(function (line) {
      // Header extraction
      if (!paper.schoolName && /school|academy|college|vidyalaya|university|institute|international|public/i.test(line) && line.length < 70) {
        paper.schoolName = line;
        return;
      }
      if (!paper.examTitle && /term|examination|exam|test|assessment|slip test|periodic|cumulative|annual|mid[- ]term/i.test(line) && line.length < 80) {
        paper.examTitle = line.replace(/\s*\(SET\s*[A-Z]\)/i, '').trim();
        return;
      }
      if (/Date\s*[:=]\s*([^|;,\n]+)/i.test(line)) {
        var dm = line.match(/Date\s*[:=]\s*([^|\n]+)/i);
        if (dm) paper.date = dm[1].trim();
      }
      if (/Marks\s*[:=]\s*(\d+)/i.test(line)) {
        var mm = line.match(/Marks\s*[:=]\s*(\d+)/i);
        if (mm) paper.marks = mm[1].trim();
      }
      if (/Grade\s*[:=]\s*([^|;,\n]+)/i.test(line)) {
        var gm = line.match(/Grade\s*[:=]\s*([^|\n]+)/i);
        if (gm) paper.grade = gm[1].trim();
      }
      if (/Subject\s*[:=]\s*([^|;,\n]+)/i.test(line)) {
        var sm = line.match(/Subject\s*[:=]\s*([^|\n]+)/i);
        if (sm) paper.subject = sm[1].trim();
      }
      if (/Duration\s*[:=]\s*([^|;,\n]+)/i.test(line)) {
        var durM = line.match(/Duration\s*[:=]\s*([^|\n]+)/i);
        if (durM) paper.duration = durM[1].trim();
      }

      // General Instructions header
      if (/General\s+Instructions/i.test(line)) {
        inInstructions = true;
        return;
      }

      // Section header detection
      var secMatch = line.match(/^Section\s+([A-E])/i);
      if (secMatch) {
        inInstructions = false;
        if (currentQuestion && currentSection) {
          currentSection.questions.push(currentQuestion);
          currentQuestion = null;
        }
        var secLetter = secMatch[1].toUpperCase();
        var shuffleType = (secLetter === "A") ? "options" : ((secLetter === "B" || secLetter === "C") ? "questions" : "none");
        var marksPerQ = (secLetter === "A") ? "1" : ((secLetter === "B") ? "2" : ((secLetter === "C") ? "3" : ((secLetter === "D") ? "5" : "4")));

        currentSection = {
          name: "Section " + secLetter,
          description: line,
          shuffleType: shuffleType,
          marksPerQ: marksPerQ,
          questions: []
        };
        paper.sections.push(currentSection);
        return;
      }

      // Inside General Instructions
      if (inInstructions && currentSection === null) {
        if (/^\d+\.\s*/.test(line)) {
          paper.instructions.push(line.replace(/^\d+\.\s*/, ''));
        } else if (line.length > 5) {
          paper.instructions.push(line);
        }
        return;
      }

      // Question start detection e.g. "1 A function f...", "21 Let A = ..."
      var qMatch = line.match(/^(\d+)[\.\s\t]+(.+)/);
      if (qMatch) {
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
        var qNum = parseInt(qMatch[1], 10);
        var qText = qMatch[2].trim();
        var qMarks = currentSection.marksPerQ;

        // Check if marks indicator at end e.g. [1] or [2]
        var markMatch = qText.match(/\[(\d+)\]\s*$/);
        if (markMatch) {
          qMarks = markMatch[1];
          qText = qText.replace(/\[\d+\]\s*$/, '').trim();
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
      if (currentQuestion && /^[a-d]\)/i.test(line)) {
        var optMatches = line.matchAll(/([a-d])\)\s*([^a-d\)]+)(?=[a-d]\)|$)/gi);
        var foundAny = false;
        for (var m of optMatches) {
          foundAny = true;
          currentQuestion.options.push({
            label: m[1].toLowerCase(),
            text: m[2].trim()
          });
        }
        if (!foundAny) {
          var singleMatch = line.match(/^([a-d])\)\s*(.+)/i);
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
      if (currentQuestion && /^OR$/i.test(line)) {
        currentQuestion._inOr = true;
        currentQuestion.orText = "";
        return;
      }

      // Appending to OR text or question body
      if (currentQuestion) {
        if (currentQuestion._inOr) {
          currentQuestion.orText = (currentQuestion.orText ? (currentQuestion.orText + "\n") : "") + line;
        } else {
          currentQuestion.text += "\n" + line;
        }
      }
    });

    if (currentQuestion && currentSection) {
      currentSection.questions.push(currentQuestion);
    }

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
      updateParsingLoader("🤖 AI is analyzing your question paper...");
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

    for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      var page = await pdf.getPage(pageNum);
      var content = await page.getTextContent();
      var lastY = null;
      var pageText = "";

      content.items.forEach(function (item) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 9) {
          pageText += "\n";
        } else if (lastY !== null) {
          pageText += " ";
        }
        pageText += item.str;
        lastY = item.transform[5];
      });

      fullText += pageText + "\n\n";
    }

    return fullText;
  }

  async function extractDocxText(file) {
    if (!window.mammoth) {
      throw new Error("Mammoth DOCX parser not loaded");
    }
    var arrayBuffer = await file.arrayBuffer();
    var result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
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

  async function parseWithGemini(text) {
    try {
      var response = await fetch('/api/parse-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });

      var data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI parsing failed (status ' + response.status + ')');
      }

      if (data.ok && data.paper) {
        parsedPaper = data.paper;
        hideParsingLoader();
        resultsSection.style.display = 'none';
        updateUploadSuccessBadge(data.paper);
        return;
      }

      throw new Error('Unexpected response from AI parser.');

    } catch (err) {
      console.warn("AI parse error, trying local parser fallback:", err);
      updateParsingLoader("⚡ Falling back to local parser...");
      
      var paper = parsePaperFromText(text);
      hideParsingLoader();

      var hasQuestions = paper && paper.sections && paper.sections.some(function(s) {
        return s.questions && s.questions.length > 0;
      });

      if (hasQuestions) {
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
        html += '      <div>' + formatMathText(q.text) + '</div>';

        // Options for Section A
        if (q.options && q.options.length > 0) {
          html += '    <div class="exam-options-grid">';
          q.options.forEach(function (opt, optIdx) {
            var lbl = (opt && opt.label) ? opt.label : String.fromCharCode(97 + optIdx);
            var txt = (typeof opt === 'string') ? opt : (opt ? (opt.text !== undefined ? opt.text : (opt.option || opt.value || '')) : '');
            html += '    <div class="exam-option-item"><strong>' + escapeHtml(lbl) + ')</strong> ' + formatMathText(txt) + '</div>';
          });
          html += '    </div>';
        }

        // Internal choice (OR)
        if (q.orText) {
          html += '    <div class="exam-or-divider">OR</div>';
          html += '    <div>' + formatMathText(q.orText) + '</div>';
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
        bodyHtml += '  <td style="vertical-align:top; padding:6px;">' + formatMathText(q.text).replace(/\n/g, '<br/>');

        if (q.options && q.options.length > 0) {
          bodyHtml += '  <table style="width:100%; border:none; margin-top:6px;"><tr>';
          q.options.forEach(function (opt, idx) {
            var lbl = (opt && opt.label) ? opt.label : String.fromCharCode(97 + idx);
            var txt = (typeof opt === 'string') ? opt : (opt ? (opt.text !== undefined ? opt.text : (opt.option || opt.value || '')) : '');
            bodyHtml += '<td style="width:50%; border:none; padding:2px 0;"><strong>' + escapeHtml(lbl) + ')</strong> ' + formatMathText(txt) + '</td>';
            if (idx % 2 === 1 && idx < q.options.length - 1) bodyHtml += '</tr><tr>';
          });
          bodyHtml += '  </tr></table>';
        }

        if (q.orText) {
          bodyHtml += '<div style="text-align:center; font-weight:bold; margin:6px 0;">OR</div>';
          bodyHtml += '<div>' + formatMathText(q.orText).replace(/\n/g, '<br/>') + '</div>';
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

  function formatMathText(str) {
    if (!str) return '';
    var s = escapeHtml(str);
    // Replace standard superscript characters if needed or maintain clean display
    s = s.replace(/\n/g, '<br/>');
    return s;
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
