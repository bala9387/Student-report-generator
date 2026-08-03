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
    const authRes = teacherAccounts.verifyTeacherLogin(body.user, body.pass);

    if (authRes && authRes.ok) {
      const expires = Date.now() + 8 * 60 * 60 * 1000;
      const token = authToken.sign(expires, authRes.user);
      return res.status(200).json({ ok: true, token, expires, teacher: authRes });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
