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
  "You are an expert senior examiner and academic master at KSR Akshara Academy grading a student's examination. " +
  "You are provided with: (1) SYLLABUS (optional), (2) QUESTION PAPER, and (3) STUDENT'S WRITTEN ANSWER SHEET (which may contain cover marks, handwritten answers, diagrams, step-by-step working, and teacher mark annotations).\n\n" +
  "GRADING & ACCURACY INSTRUCTIONS:\n" +
  "1. Thoroughly examine every page of the answer sheet, including cover page mark grids, handwritten text, step-by-step math/physics/chemistry derivations, diagrams, graphs, and teacher tick marks or corrections.\n" +
  "2. Verify student identity (Name, Roll Number, Class/Section, Subject, Exam Title) directly from the cover page or header of the answer sheet.\n" +
  "3. Match each answered question precisely to its question number in the Question Paper.\n" +
  "4. Calculate exact marks for each Section (e.g. Section A, B, C, D, E) by summing the marks awarded to each question within that section.\n" +
  "5. Double-check total marks obtained. If the total recorded on the cover page differs from the itemized section total, record both accurately and explain the discrepancy in the 'footnote' field.\n" +
  "6. Provide specific, detailed analysis in Strengths, Areas for Improvement, and Actionable Recommendations by referencing specific question numbers (e.g. Q12, Q24) or sub-topics (e.g. 'Derivation of Lens Maker Formula in Q28'). Avoid generic praise or vague criticism.\n\n" +
  "Instructions for output JSON fields:\n" +
  "- studentName: Student's full name from answer sheet if visible (e.g. 'Kanimitha M.'), otherwise 'Student'.\n" +
  "- gradeSection: Grade and section e.g. 'Grade XII - Harmony'.\n" +
  "- subject: Subject title and code, e.g. 'Physics (042)'.\n" +
  "- examTitle: Exam title, e.g. 'Cumulative Examination 2026-27'.\n" +
  "- dateOfExam: Date of examination e.g. 'June 1, 2026' or date on sheet.\n" +
  "- totalMaxMarks: Total maximum marks for the paper (e.g. 70).\n" +
  "- totalMarksObtained: Total marks recorded on cover page / overall.\n" +
  "- evaluatedTotalMarks: Sum of marks evaluated across all sections.\n" +
  "- summaryPerformanceLevel: Concise overall performance summary.\n" +
  "- footnote: Clear note if evaluated section sum differs from cover total. Set to empty string if no discrepancy.\n" +
  "- sections: Array of section evaluations with sectionName, questionType, totalMarks, obtainedMarks, performanceLevel.\n" +
  "- strengths: Array of 3-5 objects with { title, detail } giving concrete evidence from specific questions.\n" +
  "- areasForImprovement: Array of 3-5 objects with { title, detail } identifying precise conceptual or presentation errors.\n" +
  "- actionableRecommendations: Array of 3-5 objects with { title, detail } providing step-by-step guidance for improvement.\n";

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
