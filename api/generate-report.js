const gemini = require('../lib/geminiReport.js');
const tracker = require('../lib/apiTracker.js');
const authToken = require('../lib/authToken.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  const origin = req.headers.origin || '';
  const allowed = !origin
    || origin === 'https://ksraksharaacademy.vercel.app'
    || origin.endsWith('.vercel.app')
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://127.0.0.1');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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

    // Only administrative tracking actions require teacher/admin auth on remote deployments
    if (body.action) {
      const isLocal = !origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
      if (!isLocal) {
        const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
        const authInfo = authToken.verify(authHeader);
        if (!authInfo) {
          return res.status(401).json({ error: 'Admin authentication required.' });
        }
      }
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
      tracker.clearLogs(body.resetCounters === true);
      return res.status(200).json({ ok: true, data: tracker.getUsageData() });
    }

    const result = await gemini.generateReport({
      syllabus: body.syllabus,
      questionPaper: body.questionPaper,
      answerPaper: body.answerPaper,
      notes: body.notes
    });

    if (result && !result.error) {
      const rep = result.report || {};
      const subjectDesc = ((rep.subject ? rep.subject : '') + (rep.studentName ? (' - ' + rep.studentName) : '')).trim() || 'AI Evaluation';
      tracker.recordApiCall({
        cost: 0.12,
        subject: subjectDesc,
        model: result.model || 'gemini-flash-latest'
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    tracker.recordApiCall({
      cost: 0,
      subject: "AI Evaluation",
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      tokens: 0,
      status: err.message && err.message.includes('prepayment') ? 'Credits Depleted' : (err.status === 429 ? 'Rate Limited' : 'Failed')
    });
    return res.status(200).json({ error: err.message || 'Report generation error on server' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};
