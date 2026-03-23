const Complaint = require('../models/Complaint');
const AuditLog = require('../models/AuditLog');
const Comment = require('../models/Comment');

// Citizen: Submit new complaint
exports.createComplaint = async (req, res) => {
  try {
    const { title, description, category, location, priority, department } = req.body;
    if (!department) {
      return res.status(400).json({ message: 'Department is required' });
    }
    const complaint = await Complaint.create({
      title,
      description,
      category,
      location,
      priority,
      department,   
      submittedBy: req.user._id,
      status: 'Submitted',
      history: [{ action: 'Submitted', by: req.user._id, comment: 'Complaint created' }],
    });
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Citizen: Get my complaints
exports.getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ submittedBy: req.user._id })
      .populate('department', 'name')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single complaint (role‑based access)
exports.getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('submittedBy', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .populate('department', 'name code');
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    // Access control
    const isOwner = complaint.submittedBy._id.toString() === req.user._id.toString();
    const isAssigned = complaint.assignedTo?._id.toString() === req.user._id.toString();
    const isOrgOrSys = ['OrgAdmin', 'SysAdmin'].includes(req.user.role);
    if (!isOwner && !isAssigned && !isOrgOrSys) {
      return res.status(403).json({ message: 'Not authorized to view this complaint' });
    }
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// OrgAdmin/SysAdmin: Assign complaint to a department/DeptAdmin
exports.assignComplaint = async (req, res) => {
  try {
    const { assignedTo, department, note } = req.body; // assignedTo is userId of DeptAdmin
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    if (assignedTo) {
      complaint.assignedTo = assignedTo;
    }
    if (department) {
      complaint.department = department;
    }
    complaint.history.push({
      action: 'Assigned',
      by: req.user._id,
      comment: note || `Assigned to ${assignedTo || department}`,
    });
    await complaint.save();

    // Optionally create an Assignment record if you use Assignment model
    // await Assignment.create({ complaint: complaint._id, assignedTo, assignedBy: req.user._id, note });

    res.json({ message: 'Complaint assigned', complaint });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Comment endpoints (add, get)
// Add comment with permission check and populated author
exports.addComment = async (req, res) => {
  try {
    const { commentText } = req.body;
    if (!commentText) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    // Check complaint existence and access rights
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Permission check (same as viewing the complaint)
    const isOwner = complaint.submittedBy.toString() === req.user._id.toString();
    const isAssigned = complaint.assignedTo && complaint.assignedTo.toString() === req.user._id.toString();
    const isOrgOrSys = ['OrgAdmin', 'SysAdmin'].includes(req.user.role);
    if (!isOwner && !isAssigned && !isOrgOrSys) {
      return res.status(403).json({ message: 'Not authorized to comment on this complaint' });
    }

    // Create comment document
    const comment = await Comment.create({
      complaint: complaint._id,
      author: req.user._id,
      commentText,
    });

    // Optionally add to complaint.history for unified timeline
    complaint.history.push({
      action: 'Comment added',
      by: req.user._id,
      comment: commentText,
    });
    await complaint.save();

    // Return comment with author details
    const populatedComment = await Comment.findById(comment._id).populate('author', 'fullName email');
    res.status(201).json(populatedComment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get comments with permission check
exports.getComments = async (req, res) => {
  try {
    // Check if user has access to view this complaint
    const complaint = await Complaint.findById(req.params.id).select('submittedBy assignedTo');
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const isOwner = complaint.submittedBy.toString() === req.user._id.toString();
    const isAssigned = complaint.assignedTo && complaint.assignedTo.toString() === req.user._id.toString();
    const isOrgOrSys = ['OrgAdmin', 'SysAdmin'].includes(req.user.role);
    if (!isOwner && !isAssigned && !isOrgOrSys) {
      return res.status(403).json({ message: 'Not authorized to view comments on this complaint' });
    }

    const comments = await Comment.find({ complaint: req.params.id })
      .populate('author', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────
// DeptAdmin: Get assigned complaints + dashboard stats
// ────────────────────────────────────────────────
exports.getAssignedComplaints = async (req, res) => {
  try {
    const assignedTo = req.user._id;

    const match = { assignedTo };

   
    if (req.query.status) {
      match.status = req.query.status;
    }

    // Counts
    const total = await Complaint.countDocuments(match);
    const resolved = await Complaint.countDocuments({ ...match, status: 'Resolved' });
    const pending = total - resolved;

    // List
    const complaints = await Complaint.find(match)
      .populate('submittedBy', 'fullName email')
      .populate('department', 'name code')
      .sort({ createdAt: -1 })
      .limit(50); // add pagination later

    res.json({
      summary: {
        total,
        resolved,
        pending,
        resolvedPercentage: total > 0 ? Math.round((resolved / total) * 100) : 0,
      },
      data: complaints,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ────────────────────────────────────────────────
// DeptAdmin: Update complaint status + optional comment
// ────────────────────────────────────────────────
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'This complaint is not assigned to you' });
    }

    const oldStatus = complaint.status;

    if (status && status !== oldStatus) {
      complaint.status = status;
      if (status === 'Resolved') {
        complaint.resolvedAt = new Date();
      }

      // Log to history
      complaint.history.push({
        action: `Status changed to ${status}`,
        by: req.user._id,
        comment: comment || undefined,
      });

      // Audit log
      await AuditLog.create({
        user: req.user._id,
        action: 'UPDATE_STATUS',
        description: `Complaint ${id} status changed from ${oldStatus} to ${status}`,
        targetType: 'Complaint',
        targetId: complaint._id,
        ip: req.ip,
      });
    } else if (comment) {
      // Only comment
      complaint.history.push({
        action: 'Comment added',
        by: req.user._id,
        comment,
      });

      await AuditLog.create({
        user: req.user._id,
        action: 'ADD_COMMENT',
        description: `Comment added to complaint ${id}`,
        targetType: 'Complaint',
        targetId: complaint._id,
        ip: req.ip,
      });
    }

    await complaint.save();

    res.json({
      message: 'Complaint updated successfully',
      complaint,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};