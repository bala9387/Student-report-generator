/* Shared report-data logic, used by BOTH the local Express server (server.js)
 * and the Netlify serverless functions (netlify/functions/*.js). Nothing
 * here is web-framework-specific — every exported function just returns a
 * plain { status, body } pair that either caller can adapt to its own
 * response format.
 *
 * The Google Sheet is only ever read HERE. Callers never see the sheet ID,
 * the sheet URL, or any student's data beyond the single record (or top-N
 * leaderboard slice) they explicitly asked for.
 */
const path = require('path');
const ReportSource = require('../datasource.js');

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
      const dataCode = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
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

function conductedExams(m) { return m.exams.filter((ex) => m.conducted[ex]); }
function latestConductedExam(m) {
  const c = conductedExams(m);
  return c.length ? c[c.length - 1] : m.exams[0];
}
function findByRollCI(students, roll) {
  if (students[roll]) return students[roll];
  for (const k in students) if (k.toUpperCase() === roll) return students[k];
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

async function getMeta() {
  try {
    const data = await getData();
    return { status: 200, body: envelope(data) };
  } catch (err) {
    return { status: 503, body: { error: 'Failed to load report data', details: err.message } };
  }
}

async function getLookup(mode, rollRaw) {
  const roll = (rollRaw || '').toUpperCase().trim();
  if (!roll || !mode) return { status: 400, body: { error: 'roll and mode are required' } };
  try {
    const data = await getData();
    const env = envelope(data);

    if (mode === "PE - Analysis") {
      const pe = data.modes["PE - Analysis"];
      const student = findByRollCI(pe.students, roll);
      if (!student) return { status: 200, body: Object.assign({}, env, { found: false, reason: "not-found" }) };
      return { status: 200, body: Object.assign({}, env, { found: true, kind: "analysis", mode: stripMode(pe), student }) };
    }

    if (EXAMS.indexOf(mode) === -1) return { status: 400, body: { error: 'Unknown mode' } };

    // find which stream (group sheet) this roll belongs to
    const idx = data.rollIndex[roll] || [];
    const stream = idx.find((m2) => m2 !== "PE - Analysis");
    if (stream) {
      const groupMode = data.modes[stream];
      const student = groupMode.students[roll];
      if (student) {
        if (!groupMode.conducted[mode]) {
          return {
            status: 200, body: Object.assign({}, env, {
              found: false, reason: "not-conducted", availableExams: conductedExams(groupMode)
            })
          };
        }
        return {
          status: 200, body: Object.assign({}, env, {
            found: true, kind: "exam", exam: mode, mode: stripMode(groupMode), student
          })
        };
      }
    }
    return { status: 200, body: Object.assign({}, env, { found: false, reason: "not-found" }) };
  } catch (err) {
    return { status: 500, body: { error: 'Failed to load report data', details: err.message } };
  }
}

async function getLeaderboard(scope, nRaw) {
  const n = Math.max(1, Math.min(25, parseInt(nRaw, 10) || 5));
  try {
    const data = await getData();
    const env = envelope(data);
    const pe = data.modes["PE - Analysis"];
    const exam = latestConductedExam(pe);
    const all = Object.keys(pe.students).map((k) => pe.students[k]);

    function slim(s) {
      const e = {}; e[exam] = s.exams[exam];
      return { name: s.name, rollNo: s.rollNo, domainName: s.domainName || (s.stream || []).join("-"), exams: e };
    }

    if (scope === "school") {
      const list = all
        .filter((s) => s.exams[exam] && s.exams[exam].rank != null)
        .sort((a, b) => a.exams[exam].rank - b.exams[exam].rank)
        .slice(0, n).map(slim);
      return { status: 200, body: Object.assign({}, env, { exam, classSize: pe.classSize, list }) };
    }

    if (scope === "stream") {
      const groups = {}, order = [];
      all.forEach((s) => {
        const e = s.exams[exam];
        if (!e || e.domainRank == null) return;
        const dom = s.domainName || (s.stream || []).join("-");
        if (!groups[dom]) { groups[dom] = []; order.push(dom); }
        groups[dom].push(s);
      });
      const out = order.map((dom) => {
        groups[dom].sort((a, b) => a.exams[exam].domainRank - b.exams[exam].domainRank);
        return { domain: dom, size: groups[dom].length, list: groups[dom].slice(0, n).map(slim) };
      });
      return { status: 200, body: Object.assign({}, env, { exam, groups: out }) };
    }

    return { status: 400, body: { error: 'scope must be "school" or "stream"' } };
  } catch (err) {
    return { status: 500, body: { error: 'Failed to load report data', details: err.message } };
  }
}

module.exports = { getMeta, getLookup, getLeaderboard, getData };
