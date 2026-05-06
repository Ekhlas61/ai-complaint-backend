const User = require('../models/User');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const bcrypt = require('bcryptjs');
const AuditLog = require('../models/AuditLog');

// Helper function for audit logging
const createAuditLog = async (req, action, targetType, targetId, description, status = 'SUCCESS', errorMessage = null) => {
  try {
     const ipAddress = req.ip || 
                      req.connection?.remoteAddress || 
                      req.socket?.remoteAddress || 
                      req.headers['x-forwarded-for']?.split(',')[0] || 
                      'unknown';
    await AuditLog.create({
      user: req.user._id,
      action,
      description,
      targetType,
      targetId,
      orgId: req.user.organization || (targetType === 'Organization' ? targetId : null),
      status,
      errorMessage,
      ip: ipAddress,
      adminRole: req.user.role,
    });
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
};

// Helper functions for existence checks (unchanged)
async function hasActiveOrgAdmin(organizationId, excludeUserId = null) {
  const query = { role: 'OrgAdmin', organization: organizationId, isActive: true };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return !!existing;
}

async function hasActiveOrgHead(organizationId, excludeUserId = null) {
  const query = { role: 'OrgHead', organization: organizationId, isActive: true };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return !!existing;
}

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

    // Audit log - SUCCESS
    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      user._id,
      `Created OrgAdmin "${fullName}" (${email}) for organization ${organization.name}`,
      'SUCCESS'
    );

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: organization.name,
    });
  } catch (err) {
    // Audit log - FAILURE
    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      null,
      `Failed to create OrgAdmin: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};

// Get all OrgAdmins (SysAdmin only) - NO AUDIT LOG NEEDED (GET request)
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

    const changes = [];
    if (fullName && fullName !== user.fullName) changes.push(`name from "${user.fullName}" to "${fullName}"`);
    if (email && email !== user.email) changes.push(`email from "${user.email}" to "${email}"`);

    if (isActive !== undefined && isActive === true && !user.isActive) {
      const hasActive = await hasActiveOrgAdmin(user.organization, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'Cannot reactivate: Another active OrgAdmin already exists for this organization.' });
      }
      user.isActive = true;
      changes.push(`reactivated account`);
    } else if (isActive !== undefined && isActive === false && user.isActive) {
      user.isActive = false;
      changes.push(`deactivated account`);
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    await user.save();

    if (changes.length > 0) {
      // Audit log - SUCCESS
      await createAuditLog(
        req,
        'USER_UPDATE',
        'User',
        user._id,
        `Updated OrgAdmin ${user.fullName}: ${changes.join(', ')}`,
        'SUCCESS'
      );
    }

    res.json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: user.organization ? (await Organization.findById(user.organization)).name : null,
      isActive: user.isActive,
    });
  } catch (err) {
    // Audit log - FAILURE
    await createAuditLog(
      req,
      'USER_UPDATE',
      'User',
      req.params.id,
      `Failed to update OrgAdmin: ${err.message}`,
      'FAILURE',
      err.message
    );
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

    // Audit log
    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      user._id,
      `Deactivated OrgAdmin ${user.fullName} (${user.email})`,
      'SUCCESS'
    );

    res.json({ message: 'OrgAdmin deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    // Audit log - FAILURE
    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      req.params.id,
      `Failed to deactivate OrgAdmin: ${err.message}`,
      'FAILURE',
      err.message
    );
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

    await Organization.findByIdAndUpdate(organizationId, { head: user._id });

    // Audit log
    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      user._id,
      `Created OrgHead "${fullName}" (${email}) for organization ${organization.name}`,
      'SUCCESS'
    );

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: organization.name,
    });
  } catch (err) {
    // Audit log - FAILURE
    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      null,
      `Failed to create OrgHead: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};

// Get all OrgHeads (SysAdmin only) - NO AUDIT LOG NEEDED
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

    const changes = [];
    if (fullName && fullName !== user.fullName) changes.push(`name from "${user.fullName}" to "${fullName}"`);
    if (email && email !== user.email) changes.push(`email from "${user.email}" to "${email}"`);

    if (organizationId && organizationId !== user.organization?.toString()) {
      const newOrg = await Organization.findById(organizationId);
      if (!newOrg) return res.status(400).json({ message: 'Organization not found' });

      const hasActive = await hasActiveOrgHead(organizationId, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'The target organization already has an active OrgHead.' });
      }

      if (user.organization) {
        await Organization.findByIdAndUpdate(user.organization, { head: null });
      }

      const oldOrgName = user.organization ? (await Organization.findById(user.organization)).name : 'None';
      changes.push(`organization from "${oldOrgName}" to "${newOrg.name}"`);

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
        changes.push('reactivated account');
        if (user.organization) {
          await Organization.findByIdAndUpdate(user.organization, { head: user._id });
        }
      } else if (isActive === false && user.isActive) {
        user.isActive = false;
        changes.push('deactivated account');
        if (user.organization) {
          await Organization.findByIdAndUpdate(user.organization, { head: null });
        }
      }
    }

    await user.save();

    if (changes.length > 0) {
      await createAuditLog(
        req,
        'USER_UPDATE',
        'User',
        user._id,
        `Updated OrgHead ${user.fullName}: ${changes.join(', ')}`,
        'SUCCESS'
      );
    }

    res.json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organization: user.organization ? (await Organization.findById(user.organization)).name : null,
      isActive: user.isActive,
    });
  } catch (err) {
    await createAuditLog(
      req,
      'USER_UPDATE',
      'User',
      req.params.id,
      `Failed to update OrgHead: ${err.message}`,
      'FAILURE',
      err.message
    );
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

    if (user.organization) {
      await Organization.findByIdAndUpdate(user.organization, { head: null });
    }

    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      user._id,
      `Deactivated OrgHead ${user.fullName} (${user.email})`,
      'SUCCESS'
    );

    res.json({ message: 'OrgHead deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      req.params.id,
      `Failed to deactivate OrgHead: ${err.message}`,
      'FAILURE',
      err.message
    );
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

    await Department.findByIdAndUpdate(departmentId, { head: user._id });

    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      user._id,
      `Created DeptHead "${fullName}" (${email}) for department ${department.name}`,
      'SUCCESS'
    );

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: department.name,
      organization: (await Organization.findById(req.user.organization)).name,
    });
  } catch (err) {
    await createAuditLog(
      req,
      'USER_CREATE',
      'User',
      null,
      `Failed to create DeptHead: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};

// Get all DeptHeads - NO AUDIT LOG NEEDED (GET request)
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

// Update DeptHead (OrgAdmin only)
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

    const changes = [];
    if (fullName && fullName !== user.fullName) changes.push(`name from "${user.fullName}" to "${fullName}"`);
    if (email && email !== user.email) changes.push(`email from "${user.email}" to "${email}"`);

    if (departmentId && departmentId !== user.department?.toString()) {
      const newDept = await Department.findById(departmentId);
      if (!newDept) return res.status(400).json({ message: 'Department not found' });
      if (newDept.organization.toString() !== req.user.organization.toString()) {
        return res.status(403).json({ message: 'Department must belong to your organization' });
      }

      const hasActive = await hasActiveDeptHead(departmentId, user._id);
      if (hasActive) {
        return res.status(400).json({ message: 'The target department already has an active DeptHead. Deactivate that head first.' });
      }

      if (user.department) {
        const oldDept = await Department.findById(user.department);
        changes.push(`department from "${oldDept.name}" to "${newDept.name}"`);
        await Department.findByIdAndUpdate(user.department, { head: null });
      }

      user.department = newDept._id;
      await Department.findByIdAndUpdate(newDept._id, { head: user._id });
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    if (isActive !== undefined) {
      if (isActive === true && !user.isActive) {
        const hasActive = await hasActiveDeptHead(user.department, user._id);
        if (hasActive) {
          return res.status(400).json({ message: 'Cannot reactivate: Another active DeptHead already exists for this department.' });
        }
        user.isActive = true;
        changes.push('reactivated account');
        if (user.department) {
          await Department.findByIdAndUpdate(user.department, { head: user._id });
        }
      } else if (isActive === false && user.isActive) {
        user.isActive = false;
        changes.push('deactivated account');
        if (user.department) {
          await Department.findByIdAndUpdate(user.department, { head: null });
        }
      }
    }

    await user.save();

    if (changes.length > 0) {
      await createAuditLog(
        req,
        'USER_UPDATE',
        'User',
        user._id,
        `Updated DeptHead ${user.fullName}: ${changes.join(', ')}`,
        'SUCCESS'
      );
    }

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
    await createAuditLog(
      req,
      'USER_UPDATE',
      'User',
      req.params.id,
      `Failed to update DeptHead: ${err.message}`,
      'FAILURE',
      err.message
    );
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

    if (user.department) {
      await Department.findByIdAndUpdate(user.department, { head: null });
    }

    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      user._id,
      `Deactivated DeptHead ${user.fullName} (${user.email})`,
      'SUCCESS'
    );

    res.json({ message: 'DeptHead deactivated successfully', user: { _id: user._id, fullName: user.fullName, email: user.email, isActive: false } });
  } catch (err) {
    await createAuditLog(
      req,
      'USER_DEACTIVATE',
      'User',
      req.params.id,
      `Failed to deactivate DeptHead: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};