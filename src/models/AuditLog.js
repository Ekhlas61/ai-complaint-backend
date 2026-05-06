const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who performed the action is required'],
      index: true,
    },

    action: {
      type: String,
      required: true,
      enum: [
        // Authentication (admin roles only)
        'LOGIN',
        'LOGOUT',
        
        // User Management
        'USER_CREATE',
        'USER_UPDATE', 
        'USER_DEACTIVATE',
        'USER_ROLE_CHANGE',
        
        // Organization Management (SysAdmin only)
        'ORGANIZATION_CREATE',
        'ORGANIZATION_UPDATE',
        'ORGANIZATION_DEACTIVATE',
        
        // Department Management (OrgAdmin)
        'DEPARTMENT_CREATE',
        'DEPARTMENT_UPDATE',
        'DEPARTMENT_DEACTIVATE',
        
      ],
      index: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    targetType: {
      type: String,
      enum: ['User', 'Organization', 'Department', 'System'],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      required: false,
      default: null,
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
    
    // Track which admin role performed the action
    adminRole: {
      type: String,
      enum: ['SysAdmin', 'OrgAdmin'],
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for efficient sysadmin queries
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminRole: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ 'user.role': 1, createdAt: -1 });
auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });



module.exports = mongoose.model('AuditLog', auditLogSchema);