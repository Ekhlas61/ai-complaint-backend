const sendEmail = require('../utils/email');

exports.sendTestEmail = async (req, res) => {
  try {
    const to = req.body.to || process.env.TEST_EMAIL || 'admin@eep.com.et';
    const subject = req.body.subject || 'Test Email from Debug Route';
    const html = req.body.html || '<p>This is a test email.</p>';

    const result = await sendEmail({ to, subject, html });

    return res.json({ message: 'Sent (or queued)', result });
  } catch (err) {
    console.error('Debug send email error:', err);
    return res.status(500).json({ message: 'Debug send failed', error: err.message, stack: err.stack });
  }
};
