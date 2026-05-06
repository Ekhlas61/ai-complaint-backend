const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

// Helper function for audit logging
const createAuditLog = async (req, action, targetType, targetId, description, status = 'SUCCESS', errorMessage = null) => {
  try {
    await AuditLog.create({
      user: req.user._id,
      action,
      description,
      targetType,
      targetId,
      orgId: req.user.organization,  
      status,
      errorMessage,
      ip: req.ip,
      adminRole: req.user.role,  
    });
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
};

// ────────────────────────────────────────────────
// OrgAdmin: Create department
// ────────────────────────────────────────────────
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    // Basic validation
    if (!name || !code) {
      return res.status(400).json({ message: 'Name and code are required' });
    }

    // Ensure the OrgAdmin has an organization assigned
    if (!req.user.organization) {
      return res.status(403).json({ message: 'Your account is not associated with an organization' });
    }

    const existing = await Department.findOne({ $or: [{ name }, { code }] });
    if (existing) {
      return res.status(400).json({ message: 'Name or code already in use' });
    }

    const department = await Department.create({
      name,
      code: code.toUpperCase().trim(),
      description,
      organization: req.user.organization,
    });

    
    await createAuditLog(
      req,
      'DEPARTMENT_CREATE',
      'Department',
      department._id,
      `Created department "${name}" (code: ${code})`,
      'SUCCESS'
    );

    res.status(201).json(department);
  } catch (err) {
    console.error(err);
    
    
    await createAuditLog(
      req,
      'DEPARTMENT_CREATE',
      'Department',
      null,
      `Failed to create department: ${err.message}`,
      'FAILURE',
      err.message
    );
    
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

// ────────────────────────────────────────────────
// OrgAdmin & OrgHead: List all active departments (only for their organization)
// ────────────────────────────────────────────────
exports.getDepartments = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ message: 'Your account is not associated with an organization' });
    }

    const departments = await Department.find({
      isActive: true,
      organization: req.user.organization,
    })
      .populate('organization', 'name code')
      .sort({ name: 1 });

    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ────────────────────────────────────────────────
// OrgAdmin: Update department (must belong to their organization)
// ────────────────────────────────────────────────
exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Ensure the department belongs to the OrgAdmin's organization
    if (department.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only update departments of your own organization' });
    }

    // Track changes for description
    const changes = [];
    if (updates.name && updates.name.trim() !== department.name) {
      changes.push(`name from "${department.name}" to "${updates.name.trim()}"`);
      department.name = updates.name.trim();
    }
    if (updates.code && updates.code.toUpperCase().trim() !== department.code) {
      changes.push(`code from "${department.code}" to "${updates.code.toUpperCase().trim()}"`);
      department.code = updates.code.toUpperCase().trim();
    }
    if (updates.description !== undefined && updates.description?.trim() !== department.description) {
      changes.push('description updated');
      department.description = updates.description?.trim() || '';
    }

    if (changes.length === 0) {
      return res.status(400).json({ message: 'No changes detected' });
    }

    await department.save();

    
    await createAuditLog(
      req,
      'DEPARTMENT_UPDATE',
      'Department',
      department._id,
      `Updated department ${department.name}: ${changes.join(', ')}`,
      'SUCCESS'
    );

    res.json(department);
  } catch (err) {
    console.error(err);
    
  
    await createAuditLog(
      req,
      'DEPARTMENT_UPDATE',
      'Department',
      req.params.id,
      `Failed to update department: ${err.message}`,
      'FAILURE',
      err.message
    );
    
    res.status(500).json({ message: 'Server error' });
  }
};

// ────────────────────────────────────────────────
// OrgAdmin: Deactivate department (soft delete)
// ────────────────────────────────────────────────
exports.deactivateDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Ensure the department belongs to the OrgAdmin's organization
    if (department.organization.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'You can only deactivate departments of your own organization' });
    }

    if (!department.isActive) {
      return res.status(400).json({ message: 'Department already deactivated' });
    }

    department.isActive = false;
    await department.save();

    
    await createAuditLog(
      req,
      'DEPARTMENT_DEACTIVATE',
      'Department',
      department._id,
      `Deactivated department ${department.name} (${department.code})`,
      'SUCCESS'
    );

    res.json({ message: 'Department deactivated', department });
  } catch (err) {
    console.error(err);
    
    
    await createAuditLog(
      req,
      'DEPARTMENT_DEACTIVATE',
      'Department',
      req.params.id,
      `Failed to deactivate department: ${err.message}`,
      'FAILURE',
      err.message
    );
    
    res.status(500).json({ message: 'Server error' });
  }
};