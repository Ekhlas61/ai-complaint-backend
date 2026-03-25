const Complaint = require('../models/Complaint');
const Department = require('../models/Department');
const User = require('../models/User');

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
    const organization = req.user.organization; 

    // Departments in this organization 
    const departments = await Department.find({
      name: { $regex: `^${organization} - `, $options: 'i' },
      isActive: true
    }).select('_id name');

    const deptStats = await Promise.all(departments.map(async (dept) => {
      const stats = await getStats({ department: dept._id });
      return { departmentId: dept._id, name: dept.name, ...stats };
    }));

    // DeptAdmins of this organization
    const deptAdmins = await User.find({
      role: 'DeptAdmin',
      organization: organization,
      isActive: true
    }).select('_id fullName');

    const adminStats = await Promise.all(deptAdmins.map(async (admin) => {
      const stats = await getStats({ assignedTo: admin._id });
      return { deptAdminId: admin._id, fullName: admin.fullName, ...stats };
    }));

    res.json({ departments: deptStats, deptAdmins: adminStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== SYSADMIN ==========
exports.getSysAdminStats = async (req, res) => {
  try {
    const organizations = ['EEP', 'AAWSA'];

    // Per organization
    const orgStats = await Promise.all(organizations.map(async (org) => {
      // All departments belonging to this organization
      const depts = await Department.find({
        name: { $regex: `^${org} - `, $options: 'i' },
        isActive: true
      }).select('_id');
      const deptIds = depts.map(d => d._id);
      const stats = await getStats({ department: { $in: deptIds } });
      return { organization: org, ...stats };
    }));

    // Per OrgAdmin
    const orgAdmins = await User.find({ role: 'OrgAdmin', isActive: true })
      .select('_id fullName organization');
    const adminStats = await Promise.all(orgAdmins.map(async (admin) => {
      const depts = await Department.find({
        name: { $regex: `^${admin.organization} - `, $options: 'i' },
        isActive: true
      }).select('_id');
      const deptIds = depts.map(d => d._id);
      const stats = await getStats({ department: { $in: deptIds } });
      return {
        orgAdminId: admin._id,
        fullName: admin.fullName,
        organization: admin.organization,
        ...stats
      };
    }));

    res.json({ organizations: orgStats, orgAdmins: adminStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};