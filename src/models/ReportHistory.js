const mongoose = require('mongoose');

const reportHistorySchema = new mongoose.Schema({
  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
  },
  action: {
    type: String,
    enum: [
      'CREATE_REPORT',
      'UPDATE_STATUS',
      'ASSIGN_REPORT',
      'ADD_COMMENT'
    ],
  },
  oldValue: String,
  newValue: String,
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('ReportHistory', reportHistorySchema);
