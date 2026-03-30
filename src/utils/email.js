const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  // If SMTP credentials are provided, use them. Otherwise create an Ethereal test account
  let transporter;
  let usingTestAccount = false;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_PORT === 465, // true for port 465, false for others
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Create a disposable Ethereal account for testing when real SMTP is not configured
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      usingTestAccount = true;
    } catch (err) {
      return { error: `Failed to create test SMTP account: ${err.message}`, stack: err.stack };
    }
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Complaint System" <no-reply@yourapp.com>',
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    // If using Ethereal (either test account or provided credentials), return the preview URL
    if (usingTestAccount || process.env.EMAIL_HOST?.includes('ethereal.email')) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      return { info, previewUrl };
    }

    // For real email services (Gmail), just return success info
    return { info, success: true };
  } catch (err) {
    // Return error details to caller so higher-level handlers can decide how to respond
    return { error: err.message, stack: err.stack };
  }
};

// Generate OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { sendEmail, generateOTP };