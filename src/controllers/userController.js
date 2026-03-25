const User = require('../models/User');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const bcrypt = require('bcryptjs');

// ========== ORGADMIN MANAGEMENT (SysAdmin only) ==========

// Create OrgAdmin
exports.createOrgAdmin = async (req, res) => {
  try {
    const { fullName, email, password, organizationId } = req.body;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(400).json({ message: 'Invalid organization ID' });
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
      organization: organization._id,
      isActive: true,
    });
    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: organization.name,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all OrgAdmins (SysAdmin only)
exports.getOrgAdmins = async (req, res) => {
  try {
    const orgAdmins = await User.find({ role: 'OrgAdmin', isActive: true })
      .select('-passwordHash -resetPasswordToken -resetPasswordExpire')
      .populate('organization', 'name');
    res.json(orgAdmins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update OrgAdmin (SysAdmin only)
exports.updateOrgAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OrgAdmin') {
      return res.status(400).json({ message: 'User is not an OrgAdmin' });
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    await user.save();

    res.json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: user.organization ? (await Organization.findById(user.organization)).name : null,
      isActive: user.isActive,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deactivate OrgAdmin (SysAdmin only)
exports.deactivateOrgAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OrgAdmin') {
      return res.status(400).json({ message: 'User is not an OrgAdmin' });
    }
    if (!user.isActive) return res.status(400).json({ message: 'User is already deactivated' });

    user.isActive = false;
    await user.save();

    res.json({ message: 'OrgAdmin deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== DEPTADMIN MANAGEMENT (OrgAdmin only) ==========

// Create DeptAdmin
exports.createDeptAdmin = async (req, res) => {
  try {
    const { fullName, email, password, departmentId } = req.body;

    const department = await Department.findById(departmentId);
    if (!department) return res.status(404).json({ message: 'Department not found' });

    if (department.organization.toString() !== req.user.organization.toString()) {
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
      organization: req.user.organization,
      department: departmentId,
      isActive: true,
    });

    // Set department head to this DeptAdmin
    await Department.findByIdAndUpdate(departmentId, { head: user._id });

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: departmentId,
      organization: (await Organization.findById(req.user.organization)).name,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all DeptAdmins in the OrgAdmin's organization
exports.getDeptAdmins = async (req, res) => {
  try {
    const deptAdmins = await User.find({
      role: 'DeptAdmin',
      organization: req.user.organization,
      isActive: true,
    })
      .select('-passwordHash -resetPasswordToken -resetPasswordExpire')
      .populate('department', 'name');
    res.json(deptAdmins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update DeptAdmin (OrgAdmin only, must be in same organization)
exports.updateDeptAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, departmentId } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'DeptAdmin') {
      return res.status(400).json({ message: 'User is not a DeptAdmin' });
    }
    if (user.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only update DeptAdmins in your own organization' });
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    if (departmentId) {
      // Validate new department
      const newDept = await Department.findById(departmentId);
      if (!newDept) return res.status(400).json({ message: 'Department not found' });
      if (newDept.organization.toString() !== req.user.organization.toString()) {
        return res.status(403).json({ message: 'Department must belong to your organization' });
      }

      // Remove head from old department if the user had one
      if (user.department) {
        await Department.findByIdAndUpdate(user.department, { head: null });
      }

      // Update user's department and set new department head
      user.department = newDept._id;
      await Department.findByIdAndUpdate(newDept._id, { head: user._id });
    }

    await user.save();

    res.json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department ? (await Department.findById(user.department)).name : null,
      organization: (await Organization.findById(user.organization)).name,
      isActive: user.isActive,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deactivate DeptAdmin (OrgAdmin only)
exports.deactivateDeptAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'DeptAdmin') {
      return res.status(400).json({ message: 'User is not a DeptAdmin' });
    }
    if (user.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only deactivate DeptAdmins in your own organization' });
    }
    if (!user.isActive) return res.status(400).json({ message: 'User is already deactivated' });

    user.isActive = false;
    await user.save();

    // Remove this user as head of department if they were the head
    if (user.department) {
      await Department.findByIdAndUpdate(user.department, { head: null });
    }

    res.json({ message: 'DeptAdmin deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

