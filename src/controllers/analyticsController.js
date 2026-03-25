const Complaint = require('../models/Complaint');
const Department = require('../models/Department');
const User = require('../models/User');
const Organization = require('../models/Organization');

// Helper: get counts and percentage for a query filter
const getStats = async (filter) => {
  const total = await Complaint.countDocuments(filter);
  const resolved = await Complaint.countDocuments({ ...filter, status: 'Resolved' });
  const pending = total - resolved;
  const resolvedPercentage = total === 0 ? 0 : Math.round((resolved / total) * 100);
  return { total, resolved, pending, resolvedPercentage };
};

// ========== DEPTADMIN ==========
exports.getDeptAdminStats = async (req, res) => {
  try {
    const stats = await getStats({ assignedTo: req.user._id });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== ORGADMIN ==========
exports.getOrgAdminStats = async (req, res) => {
  try {
    const orgId = req.user.organization;
    if (!orgId) {
      return res.status(403).json({ message: 'Your account is not associated with an organization' });
    }

    // Find all departments belonging to this organization
    const departments = await Department.find({
      organization: orgId,
      isActive: true,
    }).select('_id name');

    const deptStats = await Promise.all(departments.map(async (dept) => {
      const stats = await getStats({ department: dept._id });
      return { departmentId: dept._id, name: dept.name, ...stats };
    }));

    res.json({ departments: deptStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== SYSADMIN ==========
exports.getSysAdminStats = async (req, res) => {
  try {
    // Get all active organizations
    const organizations = await Organization.find({ isActive: true }).select('_id name');

    // Per organization stats
    const orgStats = await Promise.all(organizations.map(async (org) => {
      // All departments belonging to this organization
      const depts = await Department.find({
        organization: org._id,
        isActive: true,
      }).select('_id');
      const deptIds = depts.map(d => d._id);
      const stats = await getStats({ department: { $in: deptIds } });
      return { organizationId: org._id, name: org.name, ...stats };
    }));

    res.json({ organizations: orgStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== CITIZEN ==========
exports.getCitizenStats = async (req, res) => {
  try {
    const stats = await getStats({ submittedBy: req.user._id });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};