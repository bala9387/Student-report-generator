/* Gemini-backed answer-sheet evaluator (staff tool).
 *
 * Given a syllabus, a question paper and a student's written answer sheet
 * (each as text or an uploaded PDF/image), this asks Gemini to grade the
 * answers against the paper and return a STRUCTURED JSON report. The API key
 * lives only in GEMINI_API_KEY (server-side env var) and is never sent to the
 * browser. Nothing here is specific to Express or Netlify.
 */

// Node 18+ has a global fetch, which is all we need.
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

// hard caps so one request can't blow past the serverless payload limit
const MAX_FILE_BYTES = 12 * 1024 * 1024;      // ~12 MB per file (base64-decoded)
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
  "You are a strict but fair senior examiner at Akshara Academy grading a " +
  "Grade XII student's exam. You are given three inputs: the SYLLABUS, the " +
  "QUESTION PAPER, and the student's WRITTEN ANSWER SHEET (which may be a " +
  "photo or scan of handwriting). Read the answer sheet carefully, match each " +
  "answer to its question, and evaluate it against the question paper and " +
  "syllabus.\n\n" +
  "Rules:\n" +
  "- Award marks per question based on correctness, completeness and relevance " +
  "to the syllabus. If the question paper states marks for a question, use " +
  "them as the maximum; otherwise infer a sensible maximum.\n" +
  "- If an answer is missing or unreadable, award 0 and say so in the remarks.\n" +
  "- Be specific in remarks: name what was correct, what was wrong or missing.\n" +
  "- Do not invent answers the student did not write.\n" +
  "- If the student's name or roll number is visible on the answer sheet, " +
  "capture it; otherwise leave it blank.\n" +
  "- Base every number only on what you actually see; never fabricate marks.";

// Structured-output schema — Gemini returns JSON matching this shape, so the
// frontend can render it safely without parsing free-form text.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    studentName: { type: "string" },
    rollNo: { type: "string" },
    subject: { type: "string" },
    examTitle: { type: "string" },
    totalMarksAwarded: { type: "number" },
    totalMaxMarks: { type: "number" },
    percentage: { type: "number" },
    grade: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string" },
          question: { type: "string" },
          maxMarks: { type: "number" },
          marksAwarded: { type: "number" },
          remarks: { type: "string" }
        },
        required: ["number", "maxMarks", "marksAwarded", "remarks"]
      }
    },
    strengths: { type: "array", items: { type: "string" } },
    areasForImprovement: { type: "array", items: { type: "string" } },
    overallFeedback: { type: "string" }
  },
  required: ["totalMarksAwarded", "totalMaxMarks", "questions", "overallFeedback"]
};

// each input is { text } or { mimeType, data(base64) }; label tells Gemini which is which
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
  // base64 length * 3/4 ≈ decoded bytes
  const bytes = Math.floor(String(input.data).length * 0.75);
  if (bytes > MAX_FILE_BYTES) throw badRequest(label + ': file too large (max 12 MB)');
}

/* inputs: { syllabus, questionPaper, answerPaper, notes }
 *   syllabus / questionPaper / answerPaper: { text } OR { mimeType, data }
 *   notes: optional extra instructions (string) */
async function generateReport(inputs) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { const e = new Error('GEMINI_API_KEY is not configured on the server.'); e.status = 500; throw e; }

  const answer = inputs.answerPaper;
  if (!answer || (!answer.text && !answer.data)) {
    throw badRequest('An answer sheet (text or file) is required.');
  }
  validateFile(inputs.syllabus, 'Syllabus');
  validateFile(inputs.questionPaper, 'Question paper');
  validateFile(inputs.answerPaper, 'Answer sheet');

  const parts = [{ text: SYSTEM_PROMPT }];
  Array.prototype.push.apply(parts, partsFor("SYLLABUS", inputs.syllabus));
  Array.prototype.push.apply(parts, partsFor("QUESTION PAPER", inputs.questionPaper));
  Array.prototype.push.apply(parts, partsFor("STUDENT WRITTEN ANSWER SHEET", inputs.answerPaper));
  if (inputs.notes && inputs.notes.trim()) {
    parts.push({ text: "\n===== ADDITIONAL INSTRUCTIONS FROM STAFF =====\n" + inputs.notes.trim() });
  }
  parts.push({ text: "\nNow produce the structured evaluation report." });

  const body = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const res = await fetch(ENDPOINT(MODEL(), key), {
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

  let data;
  try { data = JSON.parse(raw); } catch (e) { throw new Error("Unexpected response from Gemini."); }

  const cand = data.candidates && data.candidates[0];
  const textOut = cand && cand.content && cand.content.parts &&
    cand.content.parts.map(function (p) { return p.text || ""; }).join("");
  if (!textOut) {
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    throw new Error(blocked ? ("Request blocked: " + blocked) : "Gemini returned no content.");
  }

  let report;
  try { report = JSON.parse(textOut); }
  catch (e) { throw new Error("Could not parse the evaluation. Please try again."); }

  return { report: report, model: MODEL() };
}

module.exports = { generateReport };
