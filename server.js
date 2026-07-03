const express = require('express');
const cors = require('cors');
const path = require('path');
// We require the same datasource logic, but run it safely on the backend!
const ReportSource = require('./datasource.js');

const app = express();
app.use(cors());

// Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(__dirname, { index: 'index.html' }));

let cachedData = null;
let lastFetch = null;
const CACHE_TTL = 5 * 60 * 1000; // Cache sheet for 5 minutes to avoid rate limits

async function getData() {
  if (cachedData && (Date.now() - lastFetch < CACHE_TTL)) {
    return cachedData;
  }
  
  console.log("Fetching live data from Google Sheets...");
  try {
    const result = await ReportSource.loadReportData();
    cachedData = result.data;
    lastFetch = Date.now();
    return cachedData;
  } catch (err) {
    console.error("Failed to fetch from Google Sheets:", err);
    if (cachedData) return cachedData; // Fallback to stale cache if sheet is down
    
    // If we have no cache, try loading the offline fallback data.js
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
    } catch(e) {
       console.error("Local fallback failed:", e);
    }
    
    throw err;
  }
}

// SECURE API ENDPOINT: Returns only ONE student's record
app.get('/api/student', async (req, res) => {
  try {
    const roll = (req.query.roll || '').toUpperCase().trim();
    const mode = req.query.mode;
    
    if (!roll || !mode) {
      return res.status(400).json({ error: 'Roll number and mode are required' });
    }

    const data = await getData();
    
    const modeData = data.modes[mode];
    if (!modeData) {
      return res.status(404).json({ error: 'Mode not found' });
    }
    
    // Find the specific student case-insensitively
    let studentRecord = null;
    if (modeData.students[roll]) {
        studentRecord = modeData.students[roll];
    } else {
        for (const k in modeData.students) {
            if (k.toUpperCase() === roll) {
                studentRecord = modeData.students[k];
                break;
            }
        }
    }
    
    // STRIP OUT ALL OTHER STUDENTS! This is the security fix.
    const safeModeData = {
      type: modeData.type,
      label: modeData.label,
      exams: modeData.exams,
      conducted: modeData.conducted,
      classSize: modeData.classSize,
      topper: modeData.topper,
      classStats: modeData.classStats,
      subjects: modeData.subjects,
      subjectFull: modeData.subjectFull
    };

    // Return the safe payload
    res.json({
      live: true,
      when: lastFetch,
      meta: data.meta,
      rollIndex: data.rollIndex, // Needed for the "Also available in..." UI feature
      mode: safeModeData,
      student: studentRecord
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Failed to load report data', details: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Secure Server running on http://localhost:${PORT}`);
  // Initial fetch to prime the cache
  getData().catch(console.error);
});
