const nodemailer = require('nodemailer');
const axios = require('axios');

const sendEmail = async ({ to, subject, html }) => {
  // Try Resend API first (works on cloud platforms that block SMTP)
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`Attempting to send email via Resend API to ${to}`);
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from: process.env.EMAIL_FROM || '"Complaint System" <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log(`Email sent successfully via Resend to ${to}, messageId: ${response.data.id}`);
      return { info: { messageId: response.data.id }, success: true, method: 'resend' };
    } catch (err) {
      console.error('Resend API email sending failed:', {
        to,
        error: err.message,
        code: err.code,
        response: err.response?.data,
      });
      // Continue to try SMTP as fallback
    }
  }

  // Fallback to SMTP (will fail on platforms that block outbound SMTP)
  let transporter;
  let usingTestAccount = false;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      family: 4,
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
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
    console.log(`Attempting to send email via SMTP to ${to}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully via SMTP to ${to}, messageId: ${info.messageId}`);

    if (usingTestAccount || process.env.EMAIL_HOST?.includes('ethereal.email')) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      return { info, previewUrl, method: 'smtp' };
    }

    return { info, success: true, method: 'smtp' };
  } catch (err) {
    console.error('SMTP email sending failed:', {
      to,
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      error: err.message,
      code: err.code,
      stack: err.stack,
    });
    return { error: err.message, code: err.code, stack: err.stack };
  }
};

// Generate OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { sendEmail, generateOTP };