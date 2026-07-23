/* Local dev server for the Student Performance Report site.
 *
 * This is a thin Express wrapper around lib/reportApi.js — the same shared
 * logic that also powers the Netlify Functions used in production
 * (netlify/functions/*.js). Only the exact files under public/ are ever
 * served; the sheet ID, the roster snapshot, and this server's own source
 * are never reachable over HTTP.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const api = require('./lib/reportApi.js');
const authToken = require('./lib/authToken.js');
const gemini = require('./lib/geminiReport.js');

const app = express();
app.use(cors());

const PUBLIC_DIR = path.join(__dirname, 'public');
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'styles.css')));
app.get('/logo.jpg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'logo.jpg')));
app.use('/vendor', express.static(path.join(PUBLIC_DIR, 'vendor')));
// staff-only report generator (mirrors Netlify's publish=public routing)
app.use('/generator', express.static(path.join(PUBLIC_DIR, 'generator')));

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
app.post('/api/auth', express.json(), (req, res) => {
  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;
  if (!validUser || !validPass) {
    return res.status(500).json({ error: 'Server credentials not configured. Set ADMIN_USER and ADMIN_PASS env vars.' });
  }
  const { username, password } = req.body || {};
  if (username === validUser && password === validPass) {
    const until = Date.now() + 8 * 3600 * 1000;
    return res.json({ ok: true, until, token: authToken.sign(until) });
  }
  res.status(401).json({ ok: false, error: 'Invalid username or password' });
});

// staff-only: evaluate an answer sheet with Gemini. Body can be large (base64
// files), so bump the JSON limit well above Express's 100 KB default.
app.post('/api/generate-report', express.json({ limit: '20mb' }), async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!authToken.verify(bearer || (req.body && req.body.token))) {
    return res.status(401).json({ error: 'Not signed in. Please log in again.' });
  }
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
