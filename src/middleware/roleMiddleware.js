const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}`,
      });
    }
    next();
  };
};

// Specific role middleware for convenience
const isCitizen = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'Citizen') {
    return res.status(403).json({ message: 'Access denied. Citizen role required.' });
  }
  next();
};

const isDeptHead = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'DeptHead') {
    return res.status(403).json({ message: 'Access denied. DeptHead role required.' });
  }
  next();
};

const isOrgAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'OrgAdmin') {
    return res.status(403).json({ message: 'Access denied. OrgAdmin role required.' });
  }
  next();
};

const isOrgHead = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'OrgHead') {
    return res.status(403).json({ message: 'Access denied. OrgHead role required.' });
  }
  next();
};

const isSysAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'SysAdmin') {
    return res.status(403).json({ message: 'Access denied. SysAdmin role required.' });
  }
  next();
};

module.exports = {
  authorizeRoles,
  isCitizen,
  isDeptHead,
  isOrgAdmin,
  isOrgHead,
  isSysAdmin,
};