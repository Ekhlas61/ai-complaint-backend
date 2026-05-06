const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');

// Helper function for audit logging
const createAuditLog = async (req, action, targetType, targetId, description, status = 'SUCCESS', errorMessage = null) => {
  try {
    await AuditLog.create({
      user: req.user._id,
      action,
      description,
      targetType,
      targetId,
      orgId: targetId, 
      status,
      errorMessage,
      ip: req.ip,
      adminRole: req.user.role, 
    });
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
};

// Create a new organization (SysAdmin only)
exports.createOrganization = async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ message: 'Name and code are required' });
    }
    
    const existing = await Organization.findOne({ $or: [{ name }, { code }] });
    if (existing) {
      return res.status(400).json({ message: 'Organization name or code already exists' });
    }
    
    const org = await Organization.create({ name, code, isActive: true });
    
    // Audit log
    await createAuditLog(
      req,
      'ORGANIZATION_CREATE',
      'Organization',
      org._id,
      `Created organization "${name}" (code: ${code})`,
      'SUCCESS'
    );
    
    res.status(201).json(org);
  } catch (err) {
    // Audit log failure
    await createAuditLog(
      req,
      'ORGANIZATION_CREATE',
      'Organization',
      null,
      `Failed to create organization: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};

// List all active organizations (SysAdmin only) - NO AUDIT NEEDED (GET request)
exports.getOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find({ isActive: true }).sort({ name: 1 });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List active organizations (Citizen only) - NO AUDIT NEEDED (GET request)
exports.getOrganizationsForCitizen = async (req, res) => {
  try {
    const organizations = await Organization.find({ isActive: true })
      .select('_id name')
      .sort({ name: 1 });
    res.json(organizations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update organization (SysAdmin only)
exports.updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const org = await Organization.findById(id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    
    // Track changes for audit description
    const changes = [];
    const oldName = org.name;
    const oldCode = org.code;
    const oldIsActive = org.isActive;
    
    if (updates.name && updates.name.trim() !== org.name) {
      changes.push(`name from "${org.name}" to "${updates.name.trim()}"`);
      org.name = updates.name.trim();
    }
    if (updates.code && updates.code.trim().toUpperCase() !== org.code) {
      changes.push(`code from "${org.code}" to "${updates.code.trim().toUpperCase()}"`);
      org.code = updates.code.trim().toUpperCase();
    }
    if (updates.isActive !== undefined && updates.isActive !== org.isActive) {
      changes.push(`status from "${oldIsActive ? 'Active' : 'Inactive'}" to "${updates.isActive ? 'Active' : 'Inactive'}"`);
      org.isActive = updates.isActive;
    }
    
    if (changes.length === 0) {
      return res.status(400).json({ message: 'No changes detected' });
    }
    
    await org.save();
    
    // Audit log
    await createAuditLog(
      req,
      'ORGANIZATION_UPDATE',
      'Organization',
      org._id,
      `Updated organization ${org.name}: ${changes.join(', ')}`,
      'SUCCESS'
    );
    
    res.json(org);
  } catch (err) {
    // Audit log failure
    await createAuditLog(
      req,
      'ORGANIZATION_UPDATE',
      'Organization',
      req.params.id,
      `Failed to update organization: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};

// Deactivate organization (soft delete)
exports.deactivateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    
    const org = await Organization.findById(id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    
    if (!org.isActive) {
      return res.status(400).json({ message: 'Organization is already deactivated' });
    }
    
    org.isActive = false;
    await org.save();
    
    // Audit log
    await createAuditLog(
      req,
      'ORGANIZATION_DEACTIVATE',
      'Organization',
      org._id,
      `Deactivated organization "${org.name}" (code: ${org.code})`,
      'SUCCESS'
    );
    
    res.json({ message: 'Organization deactivated', organization: { _id: org._id, name: org.name, code: org.code, isActive: false } });
  } catch (err) {
    // Audit log failure
    await createAuditLog(
      req,
      'ORGANIZATION_DEACTIVATE',
      'Organization',
      req.params.id,
      `Failed to deactivate organization: ${err.message}`,
      'FAILURE',
      err.message
    );
    res.status(500).json({ message: err.message });
  }
};