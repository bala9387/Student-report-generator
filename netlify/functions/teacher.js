const teacherApi = require('../../lib/teacherApi.js');
const authToken = require('../../lib/authToken.js');

function requireAuth(event) {
  const hdr = event.headers.authorization || event.headers.Authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  return authToken.verify(token);
}

exports.handler = async (event) => {
  const path = event.path || '';

  // Auth endpoint for Login
  if (path.endsWith('/teacher-auth') || path.endsWith('/auth')) {
    if (event.httpMethod !== 'POST') return { statusCode: 450, body: 'Method Not Allowed' };
    try {
      const body = JSON.parse(event.body || '{}');
      const user = (body.user || '').trim();
      const pass = (body.pass || '').trim();
      const expectedUser = process.env.ADMIN_USER || 'aksharaacademy';
      const expectedPass = process.env.ADMIN_PASS || 'aksharaacademy@98?';

      if (user.toLowerCase() === expectedUser.toLowerCase() && pass === expectedPass) {
        const expires = Date.now() + 8 * 60 * 60 * 1000;
        const token = authToken.sign(expires);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: true, token, expires })
        };
      }
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid username or password' })
      };
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
    }
  }

  // All teacher endpoints require authentication
  if (!requireAuth(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Staff login required' })
    };
  }

  try {
    if (path.endsWith('/teacher/marks')) {
      const stream = event.queryStringParameters && event.queryStringParameters.stream;
      const exam = event.queryStringParameters && event.queryStringParameters.exam;
      const data = await teacherApi.getTeacherData(stream, exam);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (path.endsWith('/teacher/pe-analysis')) {
      const data = await teacherApi.getPeAnalysis();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (path.endsWith('/teacher/save')) {
      if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
      const body = JSON.parse(event.body || '{}');
      let result;
      if (body.stream === 'PE - Analysis') {
        result = await teacherApi.updatePeTotals(body.updates);
      } else {
        result = await teacherApi.updateStudentMarks(body.stream, body.exam, body.updates);
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Endpoint not found' }) };
  } catch (err) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
