/* Stateless session token for the staff-only tools.
 *
 * A successful login mints a short token = base64("<expiry>.<hmac>") where the
 * HMAC is keyed with ADMIN_PASS. Any endpoint that costs money (e.g. the Gemini
 * report generator) verifies this token server-side, so the browser can't just
 * skip the login screen and hit the API directly. Nothing is stored on the
 * server — verification only needs ADMIN_PASS, which every function already has.
 */
const crypto = require('crypto');

function secret() { return process.env.ADMIN_PASS || ''; }

function sign(until) {
  const h = crypto.createHmac('sha256', secret()).update(String(until)).digest('hex');
  return Buffer.from(String(until) + '.' + h).toString('base64');
}

function verify(token) {
  if (!token || !secret()) return false;
  try {
    const raw = Buffer.from(String(token), 'base64').toString('utf8');
    const dot = raw.indexOf('.');
    if (dot < 0) return false;
    const until = raw.slice(0, dot);
    const given = raw.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret()).update(until).digest('hex');
    if (given.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return false;
    return Number(until) > Date.now();
  } catch (e) {
    return false;
  }
}

module.exports = { sign, verify };
