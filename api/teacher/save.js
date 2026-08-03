const teacherApi = require('../../lib/teacherApi.js');
const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

function requireAuth(req) {
  const hdr = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  return authToken.verify(token);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authInfo = requireAuth(req);
  if (!authInfo) return res.status(401).json({ error: 'Unauthorized: Staff login required' });

  const teacherUser = authInfo.user || '';
  const accInfo = teacherUser && teacherAccounts.ACCOUNTS && teacherAccounts.ACCOUNTS[teacherUser];
  const allowedCodes = accInfo ? accInfo.allowedCodes : null;
  const allowedStreams = accInfo ? accInfo.allowedStreams : null;

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const grade = body.grade || '12';
    let result;

    if (body.stream === 'PE - Analysis' || body.stream === 'Rankwise') {
      result = await teacherApi.updatePeTotals(body.updates, grade);
    } else if (body.stream === 'Mentor Report') {
      result = await teacherApi.updateMentorLinks(body.exam, body.updates, grade);
    } else {
      result = await teacherApi.updateStudentMarks(body.stream, body.exam, body.updates, allowedCodes, allowedStreams, grade);
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
