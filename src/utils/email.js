const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  // Use environment variables for real SMTP (Gmail, SendGrid, etc.)
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io', // ← change to real
    port: process.env.EMAIL_PORT || 2525,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Complaint System" <${process.env.EMAIL_FROM || 'no-reply@yourapp.com'}>`,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;