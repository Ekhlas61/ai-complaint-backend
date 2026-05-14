const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  // If SMTP credentials are provided, use them. Otherwise create an Ethereal test account
  let transporter;
  let usingTestAccount = false;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465, // true for port 465, false for others
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Force IPv4 and increase timeouts for production environments
      family: 4, // Force IPv4
      connectionTimeout: 30000, // 30 seconds
      greetingTimeout: 15000, // 15 seconds
      socketTimeout: 30000, // 30 seconds
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates if needed
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
        // Force IPv4 and increase timeouts
        family: 4,
        connectionTimeout: 30000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
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
    console.log(`Attempting to send email to ${to} via ${usingTestAccount ? 'Ethereal test account' : process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}, messageId: ${info.messageId}`);

    // If using Ethereal (either test account or provided credentials), return the preview URL
    if (usingTestAccount || process.env.EMAIL_HOST?.includes('ethereal.email')) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      return { info, previewUrl };
    }

    // For real email services (Gmail), just return success info
    return { info, success: true };
  } catch (err) {
    // Log detailed error information for debugging
    console.error('Email sending failed:', {
      to,
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      error: err.message,
      code: err.code,
      stack: err.stack,
    });
    // Return error details to caller so higher-level handlers can decide how to respond
    return { error: err.message, code: err.code, stack: err.stack };
  }
};

// Generate OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { sendEmail, generateOTP };