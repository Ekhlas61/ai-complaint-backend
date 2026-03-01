const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  employeeID: {
    type: String,
    unique: true,
    sparse: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  passwordHash: {
    type: String,
  },
  role: {
    type: String,
    enum: ['Employee', 'DeptAdmin', 'SysAdmin'],
    default: 'Employee',
  },
  loginMethod: {
    type: String,
    enum: ['SSO', 'Manual'],
    default: 'Manual',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
