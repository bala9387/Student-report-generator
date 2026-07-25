/* Multi-provider answer-sheet evaluator (Gemini + Kimi / Moonshot AI).
 * Load balances evaluations across available API keys and automatically fails over
 * if one API hits rate limits or errors.
 */

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

const MAX_FILE_BYTES = 12 * 1024 * 1024;      // ~12 MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
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
  "- footnote: Optional note if evaluated total differs slightly from recorded cover total (e.g. '*Note: Final grade recorded on cover page is 42/70. Evaluated total across sections sums to 46.5.'). If no discrepancy, set to empty string.\n" +
  "- sections: Group questions by section (e.g. Section A, Section B, Section C, Section D, Section E). For each section provide:\n" +
  "    - sectionName: e.g. 'Section A'\n" +
  "    - questionType: e.g. 'Multiple Choice & Assertion-Reason', 'Short Answer I', 'Short Answer II', 'Case-Based Questions', 'Long Answer / Derivations'\n" +
  "    - totalMarks: Total marks in this section\n" +
  "    - obtainedMarks: Marks scored in this section\n" +
  "    - performanceLevel: Brief rating like 'Needs Significant Improvement', 'Outstanding (100%)', 'Average', 'Very Good'\n" +
  "- strengths: Array of 3 to 5 objects with { title, detail } highlighting key strengths.\n" +
  "- areasForImprovement: Array of 3 to 5 objects with { title, detail } highlighting key weaknesses.\n" +
  "- actionableRecommendations: Array of 3 to 5 objects with { title, detail } giving concrete advice.\n";

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
async function generateWithGemini(inputs, key) {
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
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL(), key), {
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

  return { report: JSON.parse(textOut), model: "Gemini (" + GEMINI_MODEL() + ")" };
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
  console.log(`[Report Engine] Evaluating request #${requestCount} with Gemini...`);
  return await generateWithGemini(inputs, geminiKey);
}

module.exports = { generateReport };
