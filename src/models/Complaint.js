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
     category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    images: [
      {
        path: { type: String, required: true },           
        uploadedAt: { type: Date, default: Date.now },
        
      },
    ],

   location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
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
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', 
      default: null,
    },
    status: {
      type: String,
      enum: ['Submitted', 'In Progress', 'Resolved', 'Rejected'],
      default: 'Submitted',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    // History of status changes / comments
    history: [
      {
        action: String, // e.g. "Status changed to In Progress", "Comment added"
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
        filename: String,
        path: String, // or cloud URL
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

// Indexes for faster queries
complaintSchema.index({ submittedBy: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ department: 1, status: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('Complaint', complaintSchema);