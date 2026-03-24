require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = await User.find({}, 'email role fullName').lean();
    console.log('Found users:', users.length);
    users.forEach(u => console.log(u.email, '-', u.role, '-', u.fullName));
    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err);
    process.exit(1);
  }
};

run();
