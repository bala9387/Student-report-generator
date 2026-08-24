const gemini = require('../lib/geminiReport.js');
const tracker = require('../lib/apiTracker.js');
const authToken = require('../lib/authToken.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  const origin = req.headers.origin || '';
  const allowed = origin === 'https://ksraksharaacademy.vercel.app'
    || origin.endsWith('.vercel.app')
    || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://ksraksharaacademy.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const data = tracker.getUsageData();
    return res.status(200).json(data);
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    // Require auth for ALL POST actions (admin + AI generation)
    const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const authInfo = authToken.verify(authHeader);
    if (!authInfo) {
      return res.status(401).json({ error: 'Authentication required. Please log in to the Teacher Portal first.' });
    }

    if (body.action === 'updateCap') {
      const ok = tracker.updateSpendCap(body.cap);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid spend cap value' });
    }

    if (body.action === 'updateSpend') {
      const ok = tracker.updateCurrentSpend(body.spend);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid current spend value' });
    }

    if (body.action === 'updateTotal') {
      const ok = tracker.updateTotalRequests(body.total);
      if (ok) return res.status(200).json({ ok: true, data: tracker.getUsageData() });
      return res.status(400).json({ error: 'Invalid total requests value' });
    }

    if (body.action === 'clearLogs') {
      tracker.clearLogs();
      return res.status(200).json({ ok: true, data: tracker.getUsageData() });
    }

    const result = await gemini.generateReport({
      syllabus: body.syllabus,
      questionPaper: body.questionPaper,
      answerPaper: body.answerPaper,
      notes: body.notes
    });

    if (result && !result.error) {
      tracker.recordApiCall({ cost: 0.12, subject: "AI Evaluation" });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ error: err.message || 'Report generation error on server' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
