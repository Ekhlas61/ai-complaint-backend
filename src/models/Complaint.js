const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],            
        required: false,
      },
      locationName: {
        type: String,
        trim: true,
      },
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,             
    },
    isSpam: {
      type: Boolean,
      default: false,
    },
    aiConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['Submitted', 'In Progress', 'Resolved', 'Rejected', 'Manual Review'],
      default: 'Submitted',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    // Track which AI fields have been manually overridden
    overriddenFields: {
      type: Map,
      of: Boolean,
      default: {},
    },
    history: [
      {
        action: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        comment: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    syncStatus: {
      type: String,
      enum: ['Pending', 'Synced', 'Failed'],
      default: 'Pending',
    },
    attachments: [                   
      {
        filename:{type: String, default:'image' },
        path: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    deviceInfo: {
      type: String,
      trim: true,
    },
    resolvedAt: Date,
  },
  { timestamps: true }
);

// Indexes
complaintSchema.index({ submittedBy: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ department: 1, status: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ 'location.coordinates': '2dsphere' });
complaintSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Complaint', complaintSchema);