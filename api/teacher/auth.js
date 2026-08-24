const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

// Simple in-memory rate limiting
const loginAttempts = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = [];
  loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
  if (loginAttempts[ip].length >= MAX_ATTEMPTS) return false;
  loginAttempts[ip].push(now);
  return true;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(loginAttempts)) {
    loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
    if (loginAttempts[ip].length === 0) delete loginAttempts[ip];
  }
}, 5 * 60 * 1000);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    if (!body || typeof body !== 'object') {
      body = {};
    }

    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ ok: false, error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    const userVal = (body.user || body.username || '').trim();
    const passVal = (body.pass || body.password || '').trim();

    if (!userVal || !passVal) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }

    const authRes = teacherAccounts.verifyTeacherLogin(userVal, passVal);

    if (authRes && authRes.ok) {
      const expires = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      const token = authToken.sign(expires, authRes.user);
      return res.status(200).json({ ok: true, token, expires, until: expires, teacher: authRes });
    }
    return res.status(401).json({ ok: false, error: 'Invalid username or password. Check spelling and case of your password.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error: ' + e.message });
  }
};
