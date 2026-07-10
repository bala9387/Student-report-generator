/* Secure backend for the Student Performance Report site.
 *
 * The Google Sheet is only ever read HERE, on the server. The browser never
 * sees the sheet ID, the sheet URL, or any student's data beyond the single
 * record (or top-N leaderboard slice) it explicitly asked for.
 *
 * Nothing in this file — or in datasource.js, which it wraps — ever writes
 * to the sheet. All Google requests are plain GETs against the read-only
 * CSV export endpoint.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const ReportSource = require('./datasource.js');

const app = express();
app.use(cors());

// Serve ONLY the exact files the browser needs — an explicit allowlist, not
// the whole project directory. Everything else (server.js, datasource.js
// with the sheet ID, data.js with the full roster, package.json, .py
// scripts, node_modules, README, etc.) returns 404 and is never reachable
// over HTTP, even by someone guessing the filename.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/logo.jpg', (req, res) => res.sendFile(path.join(__dirname, 'logo.jpg')));
app.use('/vendor', express.static(path.join(__dirname, 'vendor')));

const EXAMS = ["CU 1", "TE 1", "CU 2", "TE 2"];

let cachedData = null;
let lastFetch = null;
const CACHE_TTL = 5 * 60 * 1000; // re-fetch the sheet at most once every 5 minutes

async function getData() {
  if (cachedData && (Date.now() - lastFetch < CACHE_TTL)) return cachedData;

  console.log("Fetching live data from Google Sheets...");
  try {
    const result = await ReportSource.loadReportData();
    cachedData = result.data;
    lastFetch = Date.now();
    return cachedData;
  } catch (err) {
    console.error("Failed to fetch from Google Sheets:", err);
    if (cachedData) return cachedData; // serve stale cache rather than fail

    try {
      console.log("Falling back to local data.js...");
      const fs = require('fs');
      const dataCode = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
      const sandbox = { window: {} };
      require('vm').runInNewContext(dataCode, sandbox);
      if (sandbox.window.REPORT_DATA) {
        cachedData = sandbox.window.REPORT_DATA;
        lastFetch = Date.now();
        return cachedData;
      }
    } catch (e) {
      console.error("Local fallback failed:", e);
    }
    throw err;
  }
}

// ---------- shared helpers (mirrors the client-side logic in app.js) ----------
function conductedExams(m) { return m.exams.filter(function (ex) { return m.conducted[ex]; }); }
function latestConductedExam(m) {
  var c = conductedExams(m);
  return c.length ? c[c.length - 1] : m.exams[0];
}
function findByRollCI(students, roll) {
  if (students[roll]) return students[roll];
  for (var k in students) if (k.toUpperCase() === roll) return students[k];
  return null;
}
// only the fields the frontend actually needs to render/print a report —
// never the `students` map for anyone else in that mode
function stripMode(m) {
  return {
    type: m.type, label: m.label, exams: m.exams, conducted: m.conducted,
    classSize: m.classSize, topper: m.topper, classStats: m.classStats,
    subjects: m.subjects, subjectFull: m.subjectFull
  };
}
function envelope(data) {
  return { live: true, when: lastFetch, meta: data.meta, peClassSize: data.modes["PE - Analysis"].classSize };
}

// ---------- GET /api/meta — status pill + enabling the form, no student data ----------
app.get('/api/meta', async (req, res) => {
  try {
    const data = await getData();
    res.json(envelope(data));
  } catch (err) {
    res.status(503).json({ error: 'Failed to load report data', details: err.message });
  }
});

// ---------- GET /api/lookup?mode=X&roll=Y — resolves exactly one student ----------
app.get('/api/lookup', async (req, res) => {
  try {
    const mode = req.query.mode;
    const roll = (req.query.roll || '').toUpperCase().trim();
    if (!roll || !mode) return res.status(400).json({ error: 'roll and mode are required' });

    const data = await getData();
    const env = envelope(data);

    if (mode === "PE - Analysis") {
      const pe = data.modes["PE - Analysis"];
      const student = findByRollCI(pe.students, roll);
      if (!student) return res.json(Object.assign({}, env, { found: false, reason: "not-found" }));
      return res.json(Object.assign({}, env, { found: true, kind: "analysis", mode: stripMode(pe), student: student }));
    }

    if (EXAMS.indexOf(mode) === -1) return res.status(400).json({ error: 'Unknown mode' });

    // find which stream (group sheet) this roll belongs to
    const idx = data.rollIndex[roll] || [];
    const stream = idx.find(function (m2) { return m2 !== "PE - Analysis"; });
    if (stream) {
      const groupMode = data.modes[stream];
      const student = groupMode.students[roll];
      if (student) {
        if (!groupMode.conducted[mode]) {
          return res.json(Object.assign({}, env, {
            found: false, reason: "not-conducted",
            availableExams: conductedExams(groupMode)
          }));
        }
        return res.json(Object.assign({}, env, {
          found: true, kind: "exam", exam: mode, mode: stripMode(groupMode), student: student
        }));
      }
    }
    return res.json(Object.assign({}, env, { found: false, reason: "not-found" }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load report data', details: err.message });
  }
});

// ---------- GET /api/leaderboard?scope=school|stream&n=5 ----------
app.get('/api/leaderboard', async (req, res) => {
  try {
    const scope = req.query.scope;
    const n = Math.max(1, Math.min(25, parseInt(req.query.n, 10) || 5));
    const data = await getData();
    const env = envelope(data);
    const pe = data.modes["PE - Analysis"];
    const exam = latestConductedExam(pe);
    const all = Object.keys(pe.students).map(function (k) { return pe.students[k]; });

    function slim(s) {
      var e = {}; e[exam] = s.exams[exam];
      return { name: s.name, rollNo: s.rollNo, domainName: s.domainName || (s.stream || []).join("-"), exams: e };
    }

    if (scope === "school") {
      const list = all
        .filter(function (s) { return s.exams[exam] && s.exams[exam].rank != null; })
        .sort(function (a, b) { return a.exams[exam].rank - b.exams[exam].rank; })
        .slice(0, n).map(slim);
      return res.json(Object.assign({}, env, { exam: exam, classSize: pe.classSize, list: list }));
    }

    if (scope === "stream") {
      const groups = {}, order = [];
      all.forEach(function (s) {
        var e = s.exams[exam];
        if (!e || e.domainRank == null) return;
        var dom = s.domainName || (s.stream || []).join("-");
        if (!groups[dom]) { groups[dom] = []; order.push(dom); }
        groups[dom].push(s);
      });
      const out = order.map(function (dom) {
        groups[dom].sort(function (a, b) { return a.exams[exam].domainRank - b.exams[exam].domainRank; });
        return { domain: dom, size: groups[dom].length, list: groups[dom].slice(0, n).map(slim) };
      });
      return res.json(Object.assign({}, env, { exam: exam, groups: out }));
    }

    res.status(400).json({ error: 'scope must be "school" or "stream"' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load report data', details: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Secure Server running on http://localhost:${PORT}`);
  getData().catch(console.error); // prime the cache
});
