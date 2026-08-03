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

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const user = authToken.verify(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const currentPass = (body.currentPassword || '').trim();
    const newPass = (body.newPassword || '').trim();

    if (!currentPass || !newPass) {
      return res.status(400).json({ error: 'Please enter both your current password and new password.' });
    }

    if (newPass.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const validLogin = teacherAccounts.verifyTeacherLogin(user, currentPass);
    if (!validLogin || !validLogin.ok) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const updated = teacherAccounts.updateTeacherPassword(user, newPass);
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update password.' });
    }

    return res.status(200).json({ ok: true, message: 'Password updated successfully!' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
