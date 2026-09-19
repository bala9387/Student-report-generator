const authToken = require('../../lib/authToken.js');
const teacherAccounts = require('../../lib/teacherAccounts.js');
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) {}

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

    const action = req.query.action || body.action || '';

    // Action 1: Change Password
    if (action === 'change-password' || req.url.includes('change-password')) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });
      const user = authToken.verify(token);
      if (!user) return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });

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
      if (!updated) return res.status(500).json({ error: 'Failed to update password.' });
      return res.status(200).json({ ok: true, message: 'Password updated successfully!' });
    }

    // Action 2: Forgot Password
    if (action === 'forgot-password' || req.url.includes('forgot-password')) {
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'Please provide your registered Staff Email ID or Username.' });

      const account = teacherAccounts.getTeacherAccount(email);
      if (!account) {
        return res.status(200).json({
          ok: true,
          emailSent: false,
          message: 'If an account with this email exists, password reset instructions will be sent. Please contact the school administrator.'
        });
      }

      const recipientEmail = account.email || (email.includes('@') ? email : (email + '@ksrakshara.org'));
      let emailSent = false;
      if (nodemailer && (process.env.SMTP_HOST || process.env.GMAIL_USER)) {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER || process.env.GMAIL_USER,
              pass: process.env.SMTP_PASS || process.env.GMAIL_PASS
            }
          });
          await transporter.sendMail({
            from: '"KSR Akshara Academy" <' + (process.env.GMAIL_USER || 'noreply@ksrakshara.org') + '>',
            to: recipientEmail,
            subject: 'Teacher Portal Password Reset — KSR Akshara Academy',
            html: `
              <div style="font-family:sans-serif;padding:20px;color:#0f172a;">
                <h2 style="color:#1d4ed8;">KSR Akshara Academy</h2>
                <p>Hello <strong>${account.name}</strong>,</p>
                <p>We received a password reset request for your Teacher Portal account (<code>${recipientEmail}</code>).</p>
                <p>A password reset has been requested. Please contact your administrator for assistance.</p>
                <p style="font-size:0.85rem;color:#64748b;margin-top:20px;">If you did not request this, please contact the administrator.</p>
              </div>
            `
          });
          emailSent = true;
        } catch (mailErr) {
          console.error('[forgot-password] Email sending failed:', mailErr.message);
        }
      }

      return res.status(200).json({
        ok: true,
        emailSent,
        message: emailSent
          ? `Password reset instructions sent to ${recipientEmail}. Check your inbox.`
          : 'Password reset request received. Please contact the school administrator (aksharaacademy) to reset your password.'
      });
    }

    // Default Action: Standard Staff Login
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
