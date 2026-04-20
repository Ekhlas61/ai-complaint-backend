const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
   // to show the user who performed the action
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who performed the action is required'],
      index: true,
    },

    // this shows the action what was performed
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

    // this is the description of the action performed
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // this the entity that was affected
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

    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      comment: 'Previous state (e.g., old status, old assigned user)',
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      comment: 'New state after the action',
    },

    // to filter by organizaition
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      required: [true, 'Organization ID is required for audit context'],
    },

  
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      required: true,
      default: 'SUCCESS',
    },
    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },

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

// immutability rules
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable – updates are forbidden');
});
auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit logs are immutable – updates are forbidden');
});
auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit logs cannot be deleted');
});
auditLogSchema.pre('deleteMany', function () {
  throw new Error('Audit logs cannot be deleted');
});
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('Audit logs cannot be deleted');
});



//indexes
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ orgId: 1, createdAt: -1 });           
auditLogSchema.index({ status: 1 });                         

module.exports = mongoose.model('AuditLog', auditLogSchema);