const gemini = require('../../lib/geminiReport.js');
const token = require('../../lib/authToken.js');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid request' }) }; }

  // AI report generation endpoint - open access

  try {
    const result = await gemini.generateReport({
      syllabus: body.syllabus,
      questionPaper: body.questionPaper,
      answerPaper: body.answerPaper,
      notes: body.notes
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: err.status || 502, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Report generation failed' }) };
  }
};
