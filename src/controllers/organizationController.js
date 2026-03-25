const Organization = require('../models/Organization');

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
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List all active organizations (SysAdmin only)
exports.getOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find({ isActive: true }).sort({ name: 1 });
    res.json(orgs);
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
    if (updates.name) org.name = updates.name.trim();
    if (updates.code) org.code = updates.code.trim().toUpperCase();
    if (updates.isActive !== undefined) org.isActive = updates.isActive;
    await org.save();
    res.json(org);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deactivate organization (soft delete)
exports.deactivateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await Organization.findById(id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    org.isActive = false;
    await org.save();
    res.json({ message: 'Organization deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};