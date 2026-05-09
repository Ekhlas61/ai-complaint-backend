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
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
    },
    role: {
      type: String,
      enum: ['Citizen', 'DeptHead', 'DeptAdmin', 'OrgAdmin', 'OrgHead', 'SysAdmin'],
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
    resetPasswordOTP: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLogoutAt: {
      type: Date,
      default: null,
    },
    refreshTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        deviceId: {
          type: String,
          required: true,
        },
        deviceName: {
          type: String,
          default: 'Unknown',
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        isRevoked: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ organization: 1, role: 1 }, {
  unique: true,
  name: 'unique_active_orgadmin_per_org',
  partialFilterExpression: { role: 'OrgAdmin', organization: { $exists: true, $ne: null } },
});
userSchema.index({ department: 1, role: 1 }, {
  unique: true,
  name: 'unique_active_depthead_per_dept',
  partialFilterExpression: { role: 'DeptHead', department: { $exists: true, $ne: null } },
});
userSchema.index({ organization: 1, role: 1 }, {
  unique: true,
  name: 'unique_active_orghead_per_org',
  partialFilterExpression: { role: 'OrgHead', organization: { $exists: true, $ne: null } },
});

module.exports = mongoose.model('User', userSchema);