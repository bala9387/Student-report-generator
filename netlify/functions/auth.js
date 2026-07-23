const api = require('../../lib/reportApi.js');
const token = require('../../lib/authToken.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server credentials not configured' }) };
  }

  if (body.username === validUser && body.password === validPass) {
    const until = Date.now() + 8 * 3600 * 1000;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, until, token: token.sign(until) })
    };
  }

  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: 'Invalid username or password' })
  };
};
