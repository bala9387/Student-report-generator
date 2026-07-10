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

const app = express();
app.use(cors());

const PUBLIC_DIR = path.join(__dirname, 'public');
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'styles.css')));
app.get('/logo.jpg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'logo.jpg')));
app.use('/vendor', express.static(path.join(PUBLIC_DIR, 'vendor')));

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Secure Server running on http://localhost:${PORT}`);
  api.getData().catch(console.error); // prime the cache
});
