// Load .env into process.env (Node 20+ built-in; fallback for older versions)
try { require('fs').readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}); } catch(e){}

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

app.get('/api/meta', async (req, res) => {
  const r = await api.getMeta(req.query.grade);
  res.status(r.status).json(r.body);
});
app.get('/api/lookup', async (req, res) => {
  const r = await api.getLookup(req.query.mode, req.query.roll, req.query.grade);
  res.status(r.status).json(r.body);
});
app.get('/api/leaderboard', async (req, res) => {
  const r = await api.getLeaderboard(req.query.scope, req.query.n, req.query.grade);
  res.status(r.status).json(r.body);
});

// ---------- Teacher Portal Endpoints ----------
app.get('/api/teacher/marks', requireAuth, async (req, res) => {
  try {
    const data = await teacherApi.getTeacherData(req.query.stream, req.query.exam, req.query.grade);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/teacher/pe-analysis', requireAuth, async (req, res) => {
  try {
    const data = await teacherApi.getPeAnalysis(req.query.grade);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/save', requireAuth, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    let result;
    const grade = req.body.grade || req.query.grade;
    if (req.body.stream === "PE - Analysis" || req.body.stream === "Rankwise") {
      result = await teacherApi.updatePeTotals(req.body.updates, grade);
    } else if (req.body.stream === "Mentor Report") {
      result = await teacherApi.updateMentorLinks(req.body.exam, req.body.updates, grade);
    } else {
      result = await teacherApi.updateStudentMarks(req.body.stream, req.body.exam, req.body.updates, req.allowedCodes, req.allowedStreams, grade);
    }
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
  api.getData().catch(console.error); // prime the cache
});
