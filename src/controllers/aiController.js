const { moderateComplaint: aiServiceModerate, getProviderStats } = require('../services/aiService');
const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const User = require('../models/User');

// ========== MODERATE ENDPOINT (For testing) ==========
exports.moderateComplaint = async (req, res) => {
  try {
    const { complaintId } = req.body;
    const complaint = await Complaint.findById(complaintId)
      .populate('organization');
    
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Run AI analysis
    const aiResult = await aiServiceModerate(
      complaint.title,
      complaint.description,
      complaint.organization.name,
      complaint.organization._id,
      complaint._id 
    );

    // Update complaint with AI results
    complaint.isSpam = aiResult.isSpam;
    complaint.priority = aiResult.priority;
    complaint.aiConfidence = aiResult.aiConfidence;
    complaint.duplicateOf = aiResult.duplicateOf;

    // Assign department if AI is confident and not spam
    if (!aiResult.isSpam && aiResult.department && aiResult.aiConfidence >= 0.7) {
      const Department = require('../models/Department');
      const department = await Department.findOne({ 
        code: aiResult.department, 
        organization: complaint.organization._id 
      });
      if (department) {
        complaint.department = department._id;
        complaint.status = 'Submitted';
      } else {
        complaint.status = 'Manual Review';
      }
    } 
    // Handle spam
    else if (aiResult.isSpam && aiResult.aiConfidence >= 0.7) {
      complaint.status = 'Rejected';
    }
    // Handle duplicate
    else if (aiResult.duplicateOf && aiResult.aiConfidence >= 0.7) {
      complaint.status = 'Manual Review';
    }
    // Low confidence or unclear
    else {
      complaint.status = 'Manual Review';
    }

    // Add to history
    complaint.history.push({
      action: 'AI Moderated',
      by: null,
      comment: aiResult.reasoning || `AI: spam=${aiResult.isSpam}, priority=${aiResult.priority}, department=${aiResult.department || 'none'}, confidence=${aiResult.aiConfidence}`,
    });

    await complaint.save();

    // Notify OrgHead if manual review is needed
    if (complaint.status === 'Manual Review') {
      const orgHeads = await User.find({ 
        organization: complaint.organization._id, 
        role: 'OrgHead',
        isActive: true 
      }).select('_id');
      
      if (orgHeads.length > 0) {
        const notifications = orgHeads.map(head => ({
          user: head._id,
          type: 'REVIEW_NEEDED',
          title: 'Complaint Requires Manual Review',
          message: `Complaint "${complaint.title}" requires your review. Reason: ${aiResult.reasoning || 'AI low confidence'}`,
          data: { complaintId: complaint._id, aiResult },
          read: false,
        }));
        await Notification.insertMany(notifications);
      }
    } 
    // Notify DeptHead if assigned
    else if (complaint.department && complaint.status === 'Submitted') {
      const deptHeads = await User.find({ 
        department: complaint.department, 
        role: 'DeptHead',
        isActive: true 
      }).select('_id');
      
      if (deptHeads.length > 0) {
        const notifications = deptHeads.map(head => ({
          user: head._id,
          type: 'COMPLAINT_ASSIGNED',
          title: 'New Complaint Assigned',
          message: `Complaint "${complaint.title}" has been assigned to your department. Priority: ${complaint.priority}`,
          data: { complaintId: complaint._id },
          read: false,
        }));
        await Notification.insertMany(notifications);
      }
    }

    res.json({
      success: true,
      complaintId: complaint._id,
      status: complaint.status,
      aiResult: {
        isSpam: aiResult.isSpam,
        priority: aiResult.priority,
        department: aiResult.department,
        duplicateOf: aiResult.duplicateOf,
        aiConfidence: aiResult.aiConfidence,
        requiresManualReview: aiResult.requiresManualReview,
        reasoning: aiResult.reasoning,
      },
    });

  } catch (err) {
    console.error('Moderation error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ========== AI PROVIDER STATS (SysAdmin only) ==========
exports.getAIProviderStats = async (req, res) => {
  try {
    // Only SysAdmin can view AI provider stats
    if (req.user.role !== 'SysAdmin') {
      return res.status(403).json({ message: 'Access denied. SysAdmin privileges required.' });
    }
    
    const stats = getProviderStats();
    
    res.json({
      success: true,
      providers: stats,
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Provider stats error:', err);
    res.status(500).json({ message: err.message });
  }
};