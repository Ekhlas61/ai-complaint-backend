const AuditLog = require('../models/AuditLog');

exports.isSysAdmin = (req, res, next) => {
  if (req.user.role !== 'SysAdmin') {
    return res.status(403).json({ 
      success: false,
      message: 'Access denied. Only System Administrators can view audit logs.' 
    });
  }
  next();
};

// Simple: Just fetch all admin activities with pagination
exports.getAdminActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Fixed filter - only admin activities, no user choices
    const filter = {
      action: {
        $in: [
          'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_ROLE_CHANGE',
          'ORGANIZATION_CREATE', 'ORGANIZATION_UPDATE', 'ORGANIZATION_DEACTIVATE',
          'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'DEPARTMENT_DEACTIVATE',
          'LOGIN', 'LOGOUT'
        ]
      }
    };
    
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'fullName email role')
        .populate('orgId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch activities' });
  }
};

// Simple summary dashboard
// Simple summary dashboard
exports.getAdminSummary = async (req, res) => {
  try {
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Define the filter for recent activities
    const filter = {
      action: {
        $in: [
          'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_ROLE_CHANGE',
          'ORGANIZATION_CREATE', 'ORGANIZATION_UPDATE', 'ORGANIZATION_DEACTIVATE',
          'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'DEPARTMENT_DEACTIVATE',
          'LOGIN', 'LOGOUT'
        ]
      }
    };
    
    const [
      totalAdmins,
      userChanges,
      orgChanges,
      deptChanges,
      recentActivities
    ] = await Promise.all([
      // Count unique admins who performed actions
      AuditLog.distinct('user', { adminRole: { $exists: true } }).then(users => users.length),
      
      // User management actions
      AuditLog.countDocuments({
        createdAt: { $gte: last30d },
        action: { $in: ['USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE'] }
      }),
      
      // Organization changes
      AuditLog.countDocuments({
        createdAt: { $gte: last30d },
        action: { $in: ['ORGANIZATION_CREATE', 'ORGANIZATION_UPDATE', 'ORGANIZATION_DEACTIVATE'] }
      }),
      
      // Department changes
      AuditLog.countDocuments({
        createdAt: { $gte: last30d },
        action: { $in: ['DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'DEPARTMENT_DEACTIVATE'] }
      }),
      
      // Last 10 activities for quick view
      AuditLog.find(filter)
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);
    
    res.json({
      success: true,
      summary: {
        totalActiveAdmins: totalAdmins,
        last30Days: {
          userManagementActions: userChanges,
          organizationChanges: orgChanges,
          departmentChanges: deptChanges
        },
        recentActivities
      }
    });
    
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch summary' });
  }
};