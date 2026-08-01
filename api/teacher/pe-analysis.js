const teacherApi = require('../../lib/teacherApi.js');
const authToken = require('../../lib/authToken.js');

function requireAuth(req) {
  const hdr = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  return authToken.verify(token);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authInfo = requireAuth(req);
  if (!authInfo) return res.status(401).json({ error: 'Unauthorized: Staff login required' });

  const q = req.query || {};
  const grade = q.grade || '12';

  try {
    const data = await teacherApi.getPeAnalysis(grade);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
