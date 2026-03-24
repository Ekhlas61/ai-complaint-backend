const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    employeeID: {
      type: String,
      unique: true,
      sparse: true, // only for DeptAdmin / OrgAdmin / SysAdmin
    },

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },

    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
    },

    role: {
      type: String,
      enum: ['Citizen', 'DeptAdmin', 'OrgAdmin', 'SysAdmin'],
      required: true,
      default: 'Citizen',
    },

    loginMethod: {
      type: String,
      enum: ['manual', 'sso'],
      default: 'manual',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    organization: {
    type: String,
    enum: ['EEP', 'AAWSA'],
    default: null,
  },

   department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
  },
    resetPasswordToken: {
        type: String,
        default: null,
    },

    resetPasswordExpire: {
        type: Date,
        default: null,
    },

    lastLogin: Date,

    
  },
  {
    timestamps: true,
  }
);


// Prevent Citizen from having employeeID
userSchema.pre('save', async function () {
  if (this.role === 'Citizen') {
    this.employeeID = undefined;
  }
 
});

module.exports = mongoose.model('User', userSchema);