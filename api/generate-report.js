const gemini = require('../lib/geminiReport.js');
const tracker = require('../lib/apiTracker.js');
const authToken = require('../lib/authToken.js');

const PARSE_PROMPT = `You are a universal question paper parser for school, high school, competitive exam, and university examinations across any educational board worldwide.

Your task: Given the raw text extracted from a question paper (exam/test paper), return a **strictly valid JSON** object representing the paper's complete structure.

RULES:
1. Header Detection: Detect the school/institution/university name, exam title, date, grade/class/semester, total marks, subject, and duration from the paper header. If any field is missing, use an empty string "" (or sensible fallback).
2. Sections Detection: Identify ALL sections in the paper. Sections may be named "Section A/B/C", "Part A/B/C", "Unit 1/2/3", "खण्ड क/ख", "பகுதி அ/ஆ", or any other convention.
   - If the paper has NO explicit section headers (e.g., slip tests or single-section papers), group all questions under a single section named "Section A" or "Questions".
3. Section Shuffle Classification:
   - "options" → ONLY if the section predominantly contains MCQs (multiple choice questions with options like a/b/c/d or A/B/C/D or i/ii/iii/iv or 1/2/3/4).
   - "questions" → if the section contains short answer, long answer, numerical, essay, or descriptive questions that can be reordered across sets.
   - "none" → if the section contains reading passages, case studies, source-based scenarios, or comprehension questions with dependent sub-parts that should NOT be reordered.
4. Non-MCQ & Subjective Papers: If the paper has NO MCQs (e.g., descriptive, university degree, essay, or numerical problem papers), classify those sections as "questions". Set "options": [] (empty array). NEVER invent or fabricate options if none exist in the original paper!
5. Question Extraction:
   - Extract every question with its sequential number (qNo: 1, 2, 3...), full text, and marks.
   - Sub-questions: If a question has sub-parts like (a), (b) or (i), (ii), keep them together in the question's "text" field so they stay as a single cohesive question unit.
   - Internal choice ("OR"): If a question provides an alternative choice (e.g., separated by "OR", "or", "अथवा", "அல்லது", "Either... or"), extract the alternative question into "orText".
   - Marks: Extract question marks (e.g., [2], [5], (10 marks), 13M) into the "marks" field as a clean number or string (e.g., "2", "5", "13").
6. Normalize MCQ option labels to lowercase single letters: a, b, c, d, e (even if original uses A/B/C/D, 1/2/3/4, i/ii/iii/iv).
7. Multilingual Support: If the paper is in a non-English language (Hindi, Tamil, French, Spanish, etc.), keep the question text, options, and section names in the original language. Only use English for the JSON keys.

RETURN FORMAT (strict JSON, no markdown code fences, no explanation):
{
  "schoolName": "string",
  "examTitle": "string", 
  "date": "string",
  "grade": "string",
  "marks": "string",
  "subject": "string",
  "duration": "string",
  "instructions": ["string array of general instructions"],
  "sections": [
    {
      "name": "Section A",
      "description": "short description like '10 Short Answer Questions of 2 marks each'",
      "shuffleType": "options | questions | none",
      "marksPerQ": "1",
      "questions": [
        {
          "qNo": 1,
          "text": "full question text",
          "marks": "2",
          "options": [],
          "orText": null
        }
      ]
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown code fences, no explanations, no extra text.`;

async function handleParsePaper(req, res, body) {
  const { text } = body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'Missing or too short paper text. Upload a valid question paper.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
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
      maxOutputTokens: 30000,
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[parse-paper] Gemini error:', response.status, errBody);
      if (response.status === 402 || errBody.includes('prepayment') || errBody.includes('billing')) {
        return res.status(402).json({ error: 'API credits depleted. Please add funds or use a free-tier project.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
      }
      return res.status(502).json({ error: 'Gemini API error: ' + response.status });
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      return res.status(502).json({ error: 'No valid response from Gemini.' });
    }

    const rawJson = candidate.content.parts.map(p => p.text || '').join('');
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e1) {
      const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          return res.status(502).json({ error: 'Gemini returned invalid JSON. Try again.' });
        }
      } else {
        return res.status(502).json({ error: 'Gemini returned invalid JSON. Try again.' });
      }
    }

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
        if (!q.options) q.options = [];
        if (q.orText === undefined) q.orText = null;
        q.options.forEach((opt, i) => {
          opt.label = String.fromCharCode(97 + i);
        });
      });
    });

    return res.json({ ok: true, paper: parsed });
  } catch (err) {
    console.error('[parse-paper] Error:', err);
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
