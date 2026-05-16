const nodemailer = require('nodemailer');
const axios = require('axios');

const sendEmail = async ({ to, subject, html }) => {
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.RENDER === 'true' ||
                       !!process.env.RENDER; // Render sets RENDER env var in production
  
  // CRITICAL: Check for Resend API key in production
  if (isProduction && !process.env.RESEND_API_KEY) {
    console.error('[EMAIL] ⚠️  CRITICAL ERROR: Production environment detected but RESEND_API_KEY is not set!');
    console.error('[EMAIL] Email sending will fail. Please add RESEND_API_KEY environment variable.');
    return { 
      error: 'CRITICAL: Email service not configured. RESEND_API_KEY environment variable must be set for email functionality in production.',
      code: 'MISSING_RESEND_KEY',
      critical: true
    };
  }
  // Try Resend API first (works on cloud platforms that block SMTP)
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[EMAIL] Attempting to send via Resend API to ${to}`);
      
      // Use Resend's default sender if no custom domain is verified
      const fromAddress = process.env.RESEND_FROM || 'onboarding@resend.dev';
      
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from: fromAddress,
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

      console.log(`[EMAIL] ✓ Successfully sent via Resend to ${to}, messageId: ${response.data.id}`);
      return { 
        info: { messageId: response.data.id }, 
        success: true, 
        method: 'resend',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('[EMAIL] ✗ Resend API failed:', {
        to,
        error: err.message,
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        responseData: err.response?.data,
      });
      
      // On production/Render, don't fallback to SMTP (will fail anyway)
      if (isProduction) {
        console.error('[EMAIL] Production environment - not falling back to SMTP');
        const errorMessage = err.response?.status === 403 
          ? 'Resend API authentication failed. Please check your RESEND_API_KEY and verify your domain in Resend dashboard.'
          : `Resend API failed: ${err.message}`;
        
        return { 
          error: errorMessage,
          code: err.code || 'RESEND_FAILED',
          status: err.response?.status,
          details: err.response?.data,
        };
      }
    }
  }

  // Fallback to SMTP (only for development/local)
  console.log('[EMAIL] Falling back to SMTP...');
  let transporter;
  let usingTestAccount = false;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !isProduction) {
    console.log(`[EMAIL] Using configured SMTP: ${process.env.EMAIL_HOST}`);
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      family: 4,
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else if (!isProduction) {
    try {
      console.log('[EMAIL] Creating test Ethereal account...');
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
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      });
      usingTestAccount = true;
      console.log('[EMAIL] Test account created successfully');
    } catch (err) {
      console.error('[EMAIL] Failed to create test account:', err.message);
      return { 
        error: `Failed to create test SMTP account: ${err.message}`, 
        stack: err.stack,
        code: 'TEST_ACCOUNT_FAILED'
      };
    }
  } else {
    console.error('[EMAIL] Production environment but no Resend API key - cannot send email');
    return { 
      error: 'Email service not configured for production. Please set RESEND_API_KEY.',
      code: 'NO_EMAIL_SERVICE',
    };
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Complaint System" <no-reply@yourapp.com>',
    to,
    subject,
    html,
  };

  try {
    console.log(`[EMAIL] Sending via SMTP to ${to}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] ✓ Successfully sent via SMTP to ${to}, messageId: ${info.messageId}`);

    if (usingTestAccount || process.env.EMAIL_HOST?.includes('ethereal.email')) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      return { 
        info, 
        previewUrl, 
        method: 'smtp',
        timestamp: new Date().toISOString()
      };
    }

    return { 
      info, 
      success: true, 
      method: 'smtp',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[EMAIL] ✗ SMTP email sending failed:', {
      to,
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      error: err.message,
      code: err.code,
      stack: err.stack,
    });
    return { 
      error: err.message, 
      code: err.code, 
      stack: err.stack,
      timestamp: new Date().toISOString()
    };
  }
};

// Generate OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { sendEmail, generateOTP };