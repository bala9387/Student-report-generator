const authToken = require('../../../lib/authToken.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const user = (body.user || '').trim();
    const pass = (body.pass || '').trim();
    const expectedUser = process.env.ADMIN_USER || 'aksharaacademy';
    const expectedPass = process.env.ADMIN_PASS || 'aksharaacademy@98?';

    if (user.toLowerCase() === expectedUser.toLowerCase() && pass === expectedPass) {
      const expires = Date.now() + 8 * 60 * 60 * 1000;
      const token = authToken.sign(expires);
      return res.status(200).json({ ok: true, token, expires });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
