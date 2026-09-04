// Load .env into process.env if present
try { require('fs').readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}); } catch(e){}

const reportApi = require('./reportApi.js');
const { toCanonicalSubject } = require('./teacherAccounts.js');

let XLSX;
try { XLSX = require('xlsx'); } catch(e) {}

const EXAMS = ["CU 1", "TE 1", "CU 2", "TE 2"];
const STREAMS = ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"];

const { google } = require('googleapis');
let sheetsClient = null;

const crypto = require('crypto');

function fixPrivateKey(raw) {
  if (!raw) return '';
  let str = String(raw).trim().replace(/^["'`]|["'`]$/g, '');
  str = str.replace(/\\n/g, '\n');

  try {
    crypto.createPrivateKey(str);
    return str;
  } catch (e) {}

  let header = 'PRIVATE KEY';
  if (str.includes('RSA PRIVATE KEY')) header = 'RSA PRIVATE KEY';

  let body = str
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');

  const lines = body.match(/.{1,64}/g) || [];
  const constructed = `-----BEGIN ${header}-----\n` + lines.join('\n') + `\n-----END ${header}-----\n`;

  try {
    crypto.createPrivateKey(constructed);
    return constructed;
  } catch (e) {
    return str;
  }
}

const DEFAULT_EMAIL = "report-bot@zhyper-491012.iam.gserviceaccount.com";
const DEFAULT_KEY = `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCjkLf0pu3EZmO6\n37Q2q/A3z+3rNl+0/+DeiLXobEfRTWvoTP1OEiPotjrRFGQhkqsjcDsB2o8xJlqf\nXwVqBQCeG1RyFlQSfHGKyKaXiNd1GW2WpXSLOruPrGd6LNgRZgqvLO3DFol56FoB\n1g2ydwMFfzQ2hSrscPtXfDuOktKYF22fKskM8OCGTsmMBpdnJ+lD9IuZM+no1NrX\nUwo/AGlhEmcD+vHIuTaMjlqSHssDCydyXEwukoOy3lblN1nMD/U05ObJWq1FmfzQ\nrmMx18pfnM0rBfL5NQoI9btsUj6/7f3lDIqS1TNORMLmS1oFuSNVQtiKg2Rbi5rd\njR7aiHFhAgMBAAECggEACsEYJ0DWf0RQKFhPDA0wBStptD5l+oucaGVKuJZt/mf9\nwU9WlEyDCej5YwfZMY/oKrNVXeDV62BfMv1XaModaUfYvIuVSYXfHUXmFi6MJAng\n97e3OvRIosCuKQ1Lw5EXAL+OfnY74cUSLe66BdLnYvQjJbaJxPQEwpLLg6tJp3A/\n/ueK+sBamKJpbnorRCQ0h08YfXcCry8WSnaTOAnPX6IH/TYXr88uVcR25bM9Xrge\nQVW0FAiqlWlguinhU1aYdYAIDSu3kcIAWQvGaz6XTHFSL9IdDnV4lAQyRq2Vjnr4\nmEFAAXHwvL03KH8IKck9etK9pNFFxL9bmNUhcG6+8QKBgQDOzQVKuwq6yXm4KKrV\nWSdwMC1UQytnziSn6DRi5zkMxjB5htLRg8VuSCsfhsUuyrETZQMXQnUpDF/dNyne\nR4kyHP1/r83bsqyEUjpGv860kcqSvWbXT12jgrSBGNhfSFXqFSypQNkZki+9LpPO\nhPRit/oMA7O8ALorVMdXhSdktQKBgQDKenviHLTvUXobQcF77ouxAu2MQoRPl/+p\nfBvhWbzSVJNoz43nAOArEeaMP669yh3HNRi4xRjck5qReKp5uO5i17YeXooZ6GKu\nb5f3q06A+oVBEuI/z3nyDQLjiOT55qkQeLp+1fBTj2iAD6IeMsxIIEWA7FlG65gV\nhBhnDhNRfQKBgQCsbM8Tvx40HVaqkOXXWy2B4fl5f0PKmlt/0CEVsbqkhv7V5O8U\nF61exTeHYsQ3vnKkPB22oAe1wQaRGLSFC9o9eWR3uSqIGtKyxSin4rdDYSeo79i2\nfwsRESLVXNTTpSlVMnB5coNRSc0aDKLal4p4YPNQXynWADk5dcd7lp8A3QKBgHzF\nR4vJhtGmkqkzNwiosdotZLa20pO9paUKPp/6TXoK9h9zLw13o6vGxxwLriFz6C+2\nj3pksnJSXsBf7CVACV5NcQN73HwkkJLPX4UWQjUGq5CzE0qhDpNS40HVPMymD+5/\nhuTb7tF/ILUxbQRQ50NW552Ph2BFk51Gnkb7DHp9AoGAak505DjZGWVCtemz06ea\nTD0FDOtOQcMsiBsj/Z3D/pzOSS1nZwWtcS01rIPwOFxDzxfVRQr9rCIEMHG86xki\ncofhfibZPrJNPhVSwy09zoDUJWc/RVT+PcDNrJuyiWuy6SkjqnT1h4WZLg1q8OI8\ngoagQJdOr1YmnNASl/KvdvU=\n-----END PRIVATE KEY-----\n`;

async function getSheetsClient() {
  let email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || DEFAULT_EMAIL).trim().replace(/^["']|["']$/g, '');
  let rawKey = process.env.GOOGLE_PRIVATE_KEY || DEFAULT_KEY;
  let key = fixPrivateKey(rawKey);

  // Pre-validate key with crypto
  try {
    if (!key) throw new Error("empty key");
    crypto.createPrivateKey(key);
  } catch (e) {
    email = DEFAULT_EMAIL;
    key = fixPrivateKey(DEFAULT_KEY);
  }

  try {
    const auth = new google.auth.JWT({
      email: email,
      key: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    await auth.authorize();
    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    // If Netlify env key failed authorization, auto-fallback to verified DEFAULT_KEY
    if (email !== DEFAULT_EMAIL || rawKey !== DEFAULT_KEY) {
      try {
        const fallbackAuth = new google.auth.JWT({
          email: DEFAULT_EMAIL,
          key: fixPrivateKey(DEFAULT_KEY),
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        await fallbackAuth.authorize();
        return google.sheets({ version: 'v4', auth: fallbackAuth });
      } catch (err2) {
        throw new Error(`Google Auth Failed (${err2.message}).`);
      }
    }
    console.error("Failed to authorize Google Sheets client:", err.message);
    throw new Error(`Google Auth Failed (${err.message}).`);
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

const PRIMARY_SHEET_ID = "16TMqtxp-U9BU6w8Zn6anHD9mdHvD23BOyf38nZa7f50";

const GRADE_SHEETS = {
  "10": "1am96_5JYsPAzLM4XZ-J4pIiUCizvInuk0AqxO1PAyUY",
  "11": "1cDEw2sfKvxHNol-o4ZNrXZmapM75iHYzHIi71plO-7Y",
  "12": PRIMARY_SHEET_ID
};

function getSpreadsheetId(grade) {
  const g = String(grade || "12").trim();
  if (g === "10" || g === "X") return GRADE_SHEETS["10"];
  if (g === "11" || g === "XI") return GRADE_SHEETS["11"];
  return GRADE_SHEETS["12"];
}

async function writeToBothSheets(sheets, grade, sheetUpdates) {
  if (!sheetUpdates || sheetUpdates.length === 0) return;
  const primaryId = getSpreadsheetId(grade);

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: primaryId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: sheetUpdates
      }
    });
    console.log(`Successfully wrote ${sheetUpdates.length} updates to Google Sheet (${primaryId}).`);
  } catch (err) {
    console.error("Failed to write to Google Sheet:", err.message);
    if (err.message.includes("protected cell") || err.message.includes("protected")) {
      throw new Error("Cell Protection Error: These cells/columns are protected in Google Sheets. Open your Google Sheet, go to 'Data' -> 'Protect sheets and ranges', and remove protection or grant access to report-bot@zhyper-491012.iam.gserviceaccount.com.");
    }
    throw new Error(`Google Sheets write failed: ${err.message}. Make sure your Service Account email has Editor access to the sheet.`);
  }
}

async function getTeacherData(streamName, examName, grade, forceFresh) {
  const data = await reportApi.getData(grade, forceFresh);
  const stream = streamName || STREAMS[0];
  const exam = examName || EXAMS[0];

  if (stream === "PE - Analysis" || stream === "Rankwise") {
    const peMode = data.modes["PE - Analysis"];
    const students = [];
    if (peMode && peMode.students) {
      for (const roll in peMode.students) {
        const st = peMode.students[roll];
        const examMarks = (st.marks && st.marks[exam]) ? st.marks[exam] : {};
        students.push({
          rollNo: st.rollNo,
          sNo: st.sNo,
          name: st.name,
          marks: {
            "Total": examMarks.Total != null ? examMarks.Total : "",
            "Rank": examMarks.Rank != null ? examMarks.Rank : ""
          },
          total: examMarks.Total != null ? examMarks.Total : 0
        });
      }
    }
    return {
      stream: stream,
      exam: exam,
      allStreams: STREAMS,
      allExams: EXAMS,
      subjects: ["Total", "Rank"],
      subjectFull: { "Total": "Total Score", "Rank": "Class Rank" },
      students: students
    };
  }

  if (stream === "Mentor Report") {
    const students = [];
    const peMode = data.modes["PE - Analysis"];
    if (peMode) {
      for (const roll in peMode.students) {
        const st = peMode.students[roll];
        const mentorNode = (data.mentorLinks && data.mentorLinks[roll]) ? data.mentorLinks[roll] : null;
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

  const isG10 = (String(grade).trim() === "10" || String(grade).trim() === "X");
  const gradeStreams = isG10 ? ["X Harmony", "X Melody", "X Symphony"] : STREAMS;

  return {
    stream: stream,
    exam: exam,
    allStreams: gradeStreams,
    allExams: EXAMS,
    subjects: subjects,
    subjectFull: mode.subjectFull,
    students: students
  };
}

function getTabName(stream, grade) {
  if (grade === "11" || grade === "XI") {
    const map11 = {
      "Bio - Maths": "PCBM",
      "Maths - CS": "PCCM",
      "Bio - CS": "PCBC",
      "Applied Math": "A.Math"
    };
    return map11[stream] || stream;
  }
  if (grade === "10" || grade === "X") {
    const map10 = {
      "X Harmony": "10 H",
      "X Melody": "10 M",
      "X Symphony": "10 S"
    };
    return map10[stream] || stream;
  }
  return stream;
}

const PE_COLS = { "CU 1": 6, "TE 1": 8, "CU 2": 10, "TE 2": 12 };

async function updateStudentMarks(streamName, examName, updates, allowedCodes, allowedStreams, grade) {
  const isStreamAllowed = (stream) => {
    if (!allowedStreams || !Array.isArray(allowedStreams)) return true;
    const target = String(stream).toLowerCase();
    return allowedStreams.some(s => String(s).toLowerCase() === target);
  };

  if (!isStreamAllowed(streamName)) {
    throw new Error(`Unauthorized: You are not assigned to edit marks for ${streamName}`);
  }

  const sheets = await getSheetsClient();
  if (!sheets) {
    throw new Error("Google Sheets API credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) are missing.");
  }

  const data = await reportApi.getData(grade);
  const mode = data.modes[streamName];
  if (!mode) throw new Error(`Unknown stream: ${streamName}`);

  const peMode = data.modes["PE - Analysis"];
  const streamTabName = getTabName(streamName, grade);
  const primaryId = getSpreadsheetId(grade);

  // Live row resolver: verify actual current row in Google Sheets for target tab
  const liveRowMap = {};
  try {
    const tabRes = await sheets.spreadsheets.values.get({
      spreadsheetId: primaryId,
      range: `'${streamTabName}'!A1:B150`
    });
    const rows = tabRes.data.values || [];
    rows.forEach((r, idx) => {
      const rNo = String(r[1] || r[0] || '').trim().toUpperCase();
      if (rNo) liveRowMap[rNo] = idx + 1; // 1-indexed sheet row
    });
  } catch (err) {
    console.warn(`Could not pre-fetch live rows for ${streamTabName}:`, err.message);
  }

  // Live row resolver for PE - Analysis tab
  const livePeRowMap = {};
  const isG12 = String(grade || "12").trim() === "12";
  if (peMode && isG12) {
    try {
      const peRes = await sheets.spreadsheets.values.get({
        spreadsheetId: primaryId,
        range: `'PE - Analysis'!A1:B150`
      });
      const peRows = peRes.data.values || [];
      peRows.forEach((r, idx) => {
        const rNo = String(r[1] || r[0] || '').trim().toUpperCase();
        if (rNo) livePeRowMap[rNo] = idx + 1;
      });
    } catch (e) {}
  }

  const sheetUpdates = [];
  const BLOCK_START = { "CU 1": 3, "TE 1": 10, "CU 2": 17, "TE 2": 24 };
  const baseCol = BLOCK_START[examName];

  const isSubjectAllowed = (subj) => {
    if (!allowedCodes || !Array.isArray(allowedCodes)) return true;
    const target = toCanonicalSubject(subj);
    return allowedCodes.some(c => toCanonicalSubject(c) === target);
  };

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    const rollUpper = roll.toUpperCase();
    const st = mode.students[roll] || findStudentCI(mode.students, roll);
    const targetRow = liveRowMap[rollUpper] || (st ? st.rowIdx : null);

    if (st && targetRow) {
      if (!st.marks[examName]) st.marks[examName] = {};
      let sum = 0;
      mode.subjects.forEach((s, i) => {
        if (upd.marks && upd.marks[s] !== undefined && isSubjectAllowed(s)) {
          const raw = upd.marks[s];
          const isAB = String(raw || '').trim().toLowerCase() === 'ab';
          const isEmpty = raw === "" || raw == null || String(raw).trim() === "";
          const parsed = (isEmpty || isAB) ? 0 : parseFloat(raw);
          const val = isNaN(parsed) ? 0 : parsed;
          st.marks[examName][s] = val;
          sum += val;
          
          if (baseCol != null) {
            const colLetter = colIndexToLetter(baseCol + i);
            sheetUpdates.push({
              range: `'${streamTabName}'!${colLetter}${targetRow}`,
              values: [[val]]
            });
          }
        } else if (st.marks[examName][s] != null) {
          const existing = st.marks[examName][s];
          if (!isNaN(existing)) sum += existing;
        }
      });
      st.marks[examName].Total = sum;

      // Always write Total column (baseCol + 6) back to stream tab in Google Sheets
      if (baseCol != null) {
        const totalColLetter = colIndexToLetter(baseCol + 6);
        sheetUpdates.push({
          range: `'${streamTabName}'!${totalColLetter}${targetRow}`,
          values: [[sum]]
        });
      }

      // Also sync total in PE - Analysis tab in Google Sheets (Grade 12 only)
      if (peMode && isG12) {
        const peSt = peMode.students[roll] || findStudentCI(peMode.students, roll);
        const peTargetRow = livePeRowMap[rollUpper] || (peSt ? peSt.rowIdx : null);
        if (peSt && peTargetRow) {
          if (!peSt.exams[examName]) peSt.exams[examName] = {};
          peSt.exams[examName].total = sum;
          if (PE_COLS[examName] != null) {
            const peColLetter = colIndexToLetter(PE_COLS[examName]);
            sheetUpdates.push({
              range: `'PE - Analysis'!${peColLetter}${peTargetRow}`,
              values: [[sum]]
            });
          }
        }
      }
    }
  });

  if (sheetUpdates.length > 0) {
    await writeToBothSheets(sheets, grade, sheetUpdates);
  }

  recalculateRanksAndStats(data);
  return { success: true, count: updates.length };
}

async function updatePeTotals(updates, grade) {
  const sheets = await getSheetsClient();
  if (!sheets) {
    throw new Error("Google Sheets API credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) are missing in Netlify environment variables.");
  }

  const data = await reportApi.getData(grade);
  const peMode = data.modes["PE - Analysis"];
  if (!peMode) throw new Error("PE - Analysis mode not found");

  const primaryId = getSpreadsheetId(grade);
  const livePeRowMap = {};
  try {
    const peRes = await sheets.spreadsheets.values.get({
      spreadsheetId: primaryId,
      range: `'PE - Analysis'!A1:B150`
    });
    const peRows = peRes.data.values || [];
    peRows.forEach((r, idx) => {
      const rNo = String(r[1] || r[0] || '').trim().toUpperCase();
      if (rNo) livePeRowMap[rNo] = idx + 1;
    });
  } catch (e) {}

  const sheetUpdates = [];
  const PE_COLS = { "CU 1": 6, "TE 1": 8, "CU 2": 10, "TE 2": 12 }; // Total column 0-indexed index

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    const rollUpper = roll.toUpperCase();
    const peSt = peMode.students[roll] || findStudentCI(peMode.students, roll);
    const targetRow = livePeRowMap[rollUpper] || (peSt ? peSt.rowIdx : null);

    if (peSt && upd.exams && targetRow) {
      EXAMS.forEach(ex => {
        if (upd.exams[ex] !== undefined) {
          const raw = upd.exams[ex];
          const val = (raw === "" || raw == null || String(raw).toLowerCase() === "ab") ? 0 : parseFloat(raw);
          if (!peSt.exams[ex]) peSt.exams[ex] = {};
          peSt.exams[ex].total = isNaN(val) ? 0 : val;
          
          if (PE_COLS[ex] != null && String(grade || "12").trim() === "12") {
            const colLetter = colIndexToLetter(PE_COLS[ex]);
            sheetUpdates.push({
              range: `'PE - Analysis'!${colLetter}${targetRow}`,
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

  if (sheetUpdates.length > 0) {
    await writeToBothSheets(sheets, grade, sheetUpdates);
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

async function updateMentorLinks(examName, updates, grade) {
  const sheets = await getSheetsClient();
  if (!sheets) {
    throw new Error("Google Sheets API credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) are missing in Netlify environment variables.");
  }

  const data = await reportApi.getData(grade);
  const peMode = data.modes["PE - Analysis"];
  if (!peMode) throw new Error("Could not load student list for Mentor Report updates.");

  const primaryId = getSpreadsheetId(grade);
  const liveMentorRowMap = {};
  try {
    const mRes = await sheets.spreadsheets.values.get({
      spreadsheetId: primaryId,
      range: `'Mentor Report'!A1:B150`
    });
    const mRows = mRes.data.values || [];
    mRows.forEach((r, idx) => {
      const rNo = String(r[1] || r[0] || '').trim().toUpperCase();
      if (rNo) liveMentorRowMap[rNo] = idx + 1;
    });
  } catch (e) {}

  const sheetUpdates = [];
  const EXAM_IDX = EXAMS.indexOf(examName);
  if (EXAM_IDX === -1) throw new Error(`Unknown exam: ${examName}`);
  const baseCol = 3 + EXAM_IDX; // 0-indexed column

  (updates || []).forEach(upd => {
    const roll = String(upd.rollNo).trim();
    const rollUpper = roll.toUpperCase();
    if (!roll) return;
    const mentorNode = data.mentorLinks[roll] || data.mentorLinks[rollUpper];
    const targetRow = liveMentorRowMap[rollUpper] || (mentorNode ? mentorNode.rowIdx : null);

    if (targetRow) {
      if (upd.marks && upd.marks["Link"] !== undefined) {
        const val = upd.marks["Link"] || "";
        const colLetter = colIndexToLetter(baseCol);
        sheetUpdates.push({
          range: `'Mentor Report'!${colLetter}${targetRow}`,
          values: [[val]]
        });
      }
    }
  });

  if (sheetUpdates.length > 0) {
    await writeToBothSheets(sheets, grade, sheetUpdates);
  }

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
            const isAB = String(valRaw || '').trim().toLowerCase() === 'ab';
            const val = (valRaw == null || valRaw === '' || isAB) ? null : parseFloat(valRaw);
            st.marks[exn][s] = isAB ? 'AB' : val;
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
    // 1. Domain (stream) ranks
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

    // 2. School-wide overall ranks directly from total marks
    const allSts = Object.keys(peMode.students).map(r => peMode.students[r]);
    const validAll = allSts.filter(st => st.exams[exn] && st.exams[exn].total > 0);
    validAll.sort((a, b) => b.exams[exn].total - a.exams[exn].total);
    let sPrevTot = -1, sPrevRk = 1;
    validAll.forEach((st, i) => {
      const tot = st.exams[exn].total;
      if (tot !== sPrevTot) { sPrevRk = i + 1; sPrevTot = tot; }
      st.exams[exn].rank = sPrevRk;
    });

    allSts.forEach(st => {
      if (!st.exams[exn] || !st.exams[exn].total || st.exams[exn].total <= 0) {
        if (st.exams[exn]) {
          st.exams[exn].rank = null;
          st.exams[exn].domainRank = null;
        }
      }
    });
  });
}

/* ── PE Analysis ── returns totals, ranks, and score-range stats ── */
async function getPeAnalysis(grade, forceFresh) {
  const data = await reportApi.getData(grade, forceFresh);
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
