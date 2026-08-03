const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');

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

    const userVal = body.user || '';
    const passVal = body.pass || '';

    if (!userVal || !passVal) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const authRes = teacherAccounts.verifyTeacherLogin(userVal, passVal);

    if (authRes && authRes.ok) {
      const expires = Date.now() + 8 * 60 * 60 * 1000;
      const token = authToken.sign(expires, authRes.user);
      return res.status(200).json({ ok: true, token, expires, teacher: authRes });
    }
    return res.status(401).json({ error: 'Invalid username or password. Check spelling and case of your password.' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
