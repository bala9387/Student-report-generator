const api = require('../lib/reportApi.js');
const { generateSectionLandscapePdf } = require('../lib/sectionPdf.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const q = req.query || {};
    const grade = q.grade || '12';
    const section = q.section || 'H';
    const exam = q.mode || q.exam || 'TE 1';
    const fresh = q.fresh === '1' || !!q._t;

    const r = await api.getLeaderboard('section', section, grade, exam, fresh);
    if (!r || r.status !== 200 || !r.body) {
      return res.status(r ? r.status : 500).send('Failed to load section data');
    }

    const pdf = generateSectionLandscapePdf(r.body);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.setHeader('Content-Length', pdf.buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.end(pdf.buffer);
  } catch (err) {
    console.error('section-pdf error:', err);
    return res.status(500).send('Error generating section PDF: ' + (err.message || err));
  }
};
