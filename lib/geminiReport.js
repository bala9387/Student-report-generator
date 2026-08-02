/* Multi-provider answer-sheet evaluator (Gemini + Kimi / Moonshot AI).
 * Load balances evaluations across available API keys and automatically fails over
 * if one API hits rate limits or errors.
 */

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

const MAX_FILE_BYTES = 20 * 1024 * 1024;      // ~20 MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
  "You are an expert senior examiner and academic master at KSR Akshara Academy grading a student's examination.\n\n" +
  "CRITICAL MANDATORY RULES FOR MARKS ACCURACY:\n" +
  "1. The FIRST PAGE (Cover Page) of the Answer Sheet contains an official teacher mark grid table and total score (e.g. 62/70).\n" +
  "2. You MUST transcribe the EXACT marks recorded by the teacher in that cover page table for each section and total.\n" +
  "3. Do NOT re-evaluate, estimate, or invent different marks than what the teacher wrote on the cover page table! Both totalMarksObtained and evaluatedTotalMarks MUST MATCH the official teacher total on the cover page (e.g. 62).\n" +
  "4. Ensure section totalMarks and section obtainedMarks sum up EXACTLY to the cover page total.\n" +
  "5. Extract student name, subject, exam title, and grade directly from the cover page header.\n\n" +
  "Instructions for output JSON fields:\n" +
  "- studentName: Student's full name from answer sheet (e.g. 'Kanimitha M.').\n" +
  "- gradeSection: Grade and section e.g. 'Grade XII - Harmony'.\n" +
  "- subject: Subject title and code, e.g. 'Physics (042)'.\n" +
  "- examTitle: Exam title, e.g. 'Unit Cumulative Examination'.\n" +
  "- dateOfExam: Date of examination e.g. 'June 1, 2026'.\n" +
  "- totalMaxMarks: Total maximum marks for the paper (e.g. 70).\n" +
  "- totalMarksObtained: Official total marks written on cover page (e.g. 62).\n" +
  "- evaluatedTotalMarks: Sum of exact section marks from cover page table (e.g. 62).\n" +
  "- summaryPerformanceLevel: Concise overall performance summary.\n" +
  "- footnote: Set to empty string if section sum matches cover total.\n" +
  "- sections: Array of section evaluations { sectionName, questionType, totalMarks, obtainedMarks, performanceLevel } matching cover page mark grid.\n" +
  "- strengths: Array of 3-5 objects with { title, detail } citing specific questions.\n" +
  "- areasForImprovement: Array of 3-5 objects with { title, detail } identifying specific questions.\n" +
  "- actionableRecommendations: Array of 3-5 objects with { title, detail } giving concrete advice.\n";

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
    "actionableRecommendations"
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
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-3.6-flash'
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
