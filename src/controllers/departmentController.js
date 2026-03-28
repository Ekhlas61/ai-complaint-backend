const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

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

    // Audit log
    await AuditLog.create({
      user: req.user._id,
      action: 'DEPARTMENT_CREATE',
      description: `Created department "${name}" (code: ${code})`,
      targetType: 'Department',
      targetId: department._id,
      ip: req.ip,
    });

    res.status(201).json(department);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

// ────────────────────────────────────────────────
// OrgAdmin: List all active departments (only for their organization)
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

    // Only allow certain fields
    if (updates.name) department.name = updates.name.trim();
    if (updates.code) department.code = updates.code.toUpperCase().trim();
    if (updates.description !== undefined) department.description = updates.description?.trim() || '';
  

    await department.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'DEPARTMENT_UPDATE',
      description: `Updated department ${department.name} (${department.code})`,
      targetType: 'Department',
      targetId: department._id,
      ip: req.ip,
    });

    res.json(department);
  } catch (err) {
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

    await AuditLog.create({
      user: req.user._id,
      action: 'DEPARTMENT_DEACTIVATE',
      description: `Deactivated department ${department.name} (${department.code})`,
      targetType: 'Department',
      targetId: department._id,
      ip: req.ip,
    });

    res.json({ message: 'Department deactivated', department });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};