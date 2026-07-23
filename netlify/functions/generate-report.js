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

  // staff-only: reject anyone without a valid login token
  const bearer = (event.headers &&
    (event.headers.authorization || event.headers.Authorization) || '').replace(/^Bearer\s+/i, '');
  if (!token.verify(bearer || body.token)) {
    return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not signed in. Please log in again.' }) };
  }

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
