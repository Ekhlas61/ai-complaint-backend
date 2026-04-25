const User = require('../models/User');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const bcrypt = require('bcryptjs');

// Check for existing active OrgAdmin 
async function hasActiveOrgAdmin(organizationId, excludeUserId = null) {
  const query = { role: 'OrgAdmin', organization: organizationId, isActive: true };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return !!existing;
}

// Check for existing active OrgHead
async function hasActiveOrgHead(organizationId, excludeUserId = null) {
  const query = { role: 'OrgHead', organization: organizationId, isActive: true };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return !!existing;
}

// Check for existing active DeptHead
async function hasActiveDeptHead(departmentId, excludeUserId = null) {
  const query = { role: 'DeptHead', department: departmentId, isActive: true };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return !!existing;
}

// ========== ORGADMIN MANAGEMENT (SysAdmin only) ==========

// Create OrgAdmin
exports.createOrgAdmin = async (req, res) => {
  try {
    const { fullName, email, password, organizationId } = req.body;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(400).json({ message: 'Invalid organization ID' });
    }

    // Check if an active OrgAdmin already exists for this organization
    const hasActive = await hasActiveOrgAdmin(organizationId);
    if (hasActive) {
      return res.status(400).json({ message: 'This organization already has an active OrgAdmin. Deactivate the existing one first.' });
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
    const { fullName, email, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OrgAdmin') {
      return res.status(400).json({ message: 'User is not an OrgAdmin' });
    }

    if (isActive !== undefined && isActive === true && !user.isActive) {
      const hasActive = await hasActiveOrgAdmin(user.organization, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'Cannot reactivate: Another active OrgAdmin already exists for this organization.' });
      }
      user.isActive = true;
    } else if (isActive !== undefined && isActive === false && user.isActive) {
      user.isActive = false;
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

// ========== ORGHEAD MANAGEMENT (SysAdmin only) ==========

// Create OrgHead
exports.createOrgHead = async (req, res) => {
  try {
    const { fullName, email, password, organizationId } = req.body;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(400).json({ message: 'Invalid organization ID' });
    }

    // Check if an active OrgHead already exists for this organization
    const hasActive = await hasActiveOrgHead(organizationId);
    if (hasActive) {
      return res.status(400).json({ message: 'This organization already has an active OrgHead. Deactivate the existing one first.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'OrgHead',
      loginMethod: 'manual',
      organization: organization._id,
      isActive: true,
    });

    // Set organization head to this OrgHead
    await Organization.findByIdAndUpdate(organizationId, { head: user._id });

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

// Get all OrgHeads (SysAdmin only)
exports.getOrgHeads = async (req, res) => {
  try {
    const orgHeads = await User.find({ role: 'OrgHead', isActive: true })
      .select('-passwordHash -resetPasswordToken -resetPasswordExpire')
      .populate('organization', 'name');
    res.json(orgHeads);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update OrgHead (SysAdmin only)
exports.updateOrgHead = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, isActive, organizationId } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OrgHead') {
      return res.status(400).json({ message: 'User is not an OrgHead' });
    }

    // If changing organization
    if (organizationId && organizationId !== user.organization?.toString()) {
      const newOrg = await Organization.findById(organizationId);
      if (!newOrg) return res.status(400).json({ message: 'Organization not found' });

      // Check if target organization already has an active OrgHead
      const hasActive = await hasActiveOrgHead(organizationId, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'The target organization already has an active OrgHead.' });
      }

      // Remove as head from old organization
      if (user.organization) {
        await Organization.findByIdAndUpdate(user.organization, { head: null });
      }

      user.organization = newOrg._id;
      await Organization.findByIdAndUpdate(newOrg._id, { head: user._id });
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    if (isActive !== undefined) {
      if (isActive === true && !user.isActive) {
        const hasActive = await hasActiveOrgHead(user.organization, user._id);
        if (hasActive) {
          return res.status(400).json({ message: 'Cannot reactivate: Another active OrgHead already exists for this organization.' });
        }
        user.isActive = true;
        if (user.organization) {
          await Organization.findByIdAndUpdate(user.organization, { head: user._id });
        }
      } else if (isActive === false && user.isActive) {
        user.isActive = false;
        if (user.organization) {
          await Organization.findByIdAndUpdate(user.organization, { head: null });
        }
      }
    }

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

// Deactivate OrgHead (SysAdmin only)
exports.deactivateOrgHead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OrgHead') {
      return res.status(400).json({ message: 'User is not an OrgHead' });
    }
    if (!user.isActive) return res.status(400).json({ message: 'User is already deactivated' });

    user.isActive = false;
    await user.save();

    // Remove this user as head of organization
    if (user.organization) {
      await Organization.findByIdAndUpdate(user.organization, { head: null });
    }

    res.json({ message: 'OrgHead deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== DEPTHEAD MANAGEMENT (OrgAdmin only) ==========

// Create DeptHead
exports.createDeptHead = async (req, res) => {
  try {
    const { fullName, email, password, departmentId } = req.body;

    const department = await Department.findById(departmentId);
    if (!department) return res.status(404).json({ message: 'Department not found' });

    if (department.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only create DeptHead for your own organization' });
    }

    // Check if an active DeptHead already exists for this department
    const hasActive = await hasActiveDeptHead(departmentId);
    if (hasActive) {
      return res.status(400).json({ message: 'This department already has an active DeptHead. Deactivate the existing one first.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'DeptHead',
      loginMethod: 'manual',
      organization: req.user.organization,
      department: departmentId,
      isActive: true,
    });

    // Set department head to this DeptHead
    await Department.findByIdAndUpdate(departmentId, { head: user._id });

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: department.name,
      organization: (await Organization.findById(req.user.organization)).name,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all DeptHeads in the OrgAdmin's organization
exports.getDeptHeads = async (req, res) => {
  try {
    
    let organizationId;
    
    if (req.user.role === 'OrgAdmin') {
      organizationId = req.user.organization;
    } else if (req.user.role === 'OrgHead') {
      organizationId = req.user.organization;
    } else {
      return res.status(403).json({ message: 'Access denied. Only OrgAdmin or OrgHead can view DeptHeads.' });
    }
    
    if (!organizationId) {
      return res.status(400).json({ message: 'User not associated with any organization' });
    }

    const deptHeads = await User.find({
      role: 'DeptHead',
      organization: organizationId,
      isActive: true,
    })
      .select('-passwordHash -resetPasswordToken -resetPasswordExpire')
      .populate('department', 'name code');
    
    res.json(deptHeads);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update DeptHead (OrgAdmin only, must be in same organization)
exports.updateDeptHead = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, departmentId, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'DeptHead') {
      return res.status(400).json({ message: 'User is not a DeptHead' });
    }
    if (user.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only update DeptHeads in your own organization' });
    }

    // If changing department
    if (departmentId && departmentId !== user.department?.toString()) {
      const newDept = await Department.findById(departmentId);
      if (!newDept) return res.status(400).json({ message: 'Department not found' });
      if (newDept.organization.toString() !== req.user.organization.toString()) {
        return res.status(403).json({ message: 'Department must belong to your organization' });
      }

      // Check if target department already has an active DeptHead 
      const hasActive = await hasActiveDeptHead(departmentId, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'The target department already has an active DeptHead. Deactivate that head first.' });
      }

      // Remove head from old department if the user was head
      if (user.department) {
        await Department.findByIdAndUpdate(user.department, { head: null });
      }

      user.department = newDept._id;
      await Department.findByIdAndUpdate(newDept._id, { head: user._id });
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    // If toggling active status
    if (isActive !== undefined) {
      if (isActive === true && !user.isActive) {
        const hasActive = await hasActiveDeptHead(user.department, user._id);
        if (hasActive) {
          return res.status(400).json({ message: 'Cannot reactivate: Another active DeptHead already exists for this department.' });
        }
        user.isActive = true;
        if (user.department) {
          await Department.findByIdAndUpdate(user.department, { head: user._id });
        }
      } else if (isActive === false && user.isActive) {
        user.isActive = false;
        if (user.department) {
          await Department.findByIdAndUpdate(user.department, { head: null });
        }
      }
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

// Deactivate DeptHead (OrgAdmin only)
exports.deactivateDeptHead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'DeptHead') {
      return res.status(400).json({ message: 'User is not a DeptHead' });
    }
    if (user.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only deactivate DeptHeads in your own organization' });
    }
    if (!user.isActive) return res.status(400).json({ message: 'User is already deactivated' });

    user.isActive = false;
    await user.save();

    // Remove this user as head of department
    if (user.department) {
      await Department.findByIdAndUpdate(user.department, { head: null });
    }

    res.json({ message: 'DeptHead deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};