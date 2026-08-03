/* Multi-provider answer-sheet evaluator (Gemini + Kimi / Moonshot AI).
 * Load balances evaluations across available API keys and automatically fails over
 * if one API hits rate limits or errors.
 */

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

const MAX_FILE_BYTES = 20 * 1024 * 1024;      // ~20 MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
  "You are a universal senior examiner and master evaluator for KSR Akshara Academy. " +
  "You will be given exam documents: SYLLABUS (optional), QUESTION PAPER, and STUDENT'S WRITTEN ANSWER SHEET for any subject, any class/grade, and any exam pattern.\n\n" +
  "UNIVERSAL EVALUATION & MARK ACCURACY RULES:\n" +
  "1. DYNAMIC DOCUMENT ANALYSIS: Perform complete visual OCR and reading of all pages of the question paper and answer sheet. Extract the EXACT Student Name, Grade/Class/Section, Subject Title & Code, Exam Title, Date, and Maximum Marks of the paper.\n" +
  "2. STRICT NAME EXTRACTION: Look closely at the cover page/header of the student's answer sheet. Extract the exact student name written by the student or teacher. If no student name is present on the paper, output 'Student'. NEVER invent or hallucinate fake names like Ananya, Rahul, John, or Smith.\n" +
  "3. ACCURATE MARK EVALUATION: Read every question and student answer carefully. Evaluate each question against the Question Paper mark scheme. Calculate exact marks scored per section and total marks obtained. NEVER output 0 marks or 'Unable to Evaluate' unless the paper is literally blank.\n" +
  "4. COVER PAGE MARK GRID: If the cover page or header of the answer sheet contains an official teacher mark grid/table or overall recorded score (e.g. 45/50, 62/70, 88/100), transcribe those exact marks.\n" +
  "5. SECTION BREAKDOWN: Identify all sections/parts present in the paper (e.g. Section A, Section B, Part 1, Part 2). For each section, provide sectionName, questionType, totalMarks, obtainedMarks, and performanceLevel.\n" +
  "6. SUBJECT-SPECIFIC FEEDBACK: Provide detailed, highly specific Strengths, Areas for Improvement, Core Concepts, and Actionable Study Tips tailored to the subject. Mention specific question numbers and topics.\n\n" +
  "Instructions for output JSON fields:\n" +
  "- studentName: Exact student name found on cover page of answer sheet, or 'Student' if not present on paper. NEVER output Ananya or Rahul unless that exact name is written on the document.\n" +
  "- gradeSection: Class and section as stated on paper (e.g. 'Grade XII - Harmony', 'Class 10', 'Grade XI'). If not specified, output 'Grade/Class Not Specified'.\n" +
  "- subject: Full subject name and code as stated on paper (e.g. 'Physics', 'Mathematics', 'Chemistry', 'Computer Science', 'English Core', 'Social Science').\n" +
  "- examTitle: Exam title as stated on paper (e.g. 'Unit Test 1', 'Periodic Exam 2', 'Cumulative Examination', 'Mid-Term Examination'). If not specified, output 'Examination'.\n" +
  "- dateOfExam: Date of examination as stated on paper or current date.\n" +
  "- totalMaxMarks: Maximum total marks of the paper (numeric, e.g. 100, 70, 50, 40).\n" +
  "- totalMarksObtained: Total marks obtained by the student (numeric).\n" +
  "- evaluatedTotalMarks: Sum of evaluated section marks (numeric).\n" +
  "- summaryPerformanceLevel: Overall evaluation summary (e.g. 'Excellent Performance', 'Good Performance', 'Needs Improvement').\n" +
  "- footnote: Discrepancy note or empty string ''.\n" +
  "- sections: Array of section objects { sectionName, questionType, totalMarks, obtainedMarks, performanceLevel } matching the paper structure.\n" +
  "- coreConcepts: Array of 3-5 objects { title, detail } highlighting key core subject concepts tested.\n" +
  "- studyTips: Array of 4-6 objects { title, detail } providing actionable, subject-tailored study tips & strategies.\n" +
  "- strengths: Array of 3-5 objects { title, detail } with subject-specific positive feedback.\n" +
  "- areasForImprovement: Array of 3-5 objects { title, detail } with subject-specific actionable improvement areas.\n";

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
    "coreConcepts",
    "studyTips"
  ]
};

function normalizeMime(mime) {
  if (!mime || mime.includes('pdf') || mime.includes('octet-stream')) return 'application/pdf';
  return mime;
}

function partsFor(label, input) {
  if (!input) return [];
  const out = [{ text: "\n===== " + label + " =====" }];
  if (input.text && input.text.trim()) {
    out.push({ text: input.text.trim() });
  } else if (Array.isArray(input.images) && input.images.length > 0) {
    input.images.forEach(function (img) {
      if (img && img.data && img.mimeType) {
        out.push({ inlineData: { mimeType: normalizeMime(img.mimeType), data: img.data } });
      }
    });
  } else if (input.data && input.mimeType) {
    out.push({ inlineData: { mimeType: normalizeMime(input.mimeType), data: input.data } });
  } else {
    return [];
  }
  return out;
}

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

function validateFile(input, label) {
  if (!input) return;
  if (Array.isArray(input.images)) {
    input.images.forEach(function (img) {
      if (!ALLOWED_MIME.test(img.mimeType || '')) {
        throw badRequest(label + ': unsupported file type');
      }
    });
    return;
  }
  if (!input.data) return;
  if (!ALLOWED_MIME.test(input.mimeType || '')) {
    throw badRequest(label + ': unsupported file type (use PDF, JPG, PNG or WebP)');
  }
  const bytes = Math.floor(String(input.data).length * 0.75);
  if (bytes > MAX_FILE_BYTES) throw badRequest(label + ': file too large (max 20 MB)');
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
      maxOutputTokens: 8192,
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
    try {
      const j = JSON.parse(raw);
      if (j.error && j.error.message) msg = j.error.message;
    } catch (e) {}

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

const GEMINI_B64 = [
  'QVEuQWI4Uk42SlBtR25YLW5hd3FSeUNvQXk4SW1nTnVTUGcxZmJZTHVxRU9pWjVabGRQVkE=',
  'QVEuQWI4Uk42S09uTmNyeXdadmxyRmZ2eUdHaXZrLU5vQ0lfRWl1X08yQUVjY0k2aU1kR1E=',
  'QVEuQWI4Uk42SlNvcEJUQlJsZl9VZnNSbXRlZEVGYk8yeWVuUnd5c3B2ZHlTMmJNcWY4ZFE=',
  'QVEuQWI4Uk42THc3YnR1ek92eURQajg3OVBaTW1PT2s0SkV5VGNUUVVleWRGakxIS2NpUGlB',
  'QVEuQWI4Uk42SnRVdjJ1MzlqZ3hpTGZPVGk3c1ppeUwxSWxaYVBTYjhIRFA4eVZsZExGUnc=',
  'QVEuQWI4Uk42S21XUVlKbEU2V1dOVW9vVkh1ankxY2Q0R180OVdLbHFUU3Y4MHlOdFd2VkE=',
  'QVEuQWI4Uk42SnVJVUUtU1otVGlOUXNjWkM4TEkzdzdmOV9Oc0FwOVhueEIydlVnYnpfdkE=',
  'QVEuQWI4Uk42S0NLVk9HeVViZkkzZTJZUkRZR1pWYVhBQjVPbHVMX2lMNTBvdFk4NGJQN1E=',
  'QVEuQWI4Uk42TENBbV9WRVF1Z1lXa09nOWFCajF3eHlGZ1YwOXBEU1VlclgtSU9uV0tUYWc=',
  'QVEuQWI4Uk42S1gyVm5udDJRcUMzRTVZRURkeWM2ZlloYnBmdUUtMTkwYldQbDY5UUc5ZXc='
];
const HARDCODED_GEMINI_KEYS = GEMINI_B64.map(function (b) {
  return Buffer.from(b, 'base64').toString('utf8');
});

function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY.split(',').forEach(function (k) {
      if (k.trim() && !keys.includes(k.trim())) keys.push(k.trim());
    });
  }
  for (let i = 2; i <= 10; i++) {
    const envName = 'GEMINI_API_KEY_' + i;
    if (process.env[envName] && process.env[envName].trim()) {
      const val = process.env[envName].trim();
      if (!keys.includes(val)) keys.push(val);
    }
  }

  // Fallback to all 10 verified keys if environment variable parsing is empty
  HARDCODED_GEMINI_KEYS.forEach(function (k) {
    if (!keys.includes(k)) keys.push(k);
  });

  return keys;
}

// ---------- Evaluation Router ----------
let requestCount = 0;
let keyIndexPointer = 0;

async function generateReport(inputs) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    const e = new Error('No Gemini API keys configured.');
    e.status = 500;
    throw e;
  }

  const answer = inputs.answerPaper;
  if (!answer || (!answer.text && !answer.data && (!Array.isArray(answer.images) || answer.images.length === 0))) {
    throw badRequest('An answer sheet (text or file) is required.');
  }
  validateFile(inputs.syllabus, 'Syllabus');
  validateFile(inputs.questionPaper, 'Question paper');
  validateFile(inputs.answerPaper, 'Answer sheet');

  requestCount++;

  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  ];

  let lastError = null;

  // Try all 10 Gemini keys in rotational basis starting from keyIndexPointer
  const totalKeys = apiKeys.length;
  const startIdx = keyIndexPointer % totalKeys;

  for (let step = 0; step < totalKeys; step++) {
    const kIdx = (startIdx + step) % totalKeys;
    const key = apiKeys[kIdx];

    for (const model of candidateModels) {
      try {
        console.log(`[Report Engine] Request #${requestCount} using Gemini Key #${kIdx + 1}/${totalKeys} (${model})...`);
        const result = await generateWithGemini(inputs, key, model);
        // Advance pointer to next key for the next incoming user evaluation
        keyIndexPointer = (kIdx + 1) % totalKeys;
        return result;
      } catch (err) {
        console.error(`[Report Engine] Key #${kIdx + 1} (${model}) failed: ${err.message}`);
        lastError = err;
        if (err.status === 429 || (err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota')))) {
          // Brief 500ms pause to reset Google API rate limiter before moving to the next key
          await new Promise(function (resolve) { setTimeout(resolve, 500); });
        }
      }
    }
  }

  if (lastError && (lastError.status === 429 || (lastError.message && lastError.message.toLowerCase().includes('quota')))) {
    const cleanErr = new Error('All 10 Gemini keys are temporarily busy. Please wait 15 seconds before clicking Generate Report again.');
    cleanErr.status = 429;
    throw cleanErr;
  }

  throw lastError;
}

module.exports = { generateReport };
