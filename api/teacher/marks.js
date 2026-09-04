const teacherApi = require('../../lib/teacherApi.js');
const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

const GRADE_SHEETS = {
  "10": "1am96_5JYsPAzLM4XZ-J4pIiUCizvInuk0AqxO1PAyUY",
  "11": "1cDEw2sfKvxHNol-o4ZNrXZmapM75iHYzHIi71plO-7Y",
  "12": "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50"
};

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authInfo = requireAuth(req);
  if (!authInfo) return res.status(401).json({ error: 'Unauthorized: Staff login required' });

  const teacherUser = (authInfo.user || '').toLowerCase().trim();
  const q = req.query || {};

  const rawGrade = String(q.grade || '12').trim();
  let grade = '12';
  if (rawGrade === '10' || rawGrade === 'X') grade = '10';
  else if (rawGrade === '11' || rawGrade === 'XI') grade = '11';

  // 1. ACTION: Export Full Class Excel (Master Admin Only)
  if (q.action === 'export-excel') {
    if (teacherUser !== 'aksharaacademy') {
      return res.status(403).json({ error: 'Access denied: Only Master Administrator can export full class marks.' });
    }

    const sheetId = GRADE_SHEETS[grade];
    if (!sheetId) {
      return res.status(404).json({ error: `Sheet not found for Grade ${grade}` });
    }

    try {
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets export returned status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Class_${grade}_Complete_Mark_Sheet.xlsx"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    } catch (err) {
      console.error('Export Excel error:', err);
      return res.status(500).json({ error: 'Failed to export class Excel sheet: ' + err.message });
    }
  }

  // 2. ACTION: Request Live Google Sheet Link (Master Admin Only)
  if (q.action === 'sheet-link') {
    if (teacherUser !== 'aksharaacademy') {
      return res.status(403).json({ error: 'Access denied: Only Master Administrator can access live Google Sheet.' });
    }

    const sheetId = GRADE_SHEETS[grade];
    if (!sheetId) {
      return res.status(404).json({ error: `Sheet not found for Grade ${grade}` });
    }

    return res.status(200).json({
      ok: true,
      grade: grade,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
    });
  }

  // 3. DEFAULT ACTION: Fetch Marks for Teacher Portal
  const accInfo = teacherUser && teacherAccounts.ACCOUNTS && teacherAccounts.ACCOUNTS[teacherUser];
  const allowedCodes = accInfo ? accInfo.allowedCodes : null;
  const allowedStreams = accInfo ? accInfo.allowedStreams : null;

  try {
    const stream = q.stream;
    const exam = q.exam;
    if (stream === "Rankwise" && teacherUser !== "aksharaacademy") {
      return res.status(403).json({ error: "Access denied: Rankwise view is restricted to Master Administrator." });
    }
    const data = await teacherApi.getTeacherData(stream, exam, grade);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
