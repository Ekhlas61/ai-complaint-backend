const mongoose = require('mongoose');

const aiAnalysisSchema = new mongoose.Schema({
  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
  },
  predictedSeverity: String,
  predictedDepartment: String,
  spamScore: Number,
  offensiveScore: Number,
  confidence: Number,
}, { timestamps: true });

module.exports = mongoose.model('AIAnalysis', aiAnalysisSchema);
