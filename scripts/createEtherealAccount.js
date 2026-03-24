const nodemailer = require('nodemailer');

(async () => {
  try {
    const testAccount = await nodemailer.createTestAccount();

    console.log('\nEthereal test SMTP account created. Paste these into your .env file:');
    console.log(`EMAIL_HOST=smtp.ethereal.email`);
    console.log(`EMAIL_PORT=587`);
    console.log(`EMAIL_USER=${testAccount.user}`);
    console.log(`EMAIL_PASS=${testAccount.pass}`);
    console.log(`EMAIL_FROM=No Reply <${testAccount.user}>`);
    console.log('\nYou can view sent messages at https://ethereal.email using the above credentials.');
    console.log('\nExample .env lines (append to your existing .env):\n');
    console.log(`# SMTP (Ethereal)\nEMAIL_HOST=smtp.ethereal.email\nEMAIL_PORT=587\nEMAIL_USER=${testAccount.user}\nEMAIL_PASS=${testAccount.pass}\nEMAIL_FROM=\"Complaint System\" <${testAccount.user}>\n`);
    process.exit(0);
  } catch (err) {
    console.error('Could not create ethereal account:', err);
    process.exit(1);
  }
})();
