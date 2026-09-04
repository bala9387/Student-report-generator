const teacherApi = require('../../lib/teacherApi.js');
const api = require('../../lib/reportApi.js');
const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

function requireAuth(req) {
  const hdr = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  return authToken.verify(token);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = origin === 'https://ksraksharaacademy.vercel.app'
    || origin.endsWith('.vercel.app')
    || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://ksraksharaacademy.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authInfo = requireAuth(req);
  if (!authInfo) return res.status(401).json({ error: 'Unauthorized: Staff login required' });

  const teacherUser = authInfo.user || '';
  const accInfo = teacherUser && teacherAccounts.ACCOUNTS && teacherAccounts.ACCOUNTS[teacherUser];
  const allowedStreams = accInfo ? accInfo.allowedStreams : null;

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const grade = body.grade || (req.query && req.query.grade) || '12';
    const allowedCodes = accInfo ? teacherAccounts.getTeacherAllowedCodes(accInfo, grade) : null;

    // --- Force-refresh action: bust cache and re-fetch fresh data from Google Sheets ---
    if (body.action === 'refresh') {
      api.bustCache(grade);
      await api.getData(grade);
      return res.status(200).json({
        ok: true,
        message: 'Data refreshed from Google Sheets successfully.',
        grade,
        timestamp: new Date().toISOString()
      });
    }

    // --- Normal save action ---
    let result;
    if (body.stream === 'PE - Analysis' || body.stream === 'Rankwise') {
      result = await teacherApi.updatePeTotals(body.updates, grade);
    } else if (body.stream === 'Mentor Report') {
      result = await teacherApi.updateMentorLinks(body.exam, body.updates, grade);
    } else {
      result = await teacherApi.updateStudentMarks(body.stream, body.exam, body.updates, allowedCodes, allowedStreams, grade);
    }

    api.bustCache(grade);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
