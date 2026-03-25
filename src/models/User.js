const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
   
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
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

    lastLogin: {
      type: Date,
      default: null,
    },
    
  },
  {
    timestamps: true,
  }
);


// Indexes

userSchema.index({ role: 1 });
userSchema.index({ organization: 1 });

module.exports = mongoose.model('User', userSchema);