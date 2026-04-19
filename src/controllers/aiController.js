const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { moderateComplaint: aiServiceModerate } = require('../services/aiService');
const { getDepartmentsForPrompt, findDepartmentByCode } = require('../utils/departmentHelper');

// ========== Helper: Jaccard similarity ==========
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// ========== Helper: Find duplicate complaint ==========
async function findDuplicateComplaint(complaint, similarityThreshold = 0.7) {
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

// ========== Notification helpers ==========
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

// monderate endpoint
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

    const aiResult = await aiServiceModerate(complaint.title, complaint.description, orgName, departmentsList);
    const duplicateComplaint = await findDuplicateComplaint(complaint, 0.7);
    const duplicateOfId = duplicateComplaint ? duplicateComplaint._id : null;
    const matchedDept = aiResult.department ? await findDepartmentByCode(complaint.organization._id, aiResult.department) : null;

    // Update complaint fields (category removed)
    complaint.isSpam = aiResult.isSpam;
    complaint.priority = aiResult.priority;
    complaint.aiConfidence = aiResult.aiConfidence;
    complaint.duplicateOf = duplicateOfId;
    // complaint.category = aiResult.category;  
    if (matchedDept) complaint.department = matchedDept._id;

    // Auto-status logic
    if (aiResult.isSpam) {
      complaint.status = 'Rejected';
    } else if (aiResult.aiConfidence < 0.7) {
      complaint.status = 'Manual Review';
    } else {
      complaint.status = 'Submitted';
    }

    let historyComment = `AI assigned priority=${aiResult.priority}, department=${aiResult.department}, confidence=${aiResult.aiConfidence}`;
    if (duplicateOfId) historyComment += `. Marked as duplicate of ${duplicateOfId}.`;
    complaint.history.push({ action: 'AI Moderated', by: null, comment: historyComment });

    await complaint.save();

    // Notify OrgAdmin if needed
    let notifyOrgReason = null;
    if (aiResult.isSpam) {
      notifyOrgReason = 'Marked as spam by AI.';
    } else if (aiResult.aiConfidence < 0.7) {
      notifyOrgReason = `AI confidence low (${aiResult.aiConfidence}). Manual review needed.`;
    } else if (!matchedDept && !aiResult.isSpam) {
      notifyOrgReason = 'AI could not assign a department.';
    }
    if (notifyOrgReason) {
      await notifyOrgAdmins(complaint.organization._id, complaint._id, complaint.title, notifyOrgReason);
    }

    // Notify DeptAdmins only if high confidence, non-spam, non-duplicate, and department assigned
    if (!aiResult.isSpam && !duplicateOfId && matchedDept && aiResult.aiConfidence >= 0.7) {
      await notifyDepartmentAdmins(matchedDept._id, complaint._id, complaint.title);
    }

    res.json({
      success: true,
      aiResult: { ...aiResult, duplicateOf: duplicateOfId },
      finalStatus: complaint.status,
      assignedDepartmentId: matchedDept?._id,
      duplicateFound: !!duplicateOfId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
