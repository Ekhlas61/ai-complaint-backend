const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  actionType: {
    type: String,
    enum: [
      'LOGIN', 'LOGOUT', 'CREATE_REPORT',
      'UPDATE_STATUS', 'ASSIGN_REPORT',
      'ADD_COMMENT', 'USER_CREATE'
    ],
  },
  actionDescription: String,
  entityName: String,
  entityID: String,
  sessionID: String,
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
