require('dotenv').config();
const sendEmail = require('../src/utils/email');

(async () => {
  try {
    const res = await sendEmail({
      to: process.env.TEST_EMAIL || 'admin@eep.com.et',
      subject: 'Test Email',
      html: '<p>Test</p>',
    });
    console.log('sendEmail result:', res);
    process.exit(0);
  } catch (err) {
    console.error('sendEmail error:', err);
    process.exit(1);
  }
})();
