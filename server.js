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

// Auth endpoint for Teacher/Admin Login
app.post(['/api/auth', '/api/teacher/auth'], express.json(), (req, res) => {
  const user = (req.body.user || '').trim();
  const pass = (req.body.pass || '').trim();
  const expectedUser = process.env.ADMIN_USER || 'aksharaacademy';
  const expectedPass = process.env.ADMIN_PASS || 'aksharaacademy@98?';

  if (user.toLowerCase() === expectedUser.toLowerCase() && pass === expectedPass) {
    const expires = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
    const token = authToken.sign(expires);
    return res.json({ ok: true, token, expires });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

// Middleware to verify teacher/admin authorization token
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  if (!authToken.verify(token)) {
    return res.status(401).json({ error: 'Unauthorized: Staff login required' });
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
  const r = await api.getMeta();
  res.status(r.status).json(r.body);
});
app.get('/api/lookup', async (req, res) => {
  const r = await api.getLookup(req.query.mode, req.query.roll);
  res.status(r.status).json(r.body);
});
app.get('/api/leaderboard', async (req, res) => {
  const r = await api.getLeaderboard(req.query.scope, req.query.n);
  res.status(r.status).json(r.body);
});

// ---------- Teacher Portal Endpoints ----------
app.get('/api/teacher/marks', requireAuth, async (req, res) => {
  try {
    const data = await teacherApi.getTeacherData(req.query.stream, req.query.exam);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/teacher/pe-analysis', requireAuth, async (req, res) => {
  try {
    const data = await teacherApi.getPeAnalysis();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/save', requireAuth, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    let result;
    if (req.body.stream === "PE - Analysis") {
      result = await teacherApi.updatePeTotals(req.body.updates);
    } else {
      result = await teacherApi.updateStudentMarks(req.body.stream, req.body.exam, req.body.updates);
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
