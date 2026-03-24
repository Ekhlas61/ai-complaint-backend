const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config();

async function getResetToken(email) {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    if (!user.resetPasswordToken) {
      console.log('No reset token found for this user');
      return;
    }
    
    console.log(`User: ${user.email}`);
    console.log(`Reset Token (hashed in DB): ${user.resetPasswordToken}`);
    console.log(`Token expires at: ${user.resetPasswordExpire}`);
    
    // Note: The token in the database is hashed. 
    // The actual token sent in the email is the unhashed version.
    // You need to use the token from the email preview URL.
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.log('Usage: node get-reset-token.js <email>');
  process.exit(1);
}

getResetToken(email);
