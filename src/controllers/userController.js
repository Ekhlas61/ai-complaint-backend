// controllers/userController.js
const User = require('../models/User');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');

// SysAdmin: Create OrgAdmin
exports.createOrgAdmin = async (req, res) => {
  try {
    const { fullName, email, password, organization } = req.body;
    if (!organization || !['EEP', 'AAWSA'].includes(organization)) {
      return res.status(400).json({ message: 'Valid organization required (EEP or AAWSA)' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'OrgAdmin',
      loginMethod: 'manual',
      organization,
      isActive: true,
    });
    res.status(201).json({ _id: user._id, fullName, email, role: user.role, organization });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// OrgAdmin: Create DeptAdmin (must belong to same organization)
exports.createDeptAdmin = async (req, res) => {
  try {
    const { fullName, email, password, departmentId } = req.body;
    // Ensure department exists and belongs to same organization as the OrgAdmin
    const department = await Department.findById(departmentId);
    if (!department) return res.status(404).json({ message: 'Department not found' });
    // Infer organization from department name (if you used prefix like "EEP - Customer Service")
    const org = department.name.split(' - ')[0];
    if (org !== req.user.organization) {
      return res.status(403).json({ message: 'You can only create DeptAdmin for your own organization' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'DeptAdmin',
      loginMethod: 'manual',
      organization: org,
      department: departmentId,
      isActive: true,
    });
    // Optionally set department.head to this user (if you want)
    await Department.findByIdAndUpdate(departmentId, { head: user._id });
    res.status(201).json({ _id: user._id, fullName, email, role: user.role, department: departmentId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List users by role (SysAdmin can list all, OrgAdmin can list users in their organization)
exports.listUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'OrgAdmin') {
      filter.organization = req.user.organization;
      filter.role = { $in: ['DeptAdmin', 'Citizen'] }; // OrgAdmin can see their DeptAdmins and Citizens
    }
    const users = await User.find(filter).select('-passwordHash -resetPasswordToken -resetPasswordExpire');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};