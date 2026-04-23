const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { moderateComplaint: aiServiceModerate } = require('../services/aiService');
const { getDepartmentsForPrompt, findDepartmentByCode } = require('../utils/departmentHelper');

// Jaccard similarity 
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2)); 
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// Find duplicate complaint 
async function findDuplicateComplaint(complaint, similarityThreshold = 0.55) { 
  const candidates = await Complaint.find({
    organization: complaint.organization,
    _id: { $ne: complaint._id },
    status: { $ne: 'Rejected' }, 
  }).limit(20); 

  let bestMatch = null;
  let highestSimilarity = 0;

  for (const candidate of candidates) {
    const currentText = `${complaint.title} ${complaint.description}`;
    const candidateText = `${candidate.title} ${candidate.description}`;
    const similarity = calculateSimilarity(currentText, candidateText);
    if (similarity > highestSimilarity && similarity >= similarityThreshold) {
      highestSimilarity = similarity;
      bestMatch = candidate;
    }
  }
  return bestMatch;
}

// Notification helpers 
async function notifyDepartmentAdmins(departmentId, complaintId, complaintTitle) {
  const admins = await User.find({ department: departmentId, role: 'DeptAdmin' }).select('_id');
  if (!admins.length) return;
  const notifications = admins.map(admin => ({
    user: admin._id,
    type: 'COMPLAINT_ASSIGNED',
    title: 'New complaint assigned',
    message: `Complaint "${complaintTitle}" has been assigned to your department.`,
    data: { complaintId, departmentId, assignedBy: 'AI' },
    read: false,
  }));
  await Notification.insertMany(notifications);
}

async function notifyOrgAdmins(organizationId, complaintId, complaintTitle, reason) {
  const orgAdmins = await User.find({ organization: organizationId, role: 'OrgAdmin' }).select('_id');
  if (!orgAdmins.length) return;
  const notifications = orgAdmins.map(admin => ({
    user: admin._id,
    type: 'REVIEW_NEEDED',
    title: 'Complaint requires review',
    message: `Complaint "${complaintTitle}" requires attention: ${reason}`,
    data: { complaintId, organizationId, reason },
    read: false,
  }));
  await Notification.insertMany(notifications);
}

// moderation endpoint 
exports.moderateComplaint = async (req, res) => {
  try {
    const { complaintId } = req.body;
    const complaint = await Complaint.findById(complaintId).populate('organization');
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const orgName = complaint.organization.name;
    const departmentsList = await getDepartmentsForPrompt(complaint.organization._id);
    if (!departmentsList) {
      return res.status(400).json({ message: 'No departments found for this organization' });
    }

    // AI classification
    const aiResult = await aiServiceModerate(complaint.title, complaint.description, orgName, departmentsList);
    
    // Duplicate detection 
    const duplicateComplaint = await findDuplicateComplaint(complaint, 0.55);
    const duplicateOfId = duplicateComplaint ? duplicateComplaint._id : null;
    
    // Department mapping 
    let matchedDept = null;
    if (aiResult.department) {
      matchedDept = await findDepartmentByCode(complaint.organization._id, aiResult.department);
      if (!matchedDept) {
        console.warn(`Department code ${aiResult.department} not found in organization ${complaint.organization._id}`);
      }
    }

 
    complaint.isSpam = aiResult.isSpam;
    complaint.priority = aiResult.priority;
    complaint.aiConfidence = aiResult.aiConfidence;
    complaint.duplicateOf = duplicateOfId;
    if (matchedDept) complaint.department = matchedDept._id;
    else complaint.department = null; 

    // Auto-status updating logic 
    if (aiResult.isSpam && aiResult.aiConfidence >= 0.7) {
      complaint.status = 'Rejected';
    } else if (aiResult.isSpam && aiResult.aiConfidence < 0.7) {
      complaint.status = 'Manual Review'; 
    } else if (aiResult.aiConfidence < 0.7) {
      complaint.status = 'Manual Review';
    } else if (!matchedDept && !aiResult.isSpam && aiResult.aiConfidence >= 0.7) {
      complaint.status = 'Manual Review';
    } else {
      complaint.status = 'Submitted';
    }

    // History log with more detail
    let historyComment = `AI: spam=${aiResult.isSpam}, priority=${aiResult.priority}, department=${aiResult.department || 'none'}, confidence=${aiResult.aiConfidence}`;
    if (duplicateOfId) historyComment += ` | Duplicate of ${duplicateOfId} (similarity ${duplicateComplaint ? 'matched' : '?'})`;
    if (!matchedDept && aiResult.department) historyComment += ` | Department code "${aiResult.department}" not found in system`;
    complaint.history.push({ action: 'AI Moderated', by: null, comment: historyComment });

    await complaint.save();

    // Notify OrgAdmins for specific conditions
    let notifyOrgReason = null;
    if (aiResult.isSpam && aiResult.aiConfidence >= 0.7) {
      notifyOrgReason = 'Marked as spam by AI (high confidence).';
    } else if (aiResult.isSpam && aiResult.aiConfidence < 0.7) {
      notifyOrgReason = `Possible spam with low confidence (${aiResult.aiConfidence}). Manual review needed.`;
    } else if (aiResult.aiConfidence < 0.7) {
      notifyOrgReason = `AI confidence low (${aiResult.aiConfidence}). Manual review needed.`;
    } else if (!matchedDept && !aiResult.isSpam && aiResult.aiConfidence >= 0.7) {
      notifyOrgReason = 'AI high confidence but no department assigned. Manual routing needed.';
    }
    if (notifyOrgReason) {
      await notifyOrgAdmins(complaint.organization._id, complaint._id, complaint.title, notifyOrgReason);
    }

    
    const shouldNotifyDept = !duplicateOfId && matchedDept && 
                              (complaint.status === 'Submitted') && 
                              !aiResult.isSpam;
    if (shouldNotifyDept) {
      await notifyDepartmentAdmins(matchedDept._id, complaint._id, complaint.title);
    }

    res.json({
      success: true,
      aiResult: {
        isSpam: aiResult.isSpam,
        priority: aiResult.priority,
        department: aiResult.department,
        duplicateOf: duplicateOfId,
        aiConfidence: aiResult.aiConfidence,
      },
      finalStatus: complaint.status,
      assignedDepartmentId: matchedDept?._id,
      duplicateFound: !!duplicateOfId,
      warnings: !matchedDept && aiResult.department ? 'Department code not found' : null,
    });
  } catch (err) {
    console.error('Moderation error:', err);
    res.status(500).json({ message: err.message });
  }
};