// Load .env into process.env (Node 20+ built-in; fallback for older versions)
try { require('fs').readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);if(m)process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}); } catch(e){}

/* Local dev server for the Student Performance Report site. */
const express = require('express');
const cors = require('cors');
const path = require('path');
const api = require('./lib/reportApi.js');
const teacherApi = require('./lib/teacherApi.js');
const gemini = require('./lib/geminiReport.js');

const authToken = require('./lib/authToken.js');

const app = express();
app.use(cors());

const teacherAccounts = require('./lib/teacherAccounts.js');

// Auth endpoint for Teacher/Admin Login
app.post(['/api/auth', '/api/teacher/auth'], express.json(), (req, res) => {
  const authRes = teacherAccounts.verifyTeacherLogin(req.body.user, req.body.pass);

  if (authRes && authRes.ok) {
    const expires = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
    const token = authToken.sign(expires, authRes.user);
    return res.json({ ok: true, token, expires, teacher: authRes });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

// Middleware to verify teacher/admin authorization token
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  const verified = authToken.verify(token);
  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized: Staff login required' });
  }
  req.teacherUser = verified.user || '';
  if (req.teacherUser && teacherAccounts.ACCOUNTS[req.teacherUser]) {
    req.allowedCodes = teacherAccounts.ACCOUNTS[req.teacherUser].allowedCodes;
    req.allowedStreams = teacherAccounts.ACCOUNTS[req.teacherUser].allowedStreams;
  } else {
    req.allowedCodes = null; // Admin
    req.allowedStreams = null; // Admin
  }
  next();
}

const PUBLIC_DIR = path.join(__dirname, 'public');
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'styles.css')));
app.get('/logo.jpg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'logo.jpg')));
app.use('/vendor', express.static(path.join(PUBLIC_DIR, 'vendor')));
app.use('/generator', express.static(path.join(PUBLIC_DIR, 'generator')));
app.use('/teacher', express.static(path.join(PUBLIC_DIR, 'teacher')));

const apiTracker = require('./lib/apiTracker.js');

app.get('/api/api-usage', (req, res) => {
  res.json(apiTracker.getUsageData());
});

app.post('/api/api-usage', (req, res) => {
  const body = req.body || {};
  if (body.action === 'updateCap') {
    apiTracker.updateSpendCap(body.cap);
  } else if (body.action === 'updateSpend') {
    apiTracker.updateCurrentSpend(body.spend);
  } else if (body.action === 'record') {
    apiTracker.recordApiCall(body);
  }
  res.json({ ok: true, data: apiTracker.getUsageData() });
});

app.get('/api/meta', async (req, res) => {
  const fresh = req.query.fresh === '1' || !!req.query._t;
  const r = await api.getMeta(req.query.grade, fresh);
  res.status(r.status).json(r.body);
});
app.get('/api/lookup', async (req, res) => {
  const fresh = req.query.fresh === '1' || !!req.query._t;
  const r = await api.getLookup(req.query.mode, req.query.roll, req.query.grade, fresh);
  res.status(r.status).json(r.body);
});
app.get('/api/leaderboard', async (req, res) => {
  const fresh = req.query.fresh === '1' || !!req.query._t;
  const r = await api.getLeaderboard(req.query.scope, req.query.n, req.query.grade, fresh);
  res.status(r.status).json(r.body);
});

app.all(['/api/refresh', '/api/force-refresh'], async (req, res) => {
  try {
    const grade = req.query.grade || (req.body && req.body.grade) || null;
    api.bustCache(grade);
    if (grade) {
      await api.getData(grade, true);
    } else {
      await Promise.all(['10', '11', '12'].map(g => api.getData(g, true)));
    }
    res.json({ ok: true, message: 'Google Sheets data refreshed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Teacher Portal Endpoints ----------
app.get('/api/teacher/marks', requireAuth, async (req, res) => {
  try {
    if (req.query.stream === "Rankwise" && req.teacherUser !== "aksharaacademy") {
      return res.status(403).json({ error: "Access denied: Rankwise view is restricted to Master Administrator." });
    }
    const fresh = req.query.fresh === '1' || !!req.query._t;
    const data = await teacherApi.getTeacherData(req.query.stream, req.query.exam, req.query.grade, fresh);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/teacher/pe-analysis', requireAuth, async (req, res) => {
  try {
    const fresh = req.query.fresh === '1' || !!req.query._t;
    const data = await teacherApi.getPeAnalysis(req.query.grade, fresh);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/save', requireAuth, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const body = req.body || {};
    const grade = body.grade || req.query.grade || '12';

    if (body.action === 'refresh') {
      api.bustCache(grade);
      await api.getData(grade);
      return res.json({ ok: true, message: 'Data refreshed from Google Sheets successfully.', grade });
    }

    let result;
    if (body.stream === "PE - Analysis" || body.stream === "Rankwise") {
      result = await teacherApi.updatePeTotals(body.updates, grade);
    } else if (body.stream === "Mentor Report") {
      result = await teacherApi.updateMentorLinks(body.exam, body.updates, grade);
    } else {
      result = await teacherApi.updateStudentMarks(body.stream, body.exam, body.updates, req.allowedCodes, req.allowedStreams, grade);
    }
    api.bustCache(grade);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/upload-excel', requireAuth, express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const result = await teacherApi.processExcelUpload(req.body.fileData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Force-refresh endpoint — busts cache so next request fetches fresh Google Sheet data
app.post('/api/teacher/refresh', requireAuth, async (req, res) => {
  try {
    const grade = req.query.grade || req.body && req.body.grade || '12';
    api.bustCache(grade);
    // Immediately pre-fetch fresh data
    const freshData = await api.getData(grade);
    res.json({ ok: true, message: 'Data refreshed from Google Sheets successfully.', grade });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// AI Report Generator
app.post('/api/generate-report', express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const result = await gemini.generateReport({
      syllabus: req.body.syllabus,
      questionPaper: req.body.questionPaper,
      answerPaper: req.body.answerPaper,
      notes: req.body.notes
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Report generation failed' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Secure Server running on http://localhost:${PORT}`);
  api.getData().then(() => console.log('[Cache Primed] Grade 12 data loaded.')).catch(console.error);
});
setInterval(() => {}, 1000 * 60 * 60); // keep process alive
