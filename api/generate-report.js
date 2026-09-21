const gemini = require('../lib/geminiReport.js');
const tracker = require('../lib/apiTracker.js');
const authToken = require('../lib/authToken.js');

const PARSE_PROMPT = `You are a universal question paper parser. Given raw text from a question paper, return a strictly valid JSON object with the paper's complete structure.

RULES:
1. Header: Detect school name, exam title, date, grade/class, total marks, subject, duration. Each must be a separate field. If missing, use "".
2. Sections: Find ALL sections (Section A/B/C/D/E, Part A/B, etc). If no section headers exist, put all questions under one section.
3. shuffleType: "options" for MCQ sections, "questions" for short/long answer sections, "none" for case-based/passage sections.
4. CRITICAL - Extract EVERY question: Each question must have qNo (integer), text (full question), marks (string), options (array of {label, text} objects for MCQs, empty [] for non-MCQs), orText (alternative question text or null).
5. MCQ options: Each option = {"label": "a", "text": "the option text"}. Labels: a, b, c, d. NEVER leave text empty!
6. Math/Science: Use LaTeX in $...$ for formulas. E.g. $\\vec{E}$, $\\frac{1}{2}mv^2$, $\\theta = 30°$. Reconstruct missing symbols from context.
7. DO NOT skip any questions. The total question count must match the original paper.

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.`;

// responseSchema forces Gemini to produce all required fields
const PARSE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    schoolName: { type: "STRING" },
    examTitle: { type: "STRING" },
    date: { type: "STRING" },
    grade: { type: "STRING" },
    marks: { type: "STRING" },
    subject: { type: "STRING" },
    duration: { type: "STRING" },
    instructions: { type: "ARRAY", items: { type: "STRING" } },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
          shuffleType: { type: "STRING" },
          marksPerQ: { type: "STRING" },
          questions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                qNo: { type: "INTEGER" },
                text: { type: "STRING" },
                marks: { type: "STRING" },
                options: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      label: { type: "STRING" },
                      text: { type: "STRING" }
                    },
                    required: ["label", "text"]
                  }
                },
                orText: { type: "STRING", nullable: true }
              },
              required: ["qNo", "text", "marks", "options"]
            }
          }
        },
        required: ["name", "shuffleType", "questions"]
      }
    }
  },
  required: ["schoolName", "examTitle", "sections"]
};

async function callGeminiParsePaper(apiKey, model, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: PARSE_PROMPT },
        { text: "Here is the raw text extracted from the question paper:\n\n---\n" + text.slice(0, 80000) + "\n---" }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 60000,
      responseMimeType: "application/json",
      responseSchema: PARSE_RESPONSE_SCHEMA
    }
  };

  console.log('[parse-paper] Using model:', model);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[parse-paper] Gemini error with model ' + model + ':', response.status, errBody.slice(0, 500));
    const err = new Error('Gemini API error: ' + response.status);
    err.status = response.status;
    err.body = errBody;
    throw err;
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    throw new Error('No valid response from Gemini (model: ' + model + ')');
  }

  const rawJson = candidate.content.parts.map(p => p.text || '').join('');
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e1) {
    const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim());
    } else {
      throw new Error('Invalid JSON from Gemini');
    }
  }

  // Count total questions
  let totalQ = 0;
  if (parsed.sections && Array.isArray(parsed.sections)) {
    parsed.sections.forEach(s => { totalQ += (s.questions && Array.isArray(s.questions)) ? s.questions.length : 0; });
  }
  console.log('[parse-paper] Model', model, 'returned', (parsed.sections || []).length, 'sections,', totalQ, 'questions');

  return parsed;
}

async function handleParsePaper(req, res, body) {
  const { text } = body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'Missing or too short paper text. Upload a valid question paper.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  // Model fallback chain: PAPER_SETTER_MODEL → GEMINI_MODEL → gemini-3.8-flash → gemini-flash-latest
  const primaryModel = process.env.PAPER_SETTER_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash'].filter(m => m !== primaryModel);

  let parsed = null;
  let lastError = null;

  // Try primary model first
  try {
    parsed = await callGeminiParsePaper(apiKey, primaryModel, text);
  } catch (err) {
    console.error('[parse-paper] Primary model failed:', primaryModel, err.message);
    lastError = err;

    // Check for billing/rate limit errors before trying fallback
    if (err.status === 402 || (err.body && (err.body.includes('prepayment') || err.body.includes('billing')))) {
      return res.status(402).json({ error: 'API credits depleted. Please add funds or use a free-tier project.' });
    }
  }

  // If primary failed or returned 0 questions, try fallback models
  if (!parsed || !parsed.sections || parsed.sections.every(s => !s.questions || s.questions.length === 0)) {
    if (parsed) {
      console.log('[parse-paper] Primary model returned 0 questions, trying fallback models...');
    }
    for (const fallbackModel of fallbackModels) {
      try {
        const fallbackParsed = await callGeminiParsePaper(apiKey, fallbackModel, text);
        let fallbackQ = 0;
        if (fallbackParsed.sections) {
          fallbackParsed.sections.forEach(s => { fallbackQ += (s.questions || []).length; });
        }
        if (fallbackQ > 0) {
          parsed = fallbackParsed;
          console.log('[parse-paper] Fallback model', fallbackModel, 'succeeded with', fallbackQ, 'questions');
          break;
        }
      } catch (fallbackErr) {
        console.error('[parse-paper] Fallback model failed:', fallbackModel, fallbackErr.message);
        lastError = fallbackErr;
      }
    }
  }

  if (!parsed) {
    if (lastError && lastError.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
    }
    return res.status(502).json({ error: 'All models failed to parse the paper. ' + (lastError ? lastError.message : '') });
  }

  try {
    // Normalize: if questions at root level instead of sections
    if ((!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      parsed.sections = [{
        name: "Section A",
        description: "All Questions",
        shuffleType: parsed.questions.some(q => q.options && q.options.length > 0) ? "options" : "questions",
        marksPerQ: "1",
        questions: parsed.questions
      }];
    }

    if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return res.status(422).json({ error: 'Could not identify any questions or sections in the uploaded paper.' });
    }

    parsed.schoolName = parsed.schoolName || '';
    parsed.examTitle = parsed.examTitle || parsed.subject || 'Examination Question Paper';
    parsed.instructions = Array.isArray(parsed.instructions) ? parsed.instructions : [];

    parsed.sections.forEach(sec => {
      if (!sec.questions) sec.questions = [];
      const hasAnyOptions = sec.questions.some(q => q.options && q.options.length > 0);
      if (sec.shuffleType === 'options' && !hasAnyOptions) {
        sec.shuffleType = 'questions';
      } else if (!sec.shuffleType) {
        sec.shuffleType = hasAnyOptions ? 'options' : 'questions';
      }
      sec.questions.forEach((q, qIdx) => {
        if (!q.qNo) q.qNo = qIdx + 1;
        if (q.orText === undefined) q.orText = null;

        // Robust option normalization
        if (!Array.isArray(q.options)) {
          q.options = [];
        } else {
          q.options = q.options.map((opt, i) => {
            const defaultLabel = String.fromCharCode(97 + i);
            if (typeof opt === 'string') {
              const cleanText = opt.replace(/^[(\[]?[a-eA-E0-9][\.)\:\-\]]\s*/, '').trim();
              return { label: defaultLabel, text: cleanText || opt.trim() };
            } else if (opt && typeof opt === 'object') {
              const lbl = (opt.label || opt.key || defaultLabel).toString().toLowerCase().replace(/[\.)\:(\[\]]/g, '').trim();
              const text = opt.text !== undefined ? opt.text : (opt.value || opt.option || opt.content || '');
              return { label: lbl || defaultLabel, text: String(text).trim() };
            }
            return { label: defaultLabel, text: String(opt || '').trim() };
          });
        }
      });
    });

    return res.json({ ok: true, paper: parsed });
  } catch (err) {
    console.error('[parse-paper] Post-processing error:', err);
    return res.status(500).json({ error: 'Server error parsing paper: ' + err.message });
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};

  if (req.method === 'GET') {
    const data = tracker.getUsageData();
    if (query.checkHealth === '1' || (req.url && req.url.includes('checkHealth=1'))) {
      const health = await gemini.checkApiHealth();
      return res.status(200).json({ ...data, health });
    }
    return res.status(200).json(data);
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    // Check if this is a Question Paper parsing request
    if (query.action === 'parse-paper' || (body && body.action === 'parse-paper') || (req.url && req.url.includes('parse-paper'))) {
      return await handleParsePaper(req, res, body);
    }

    // Only administrative tracking actions require teacher/admin auth on remote deployments
    if (body.action) {
      const isLocal = !origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
      if (!isLocal) {
        const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
        const authInfo = authToken.verify(authHeader);
        if (!authInfo) {
          return res.status(401).json({ error: 'Admin authentication required.' });
        }
      }
    }

    if (body.action === 'updateCap') {
      const ok = tracker.updateSpendCap(body.cap);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid spend cap value' });
    }

    if (body.action === 'updateSpend') {
      const ok = tracker.updateCurrentSpend(body.spend);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid current spend value' });
    }

    if (body.action === 'updateTotal') {
      const ok = tracker.updateTotalRequests(body.total);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid total requests value' });
    }

    if (body.action === 'clearLogs') {
      tracker.clearLogs(body.resetCounters === true);
      return res.status(200).json({ ok: true, data: tracker.getUsageData() });
    }

    const result = await gemini.generateReport({
      syllabus: body.syllabus,
      questionPaper: body.questionPaper,
      answerPaper: body.answerPaper,
      notes: body.notes
    });

    if (result && !result.error) {
      const rep = result.report || {};
      const subjectDesc = ((rep.subject ? rep.subject : '') + (rep.studentName ? (' - ' + rep.studentName) : '')).trim() || 'AI Evaluation';
      tracker.recordApiCall({
        cost: 0.12,
        subject: subjectDesc,
        model: result.model || 'gemini-flash-latest'
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    const isDepleted = (err.message && err.message.includes('prepayment')) || err.status === 402;
    tracker.recordApiCall({
      cost: 0,
      subject: "AI Evaluation",
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      tokens: 0,
      status: isDepleted ? 'Credits Depleted' : (err.status === 429 ? 'Rate Limited' : 'Failed')
    });
    return res.status(err.status || 502).json({ error: err.message || 'Report generation error on server' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};
