/* Teacher Portal API handler — manages reading, updating, and uploading student marks
   across CU 1, TE 1, CU 2, TE 2 modules for all streams. */

const reportApi = require('./reportApi.js');

let XLSX;
try { XLSX = require('xlsx'); } catch(e) {}

const EXAMS = ["CU 1", "TE 1", "CU 2", "TE 2"];
const STREAMS = ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"];

const { google } = require('googleapis');
let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return null;
  }
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error("Failed to initialize Google Sheets client:", err);
    return null;
  }
}

function colIndexToLetter(idx) {
  let letter = '';
  let temp = idx + 1;
  while (temp > 0) {
    let remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - remainder) / 26);
  }
  return letter;
}

async function getTeacherData(streamName, examName) {
  const data = await reportApi.getData();
  const stream = streamName || STREAMS[0];
  const exam = examName || EXAMS[0];

  if (stream === "Mentor Report") {
    const students = [];
    // We iterate over rollIndex to get all students, or use a master list.
    // Actually, PE - Analysis has all students.
    const peMode = data.modes["PE - Analysis"];
    if (peMode) {
      for (const roll in peMode.students) {
        const st = peMode.students[roll];
        const mentorNode = data.mentorLinks[roll];
        const link = (mentorNode && mentorNode.links && mentorNode.links[exam]) ? mentorNode.links[exam] : "";
        students.push({
          rollNo: st.rollNo,
          sNo: st.sNo,
          name: st.name,
          marks: { "Link": link },
          total: 0
        });
      }
    }
    return {
      stream: stream,
      exam: exam,
      allStreams: STREAMS,
      allExams: EXAMS,
      subjects: ["Link"],
      subjectFull: { "Link": "Google Drive URL" },
      students: students
    };
  }

  const mode = data.modes[stream];
  if (!mode) {
    throw new Error(`Unknown stream: ${stream}`);
  }

  const subjects = mode.subjects || [];
  const students = [];

  for (const roll in mode.students) {
    const st = mode.students[roll];
    const examMarks = (st.marks && st.marks[exam]) ? st.marks[exam] : {};
    const marksObj = {};
    subjects.forEach(s => {
      marksObj[s] = examMarks[s] != null ? examMarks[s] : "";
    });

    students.push({
      rollNo: st.rollNo,
      sNo: st.sNo,
      name: st.name,
      marks: marksObj,
      total: examMarks.Total != null ? examMarks.Total : 0
    });
  }

  return {
    stream: stream,
    exam: exam,
    allStreams: STREAMS,
    allExams: EXAMS,
    subjects: subjects,
    subjectFull: mode.subjectFull,
    students: students
  };
}

async function updateStudentMarks(streamName, examName, updates) {
  const data = await reportApi.getData();
  const mode = data.modes[streamName];
  if (!mode) throw new Error(`Unknown stream: ${streamName}`);

  const peMode = data.modes["PE - Analysis"];
  
  const sheetUpdates = [];
  const BLOCK_START = { "CU 1": 3, "TE 1": 10, "CU 2": 17, "TE 2": 24 };
  const baseCol = BLOCK_START[examName];

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    const st = mode.students[roll] || findStudentCI(mode.students, roll);
    if (st) {
      if (!st.marks[examName]) st.marks[examName] = {};
      let sum = 0;
      mode.subjects.forEach((s, i) => {
        if (upd.marks && upd.marks[s] !== undefined) {
          const raw = upd.marks[s];
          const val = (raw === "" || raw == null || String(raw).toLowerCase() === "ab") ? null : parseFloat(raw);
          st.marks[examName][s] = val;
          if (val != null && !isNaN(val)) sum += val;
          
          if (st.rowIdx && baseCol != null) {
            const colLetter = colIndexToLetter(baseCol + i);
            const sheetVal = val == null ? "AB" : val;
            sheetUpdates.push({
              range: `'${streamName}'!${colLetter}${st.rowIdx}`,
              values: [[sheetVal]]
            });
          }
        }
      });
      st.marks[examName].Total = sum;

      // Also sync total in PE - Analysis
      if (peMode) {
        const peSt = peMode.students[roll] || findStudentCI(peMode.students, roll);
        if (peSt) {
          if (!peSt.exams[examName]) peSt.exams[examName] = {};
          peSt.exams[examName].total = sum;
        }
      }
    }
  });

  const sheets = getSheetsClient();
  if (sheets && sheetUpdates.length > 0) {
    const sheetId = process.env.GOOGLE_SHEET_ID || "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50";
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: sheetUpdates
        }
      });
      console.log(`Successfully wrote ${sheetUpdates.length} updates to Google Sheets.`);
    } catch (err) {
      console.error("Failed to write to Google Sheets:", err.message);
    }
  }

  recalculateRanksAndStats(data);
  return { success: true, count: updates.length };
}
async function updatePeTotals(updates) {
  const data = await reportApi.getData();
  const peMode = data.modes["PE - Analysis"];
  if (!peMode) throw new Error("PE - Analysis mode not found");

  const sheetUpdates = [];
  const PE_COLS = { "CU 1": 6, "TE 1": 8, "CU 2": 10, "TE 2": 12 }; // Total column 0-indexed index

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    const peSt = peMode.students[roll] || findStudentCI(peMode.students, roll);
    if (peSt && upd.exams) {
      EXAMS.forEach(ex => {
        if (upd.exams[ex] !== undefined) {
          const raw = upd.exams[ex];
          const val = (raw === "" || raw == null || String(raw).toLowerCase() === "ab") ? 0 : parseFloat(raw);
          if (!peSt.exams[ex]) peSt.exams[ex] = {};
          peSt.exams[ex].total = isNaN(val) ? 0 : val;
          
          if (peSt.rowIdx && PE_COLS[ex] != null) {
            const colLetter = colIndexToLetter(PE_COLS[ex]);
            sheetUpdates.push({
              range: `'PE - Analysis'!${colLetter}${peSt.rowIdx}`,
              values: [[val]]
            });
          }

          // Sync into individual stream object if exam total exists
          const streamNames = data.rollIndex[roll] || [];
          streamNames.forEach(sn => {
            if (sn !== "PE - Analysis" && data.modes[sn] && data.modes[sn].students[roll]) {
              const st = data.modes[sn].students[roll];
              if (!st.marks[ex]) st.marks[ex] = {};
              st.marks[ex].Total = peSt.exams[ex].total;
            }
          });
        }
      });
    }
  });

  const sheets = getSheetsClient();
  if (sheets && sheetUpdates.length > 0) {
    const sheetId = process.env.GOOGLE_SHEET_ID || "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50";
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: sheetUpdates
        }
      });
      console.log(`Successfully wrote ${sheetUpdates.length} PE updates to Google Sheets.`);
    } catch (err) {
      console.error("Failed to write PE updates to Google Sheets:", err.message);
    }
  }

  recalculateRanksAndStats(data);
  return { success: true, count: updates.length };
}

function findStudentCI(studentsMap, roll) {
  for (const k in studentsMap) {
    if (k.toUpperCase() === roll.toUpperCase()) return studentsMap[k];
  }
  return null;
}

async function updateMentorLinks(examName, updates) {
  const data = await reportApi.getData();
  const peMode = data.modes["PE - Analysis"];
  if (!peMode) throw new Error("Could not load student list for Mentor Report updates.");

  const sheetUpdates = [];
  const EXAM_IDX = EXAMS.indexOf(examName);
  if (EXAM_IDX === -1) throw new Error(`Unknown exam: ${examName}`);
  const baseCol = 3 + EXAM_IDX; // 0-indexed column

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    if (!roll) return;
    const mentorNode = data.mentorLinks[roll];
    if (mentorNode && mentorNode.rowIdx) {
      if (upd.marks && upd.marks["Link"] !== undefined) {
        const val = upd.marks["Link"] || "";
        const colLetter = colIndexToLetter(baseCol);
        sheetUpdates.push({
          range: `'Mentor Report'!${colLetter}${mentorNode.rowIdx}`,
          values: [[val]]
        });
      }
    }
  });

  const sheets = getSheetsClient();
  if (sheets && sheetUpdates.length > 0) {
    const sheetId = process.env.GOOGLE_SHEET_ID || "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50";
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: sheetUpdates
        }
      });
      console.log(`Successfully wrote ${sheetUpdates.length} Mentor Report links to Google Sheets.`);
    } catch (err) {
      console.error("Failed to write Mentor Report links to Google Sheets:", err.message);
    }
  }

  // We don't need to recalculate ranks for mentor links
  return { success: true, count: updates.length };
}

async function processExcelUpload(base64Data) {
  if (!XLSX) {
    XLSX = require('xlsx');
  }
  const buffer = Buffer.from(base64Data, 'base64');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const data = await reportApi.getData();
  let updatedCount = 0;

  STREAMS.forEach(streamName => {
    if (workbook.Sheets[streamName]) {
      const sheet = workbook.Sheets[streamName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows || rows.length < 3) return;

      const mode = data.modes[streamName];
      if (!mode) return;

      // Block start mapping: CU 1=3, TE 1=10, CU 2=17, TE 2=24
      const BLOCK_START = { "CU 1": 3, "TE 1": 10, "CU 2": 17, "TE 2": 24 };

      rows.forEach(r => {
        const sNo = r[0];
        const roll = String(r[1] || '').trim();
        if (!roll || isNaN(parseFloat(sNo))) return;

        const st = mode.students[roll] || findStudentCI(mode.students, roll);
        if (!st) return;

        EXAMS.forEach(exn => {
          const base = BLOCK_START[exn];
          if (base == null) return;

          if (!st.marks[exn]) st.marks[exn] = {};
          let sum = 0;
          mode.subjects.forEach((s, idx) => {
            const valRaw = r[base + idx];
            const val = (valRaw == null || valRaw === '' || String(valRaw).toLowerCase() === 'ab') ? null : parseFloat(valRaw);
            st.marks[exn][s] = val;
            if (val != null && !isNaN(val)) sum += val;
          });
          const totRaw = r[base + 6];
          st.marks[exn].Total = (totRaw != null && !isNaN(parseFloat(totRaw))) ? parseFloat(totRaw) : sum;

          // Sync PE - Analysis
          const peMode = data.modes["PE - Analysis"];
          if (peMode) {
            const peSt = peMode.students[roll] || findStudentCI(peMode.students, roll);
            if (peSt) {
              if (!peSt.exams[exn]) peSt.exams[exn] = {};
              peSt.exams[exn].total = st.marks[exn].Total;
            }
          }
        });
        updatedCount++;
      });
    }
  });

  recalculateRanksAndStats(data);
  return { success: true, updatedStudents: updatedCount };
}

function recalculateRanksAndStats(data) {
  const peMode = data.modes["PE - Analysis"];
  if (!peMode) return;

  const domainGroups = {};
  Object.keys(peMode.students).forEach(roll => {
    const st = peMode.students[roll];
    const dom = (st.stream || []).join("-");
    st.domainName = dom;
    if (!domainGroups[dom]) domainGroups[dom] = [];
    domainGroups[dom].push(st);
  });

  EXAMS.forEach(exn => {
    peMode.conducted[exn] = true;
    Object.keys(domainGroups).forEach(dom => {
      const arr = domainGroups[dom].filter(st => st.exams[exn] && st.exams[exn].total > 0);
      arr.sort((a, b) => b.exams[exn].total - a.exams[exn].total);
      let prevTot = -1, prevRk = 1;
      arr.forEach((st, i) => {
        const tot = st.exams[exn].total;
        if (tot !== prevTot) { prevRk = i + 1; prevTot = tot; }
        st.exams[exn].domainRank = prevRk;
        st.exams[exn].domainSize = domainGroups[dom].length;
      });
    });
  });
}

/* ── PE Analysis ── returns totals, ranks, and score-range stats ── */
async function getPeAnalysis() {
  const data = await reportApi.getData();
  const pe = data.modes["PE - Analysis"];
  if (!pe) throw new Error("PE - Analysis mode not found");

  const students = [];
  for (const roll in pe.students) {
    const st = pe.students[roll];
    const row = {
      sNo: st.sNo,
      rollNo: st.rollNo,
      name: st.name,
      stream: (st.stream || []).join(", ") || st.domainName || "-",
      exams: {}
    };
    EXAMS.forEach(ex => {
      const e = st.exams && st.exams[ex];
      row.exams[ex] = {
        total: e ? (e.total || 0) : 0,
        domainRank: e ? (e.domainRank || null) : null,
        domainSize: e ? (e.domainSize || null) : null,
        rank: e ? (e.rank || null) : null
      };
    });
    students.push(row);
  }

  students.sort((a, b) => (a.sNo || 0) - (b.sNo || 0));

  // Score range buckets per exam
  const RANGES = [
    { label: ">= 550",    min: 550, max: Infinity },
    { label: "500 - 549", min: 500, max: 549 },
    { label: "400 - 499", min: 400, max: 499 },
    { label: "300 - 399", min: 300, max: 399 },
    { label: "<= 299",    min: 0,   max: 299 }
  ];

  const stats = {};
  EXAMS.forEach(ex => {
    const totals = students.map(s => s.exams[ex].total).filter(t => t > 0);
    stats[ex] = {
      max: totals.length ? Math.max(...totals) : 0,
      min: totals.length ? Math.min(...totals) : 0,
      ranges: RANGES.map(r => ({
        label: r.label,
        count: totals.filter(t => t >= r.min && t <= r.max).length
      }))
    };
  });

  return {
    exams: EXAMS,
    students: students,
    stats: stats,
    classSize: pe.classSize
  };
}

module.exports = { getTeacherData, updateStudentMarks, processExcelUpload, getPeAnalysis, updatePeTotals, updateMentorLinks };
