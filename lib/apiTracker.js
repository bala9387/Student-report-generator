const fs = require('fs');
const path = require('path');
const os = require('os');

// Persist in project scratch directory if writable, else OS temp dir
const localDir = path.join(__dirname, '..', 'scratch');
const baseDir = fs.existsSync(localDir) ? localDir : os.tmpdir();
const STATE_FILE = path.join(baseDir, 'api_usage_state.json');

let state = {
  currentSpend: 0.00,
  spendCap: 1000.00,
  currency: "INR",
  currencySymbol: "₹",
  totalRequests: 0,
  lastUpdated: new Date().toISOString(),
  logs: []
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(content);
      // Filter out legacy dummy/mock logs if any exist
      if (Array.isArray(parsed.logs)) {
        parsed.logs = parsed.logs.filter(l => 
          l.subject !== "Physics XII Paper" && 
          l.subject !== "Chemistry XII Paper" && 
          l.subject !== "Mathematics XII Paper" && 
          l.subject !== "Computer Science Paper"
        );
      }
      state = { ...state, ...parsed };
    }
  } catch (e) {}
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

loadState();

function getUsageData() {
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  return {
    ...state,
    primaryModel: configuredModel
  };
}

function updateSpendCap(newCap) {
  const cap = parseFloat(newCap);
  if (!isNaN(cap) && cap >= 0) {
    state.spendCap = cap;
    state.lastUpdated = new Date().toISOString();
    saveState();
    return true;
  }
  return false;
}

function updateCurrentSpend(newSpend) {
  const spend = parseFloat(newSpend);
  if (!isNaN(spend) && spend >= 0) {
    state.currentSpend = Math.round(spend * 100) / 100;
    state.lastUpdated = new Date().toISOString();
    saveState();
    return true;
  }
  return false;
}

function updateTotalRequests(newTotal) {
  const tot = parseInt(newTotal, 10);
  if (!isNaN(tot) && tot >= 0) {
    state.totalRequests = tot;
    state.lastUpdated = new Date().toISOString();
    saveState();
    return true;
  }
  return false;
}

function clearLogs(resetCounters) {
  state.logs = [];
  if (resetCounters) {
    state.currentSpend = 0.00;
    state.totalRequests = 0;
  }
  state.lastUpdated = new Date().toISOString();
  saveState();
  return true;
}

function recordApiCall(details) {
  details = details || {};
  const cost = details.cost != null ? details.cost : 0.12;
  state.currentSpend = Math.round((state.currentSpend + cost) * 100) / 100;
  state.totalRequests += 1;
  state.lastUpdated = new Date().toISOString();
  
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    model: details.model || configuredModel,
    subject: details.subject || "AI Evaluation",
    tokens: details.tokens || 4200,
    cost: cost,
    status: details.status || "Success"
  };
  
  state.logs.unshift(logEntry);
  if (state.logs.length > 100) state.logs = state.logs.slice(0, 100);
  saveState();
}

module.exports = {
  getUsageData,
  updateSpendCap,
  updateCurrentSpend,
  updateTotalRequests,
  clearLogs,
  recordApiCall
};
