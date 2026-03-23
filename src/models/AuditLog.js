const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who performed the action is required'],
      index: true,
    },

    // Action type – limited to exactly what you requested
    action: {
      type: String,
      required: true,
      enum: [
        'LOGIN',
        'LOGOUT',
        'COMPLAINT_CREATE',
        'UPDATE_STATUS',
        'ASSIGN_COMPLAINT',
        'ADD_COMMENT',
        'USER_CREATE',
        'USER_UPDATE',
        'USER_DEACTIVATE',
        'DEPARTMENT_CREATE',
        'DEPARTMENT_UPDATE',
        'DEPARTMENT_DEACTIVATE',
      ],
      index: true,
    },

    // Human-readable explanation (required)
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // What was affected
    targetType: {
      type: String,
      enum: ['User', 'Complaint', 'Department'],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Optional – IP address (useful for basic security tracking)
    ip: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Recommended indexes for common queries
auditLogSchema.index({ user: 1, createdAt: -1 });                    // Recent actions by user
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 }); // Actions on specific entity
auditLogSchema.index({ action: 1, createdAt: -1 });                  // All actions of one type
auditLogSchema.index({ createdAt: -1 });                             // Time-based overview

module.exports = mongoose.model('AuditLog', auditLogSchema);