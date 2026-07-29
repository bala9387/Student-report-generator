/* Stateless session token for the staff-only tools.
 *
 * A successful login mints a short token = base64("<expiry>.<hmac>") where the
 * HMAC is keyed with ADMIN_PASS. Any endpoint that costs money (e.g. the Gemini
 * report generator) verifies this token server-side, so the browser can't just
 * skip the login screen and hit the API directly. Nothing is stored on the
 * server — verification only needs ADMIN_PASS, which every function already has.
 */
const crypto = require('crypto');

function secret() { return process.env.ADMIN_PASS || 'aksharaacademy@98?'; }

function sign(until, user) {
  const payload = String(until) + ':' + (user || '');
  const h = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(payload + '.' + h).toString('base64');
}

function verify(token) {
  if (!token || !secret()) return false;
  try {
    const raw = Buffer.from(String(token), 'base64').toString('utf8');
    const dot = raw.lastIndexOf('.');
    if (dot < 0) return false;
    const payload = raw.slice(0, dot);
    const given = raw.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
    if (given.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return false;
    
    const parts = payload.split(':');
    const until = Number(parts[0]);
    if (until <= Date.now()) return false;

    return { valid: true, user: parts[1] || '' };
  } catch (e) {
    return false;
  }
}

module.exports = { sign, verify };
