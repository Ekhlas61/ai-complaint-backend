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

// ========== DEPTHEAD ==========
exports.getDeptHeadStats = async (req, res) => {
  try {
    const departmentId = req.user.department;
    if (!departmentId) {
      return res.status(400).json({ message: 'DeptHead not associated with any department' });
    }
    const stats = await getStats({ department: departmentId });
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ========== ORGHEAD ==========
exports.getOrgHeadStats = async (req, res) => {
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

    // Count total DeptHeads in this organization
    const totalHeads = await User.countDocuments({
      role: 'DeptHead',
      organization: orgId,
      isActive: true,
    });

    // Get overall stats for this organization (across all its departments)
   
    let overall = { total: 0, resolved: 0, pending: 0, resolvedPercentage: 0 };
    const deptStats = [];
    for (const dept of departments) {
      const stats = await getStats({ department: dept._id });
      deptStats.push({ departmentId: dept._id, name: dept.name, ...stats });
      overall.total += stats.total;
      overall.resolved += stats.resolved;
      overall.pending += stats.pending;
    }
    overall.resolvedPercentage = overall.total === 0 ? 0 : Math.round((overall.resolved / overall.total) * 100);

    const summary = {
      totalDepartments: departments.length,
      totalHeads,
      totalResolved: overall.resolved,
      totalPending: overall.pending,
    };

    res.json({ summary, departments: deptStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== SYSADMIN ==========
exports.getSysAdminStats = async (req, res) => {
  try {
    // Get all active organizations
    const organizations = await Organization.find({ isActive: true }).select('_id name');

    // Overall stats across all complaints
    const overallStats = await getStats({});

    // Per organization stats
    const orgStats = await Promise.all(organizations.map(async (org) => {
      const depts = await Department.find({
        organization: org._id,
        isActive: true,
      }).select('_id');
      const deptIds = depts.map(d => d._id);
      const stats = await getStats({ department: { $in: deptIds } });
      return { organizationId: org._id, name: org.name, ...stats };
    }));

    res.json({ overall: overallStats, organizations: orgStats });
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