const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: String,
  imagePath: String,

  location: {
    latitude: Number,
    longitude: Number,
    locationName: String,
  },

  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  department: String,

  severity: {
    type: String,
    enum: ['Low', 'Moderate', 'Critical'],
  },

  status: {
    type: String,
    enum: ['Submitted', 'In Progress', 'Resolved'],
    default: 'Submitted',
  },

  deviceInfo: String,

  syncStatus: {
    type: String,
    enum: ['Pending', 'Submitted', 'Failed'],
    default: 'Pending',
  },

}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
