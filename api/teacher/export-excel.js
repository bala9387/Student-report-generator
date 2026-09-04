const authToken = require('../../lib/authToken.js');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Strict Authentication Check
  const authInfo = requireAuth(req);
  if (!authInfo || !authInfo.valid) {
    return res.status(401).json({ error: 'Unauthorized: Staff login required' });
  }

  // 2. Strict Admin Role Check — only Master Admin can export full class Excel
  const teacherUser = (authInfo.user || '').toLowerCase().trim();
  if (teacherUser !== 'aksharaacademy') {
    return res.status(403).json({ error: 'Access denied: Only Master Administrator can export full class marks.' });
  }

  try {
    const rawGrade = String(req.query.grade || '12').trim();
    let grade = '12';
    if (rawGrade === '10' || rawGrade === 'X') grade = '10';
    else if (rawGrade === '11' || rawGrade === 'XI') grade = '11';

    const sheetId = GRADE_SHEETS[grade];
    if (!sheetId) {
      return res.status(404).json({ error: `Sheet not found for Grade ${grade}` });
    }

    // 3. Server-side fetch from Google Sheets — client never sees the Google Sheet ID
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
};
