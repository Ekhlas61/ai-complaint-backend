const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  complaint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  commentText: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);