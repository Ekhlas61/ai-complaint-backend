const Complaint = require('../models/Complaint');
const AuditLog = require('../models/AuditLog');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const User = require('../models/User');               
const { moderateComplaint } = require('../controllers/aiController');
const Organization = require('../models/Organization');

async function notifyCommentParticipants(complaint, commentAuthor, commentText) {
  const participants = [];

  if (commentAuthor.role === 'DeptHead') {
    const orgHeads = await User.find({ 
      organization: complaint.organization, 
      role: 'OrgHead' 
    }).select('_id');
    participants.push(...orgHeads.map(head => head._id));
  } 
  else if (commentAuthor.role === 'OrgHead') {
    if (complaint.assignedTo) {
      participants.push(complaint.assignedTo);
    }
  }

  const uniqueParticipants = [...new Set(participants.filter(
    id => id.toString() !== commentAuthor._id.toString()
  ))];

  if (uniqueParticipants.length === 0) return;

  const notifications = uniqueParticipants.map(userId => ({
    user: userId,
    type: 'COMMENT_ADDED',
    title: 'New comment on complaint',
    message: `${commentAuthor.fullName} commented: "${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}"`,
    data: { complaintId: complaint._id, commentAuthor: commentAuthor._id },
    read: false,
  }));

  await Notification.insertMany(notifications);
}

// Submit new complaint for Citizen role
exports.createComplaint = async (req, res) => {
  try {
    const { title, description, attachments, latitude, longitude, organizationId } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId is required' });
    }

    // Verify organization exists and is active
    const organization = await Organization.findById(organizationId);
    if (!organization || !organization.isActive) {
      return res.status(400).json({ message: 'Invalid or inactive organization' });
    }

    let location = null;
    if (latitude != null && longitude != null) {
      location = {
        type: 'Point',
        coordinates: [longitude, latitude],
        locationName: null,
      };
    }

    // Format attachments if provided
    let formattedAttachments = [];
    if (attachments && Array.isArray(attachments)) {
      formattedAttachments = attachments.map(item => ({
        path: item.url,
      }));
    }

    const complaint = await Complaint.create({
      title,
      description,
      attachments: formattedAttachments,
      location,
      submittedBy: req.user._id,
      organization: organizationId,
      status: 'Submitted',
      history: [{ action: 'Submitted', by: req.user._id, comment: 'Complaint created' }],
    });

    moderateComplaintAsync(complaint._id).catch(err =>
      console.error(`AI moderation failed for complaint ${complaint._id}:`, err)
    );

    res.status(201).json({
      success: true,
      complaint: {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        status: complaint.status,
        attachments: complaint.attachments,   
        createdAt: complaint.createdAt,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Async wrapper for AI moderation called after complaint is submitted
async function moderateComplaintAsync(complaintId) {
  const req = { body: { complaintId } };
  const res = {
    status: () => ({ json: () => {} }),
    json: () => {},
  };
  await moderateComplaint(req, res);   
}

// Get my complaints by Citizen role
// Get my complaints by Citizen role
exports.getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ submittedBy: req.user._id })
      .populate('organization', 'name')
      .sort({ createdAt: -1 });
    
    // Format the response for citizens
    const formattedComplaints = complaints.map(complaint => {
      // Check if location has valid coordinates (not [0,0])
      const hasValidLocation = complaint.location && 
                               complaint.location.coordinates && 
                               complaint.location.coordinates[0] !== 0 && 
                               complaint.location.coordinates[1] !== 0;
      
      return {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        status: complaint.status,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        resolvedAt: complaint.resolvedAt || null,
        organization: complaint.organization?.name || 'Unknown',
        location: hasValidLocation ? {
          latitude: complaint.location.coordinates[1],
          longitude: complaint.location.coordinates[0],
          locationName: complaint.location.locationName || null
        } : null,
        attachments: complaint.attachments && complaint.attachments.length > 0 
          ? complaint.attachments.map(att => ({
              url: att.path,
              filename: att.filename || 'image',
              uploadedAt: att.uploadedAt
            }))
          : []
      };
    });
    
    res.json(formattedComplaints);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Add comment endpoint - Only DeptHead and OrgHead can comment
exports.addComment = async (req, res) => {
  try {
    const { commentText } = req.body;
    if (!commentText) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const isDeptHead = req.user.role === 'DeptHead' && 
                        complaint.department && 
                        complaint.department.toString() === req.user.department?.toString();
    const isOrgHead = req.user.role === 'OrgHead';

    if (!isDeptHead && !isOrgHead) {
      return res.status(403).json({ message: 'Not authorized to comment on this complaint. Only DeptHead and OrgHead can communicate.' });
    }

    const comment = await Comment.create({
      complaint: complaint._id,
      author: req.user._id,
      commentText,
    });

    complaint.history.push({
      action: 'Comment added',
      by: req.user._id,
      comment: commentText,
    });
    await complaint.save();

    await notifyCommentParticipants(complaint, req.user, commentText);

    const populatedComment = await Comment.findById(comment._id).populate('author', 'fullName email');
    res.status(201).json(populatedComment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Get comments with permission check - Only DeptHead and OrgHead can view comments
exports.getComments = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).select('submittedBy assignedTo department');
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const isDeptHead = req.user.role === 'DeptHead' && 
                        complaint.department && 
                        complaint.department.toString() === req.user.department?.toString();
    const isOrgHead = req.user.role === 'OrgHead';

    if (!isDeptHead && !isOrgHead) {
      return res.status(403).json({ message: 'Not authorized to view comments on this complaint' });
    }

    const comments = await Comment.find({ complaint: req.params.id })
      .populate('author', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Get assigned complaints for DeptHead role
exports.getAssignedComplaints = async (req, res) => {
  try {
    const departmentId = req.user.department;
    if (!departmentId) {
      return res.status(400).json({ message: 'DeptHead not associated with any department' });
    }

    const match = { department: departmentId };

    const complaints = await Complaint.find(match)
      .populate('submittedBy', 'fullName email')
      .populate('department', 'name code')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(complaints);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update complaint status for DeptHead role
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['In Progress', 'Resolved'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'DeptHead can only change status to "In Progress" or "Resolved"' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const deptHeadDepartmentId = req.user.department;
    if (!deptHeadDepartmentId || complaint.department?.toString() !== deptHeadDepartmentId.toString()) {
      return res.status(403).json({ message: 'You are not authorized to update this complaint' });
    }

    const oldStatus = complaint.status;
    if (status === oldStatus) {
      return res.status(400).json({ message: 'New status must be different from current status' });
    }

    complaint.status = status;
    if (status === 'Resolved') {
      complaint.resolvedAt = new Date();
    }
    complaint.history.push({
      action: `Status changed to ${status}`,
      by: req.user._id,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'UPDATE_STATUS',
      description: `Complaint ${id} status changed from ${oldStatus} to ${status}`,
      targetType: 'Complaint',
      targetId: complaint._id,
      ip: req.ip,
      orgId: complaint.organization,
      oldValue: { status: oldStatus },
      newValue: { status: status },
      status: 'SUCCESS',
    });

    await complaint.save();

    let message = '';
    switch (status) {
      case 'Resolved':
        message = `Your complaint "${complaint.title}" has been resolved. Thank you for your patience.`;
        break;
      case 'In Progress':
        message = `Your complaint "${complaint.title}" is now in progress. We are working on it.`;
        break;
      default:
        message = `Your complaint "${complaint.title}" status changed from ${oldStatus} to ${status}.`;
    }
    await Notification.create({
      user: complaint.submittedBy,
      type: 'STATUS_UPDATED',
      title: 'Complaint status updated',
      message: message,
      data: { complaintId: complaint._id, oldStatus, newStatus: status },
      read: false,
    });

    res.json({ message: 'Complaint status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all complaints in the organization for OrgHead role (not OrgAdmin)
exports.getComplaintsByOrganization = async (req, res) => {
  try {
    if (req.user.role !== 'OrgHead') {
      return res.status(403).json({ message: 'Access denied. Only OrgHead allowed.' });
    }

    const organizationId = req.user.organization;
    if (!organizationId) {
      return res.status(400).json({ message: 'User not associated with any organization' });
    }

    const complaints = await Complaint.find({ organization: organizationId })
      .populate('submittedBy', 'fullName email')
      .populate('department', 'name code')
      .sort({ createdAt: -1 });

    res.json(complaints);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Admin override endpoint (OrgHead only)
exports.adminOverride = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, priority, status, isSpam, duplicateOf, comment } = req.body;

    // Check if user is OrgHead
    if (req.user.role !== 'OrgHead') {
      return res.status(403).json({ message: 'Access denied. Only OrgHead can perform overrides.' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    // Verify complaint belongs to OrgHead's organization
    if (complaint.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only override complaints from your organization' });
    }

    // Store old values for notification decisions
    const oldDepartment = complaint.department?.toString();
    const oldStatus = complaint.status;

    const changes = [];
    const overrides = {};

    if (department && department !== complaint.department?.toString()) {
      changes.push(`department from ${complaint.department} to ${department}`);
      complaint.department = department;
      overrides.department = true;
    }
    if (priority && priority !== complaint.priority) {
      changes.push(`priority from ${complaint.priority} to ${priority}`);
      complaint.priority = priority;
      overrides.priority = true;
    }
    if (status && status !== complaint.status) {
      changes.push(`status from ${complaint.status} to ${status}`);
      complaint.status = status;
      if (status === 'Resolved') complaint.resolvedAt = new Date();
      overrides.status = true;
    }
    if (isSpam !== undefined && isSpam !== complaint.isSpam) {
      changes.push(`isSpam from ${complaint.isSpam} to ${isSpam}`);
      complaint.isSpam = isSpam;
      overrides.isSpam = true;
    }
    if (duplicateOf && duplicateOf !== complaint.duplicateOf?.toString()) {
      changes.push(`duplicateOf from ${complaint.duplicateOf} to ${duplicateOf}`);
      complaint.duplicateOf = duplicateOf;
      overrides.duplicateOf = true;
    }

    if (changes.length > 0) {
      const existingOverrides = complaint.overriddenFields || new Map();
      for (const [key, val] of Object.entries(overrides)) {
        existingOverrides.set(key, val);
      }
      complaint.overriddenFields = existingOverrides;

      complaint.history.push({
        action: 'Admin Override',
        by: req.user._id,
        comment: comment || `Changed: ${changes.join(', ')}`,
      });
      await complaint.save();

      // Notify the new DeptHead that complaint has been assigned
      if (department && department !== oldDepartment) {
        const newDeptHead = await User.findOne({ department: department, role: 'DeptHead', isActive: true });
        if (newDeptHead) {
          await Notification.create({
            user: newDeptHead._id,
            type: 'COMPLAINT_ASSIGNED',
            title: 'Complaint assigned to your department',
            message: `Complaint "${complaint.title}" has been assigned to your department by OrgHead.`,
            data: { complaintId: complaint._id, departmentId: department },
            read: false,
          });
        }
      }
    }

    res.json({ success: true, complaint });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};