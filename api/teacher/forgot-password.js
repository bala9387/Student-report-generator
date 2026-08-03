const teacherAccounts = require('../../lib/teacherAccounts.js');
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) {}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Please provide your registered Staff Email ID or Username.' });
    }

    const account = teacherAccounts.getTeacherAccount(email);
    if (!account) {
      return res.status(404).json({ error: 'No staff account found with this email address. Please check spelling.' });
    }

    const recipientEmail = account.email || (email.includes('@') ? email : (email + '@ksrakshara.org'));
    
    // Attempt sending email via nodemailer if SMTP credentials are environment configured
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
              <p>Your current standard login password is: <strong>Akshara@123</strong></p>
              <p style="font-size:0.85rem;color:#64748b;margin-top:20px;">If you did not request this, please contact the administrator.</p>
            </div>
          `
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('[Forgot Password] Email send error:', mailErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      emailSent: emailSent,
      message: emailSent
        ? `Password instructions have been emailed to ${recipientEmail}. Please check your inbox.`
        : `Reset instructions processed for ${account.name} (${recipientEmail}). Please contact Administrator or use default password Akshara@123.`
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
