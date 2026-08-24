const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join('/tmp', 'api_usage_state.json');

let state = {
  currentSpend: 49.94,
  spendCap: 1000.00,
  currency: "INR",
  currencySymbol: "₹",
  totalRequests: 14,
  lastUpdated: new Date().toISOString(),
  logs: [
    { id: 1, timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), model: "gemini-1.5-flash", subject: "Physics XII Paper", tokens: 4250, cost: 0.12, status: "Success" },
    { id: 2, timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), model: "gemini-1.5-flash", subject: "Chemistry XII Paper", tokens: 3820, cost: 0.11, status: "Success" },
    { id: 3, timestamp: new Date(Date.now() - 3600000 * 12).toISOString(), model: "gemini-1.5-flash", subject: "Mathematics XII Paper", tokens: 5100, cost: 0.15, status: "Success" },
    { id: 4, timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), model: "gemini-1.5-flash", subject: "Computer Science Paper", tokens: 4900, cost: 0.14, status: "Success" }
  ]
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(content);
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
  return state;
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

function clearLogs() {
  state.logs = [];
  state.lastUpdated = new Date().toISOString();
  saveState();
  return true;
}

function recordApiCall(details) {
  const cost = details.cost || 0.12;
  state.currentSpend = Math.round((state.currentSpend + cost) * 100) / 100;
  state.totalRequests += 1;
  state.lastUpdated = new Date().toISOString();
  
  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    model: details.model || "gemini-1.5-flash",
    subject: details.subject || "AI Evaluation",
    tokens: details.tokens || 4200,
    cost: cost,
    status: details.status || "Success"
  };
  
  state.logs.unshift(logEntry);
  if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
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
