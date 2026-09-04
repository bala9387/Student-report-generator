const teacherApi = require('../../lib/teacherApi.js');
const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

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
      const authRes = teacherAccounts.verifyTeacherLogin(body.user, body.pass);

      if (authRes && authRes.ok) {
        const expires = Date.now() + 8 * 60 * 60 * 1000;
        const token = authToken.sign(expires, authRes.user);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: true, token, expires, teacher: authRes })
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
  const authInfo = requireAuth(event);
  if (!authInfo) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Staff login required' })
    };
  }

  const teacherUser = authInfo.user || '';
  const accInfo = (teacherUser && teacherAccounts.ACCOUNTS[teacherUser]);
  const allowedCodes = accInfo ? accInfo.allowedCodes : null;
  const allowedStreams = accInfo ? accInfo.allowedStreams : null;

  try {
    const qp = event.queryStringParameters || {};
    const grade = qp.grade;

    if (path.endsWith('/teacher/marks')) {
      const stream = qp.stream;
      const exam = qp.exam;
      const data = await teacherApi.getTeacherData(stream, exam, grade);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (path.endsWith('/teacher/pe-analysis')) {
      const data = await teacherApi.getPeAnalysis(grade);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }

    if (path.endsWith('/teacher/save')) {
      if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
      const body = JSON.parse(event.body || '{}');
      const targetGrade = body.grade || grade;
      let result;
      if (body.stream === 'PE - Analysis' || body.stream === 'Rankwise') {
        result = await teacherApi.updatePeTotals(body.updates, targetGrade);
      } else if (body.stream === 'Mentor Report') {
        result = await teacherApi.updateMentorLinks(body.exam, body.updates, targetGrade);
      } else {
        const targetCodes = accInfo ? teacherAccounts.getTeacherAllowedCodes(accInfo, targetGrade) : allowedCodes;
        result = await teacherApi.updateStudentMarks(body.stream, body.exam, body.updates, targetCodes, allowedStreams, targetGrade);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }

    if (path.endsWith('/teacher/export-excel')) {
      const GRADE_SHEETS = {
        "10": "1am96_5JYsPAzLM4XZ-J4pIiUCizvInuk0AqxO1PAyUY",
        "11": "1cDEw2sfKvxHNol-o4ZNrXZmapM75iHYzHIi71plO-7Y",
        "12": "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50"
      };
      const rawGrade = String(grade || '12').trim();
      let g = '12';
      if (rawGrade === '10' || rawGrade === 'X') g = '10';
      else if (rawGrade === '11' || rawGrade === 'XI') g = '11';

      const sheetId = GRADE_SHEETS[g];
      if (!sheetId) {
        return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Sheet not found for Grade ${g}` }) };
      }

      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets export returned status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Class_${g}_Complete_Mark_Sheet.xlsx"`
        },
        body: buffer.toString('base64')
      };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Endpoint not found' }) };
  } catch (err) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
