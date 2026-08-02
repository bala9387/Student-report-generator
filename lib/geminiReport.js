/* Multi-provider answer-sheet evaluator (Gemini + Kimi / Moonshot AI).
 * Load balances evaluations across available API keys and automatically fails over
 * if one API hits rate limits or errors.
 */

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const GEMINI_ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

const MAX_FILE_BYTES = 20 * 1024 * 1024;      // ~20 MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
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
  "- coreConcepts: Array of 3-5 objects { title, detail } highlighting key core subject concepts tested in the paper (e.g. Gauss's Law, Kirchhoff's Rules, Integration by Parts, Reaction Mechanisms, Double Entry Bookkeeping, etc.).\n" +
  "- studyTips: Array of 3-5 objects { title, detail } providing subject-tailored study techniques and revision strategies (e.g. daily formula practice, diagram drafting, code tracing, time management per section).\n" +
  "- strengths: Array of 3-5 objects { title, detail } with subject-specific feedback.\n" +
  "- areasForImprovement: Array of 3-5 objects { title, detail } with subject-specific feedback.\n" +
  "- actionableRecommendations: Array of 3-5 objects { title, detail } with subject-specific advice.\n";

const RESPONSE_SCHEMA = {
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
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    areasForImprovement: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    actionableRecommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    coreConcepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    studyTips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    }
  },
  required: [
    "studentName",
    "gradeSection",
    "subject",
    "examTitle",
    "dateOfExam",
    "totalMaxMarks",
    "totalMarksObtained",
    "sections",
    "strengths",
    "areasForImprovement",
    "actionableRecommendations",
    "coreConcepts",
    "studyTips"
  ]
};

function partsFor(label, input) {
  if (!input) return [];
  const out = [{ text: "\n===== " + label + " =====" }];
  if (input.text && input.text.trim()) {
    out.push({ text: input.text.trim() });
  } else if (input.data && input.mimeType) {
    out.push({ inlineData: { mimeType: input.mimeType, data: input.data } });
  } else {
    return [];
  }
  return out;
}

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

function validateFile(input, label) {
  if (!input || !input.data) return;
  if (!ALLOWED_MIME.test(input.mimeType || '')) {
    throw badRequest(label + ': unsupported file type (use PDF, JPG, PNG or WebP)');
  }
  const bytes = Math.floor(String(input.data).length * 0.75);
  if (bytes > MAX_FILE_BYTES) throw badRequest(label + ': file too large (max 12 MB)');
}

// ---------- Gemini Provider ----------
async function generateWithGemini(inputs, key, modelName) {
  const model = modelName || GEMINI_MODEL();
  const parts = [{ text: SYSTEM_PROMPT }];
  Array.prototype.push.apply(parts, partsFor("SYLLABUS", inputs.syllabus));
  Array.prototype.push.apply(parts, partsFor("QUESTION PAPER", inputs.questionPaper));
  Array.prototype.push.apply(parts, partsFor("STUDENT WRITTEN ANSWER SHEET", inputs.answerPaper));
  if (inputs.notes && inputs.notes.trim()) {
    parts.push({ text: "\n===== ADDITIONAL INSTRUCTIONS =====\n" + inputs.notes.trim() });
  }
  parts.push({ text: "\nNow produce the structured evaluation report matching the schema." });

  const body = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const res = await fetch(GEMINI_ENDPOINT(model, key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = "Gemini API error (HTTP " + res.status + ")";
    try { const j = JSON.parse(raw); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  let data = JSON.parse(raw);
  const cand = data.candidates && data.candidates[0];
  const textOut = cand && cand.content && cand.content.parts &&
    cand.content.parts.map(function (p) { return p.text || ""; }).join("");
  if (!textOut) {
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    throw new Error(blocked ? ("Request blocked: " + blocked) : "Gemini returned no content.");
  }

  return { report: JSON.parse(textOut), model: "Gemini (" + model + ")" };
}

// ---------- Evaluation Router ----------
let requestCount = 0;

async function generateReport(inputs) {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    const e = new Error('No Gemini API key configured on the server (GEMINI_API_KEY).');
    e.status = 500;
    throw e;
  }

  const answer = inputs.answerPaper;
  if (!answer || (!answer.text && !answer.data)) {
    throw badRequest('An answer sheet (text or file) is required.');
  }
  validateFile(inputs.syllabus, 'Syllabus');
  validateFile(inputs.questionPaper, 'Question paper');
  validateFile(inputs.answerPaper, 'Answer sheet');

  requestCount++;
  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash'
  ];

  let lastError = null;
  for (const model of candidateModels) {
    try {
      console.log(`[Report Engine] Evaluating request #${requestCount} with ${model}...`);
      return await generateWithGemini(inputs, geminiKey, model);
    } catch (err) {
      console.error(`[Report Engine] ${model} failed (${err.message}), trying next model if available...`);
      lastError = err;
    }
  }

  throw lastError;
}

module.exports = { generateReport };
