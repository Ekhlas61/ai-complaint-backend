const { checkPermission } = require('../config/casbin');

/**
 * Create a middleware function to check permissions using Casbin
 * @param {string} resource - Resource type (e.g., 'complaint')
 * @param {string} action - Action (e.g., 'create', 'read', 'update_status')
 * @param {Function} getOrganization - Optional function to extract organization from request
 * @returns {Function} Express middleware function
 */
const casbinAuth = (resource, action, getOrganization = null) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated and has role
      if (!req.user || !req.user.role) {
        return res.status(401).json({ 
          message: 'Authentication required' 
        });
      }

      // Extract organization ID
      let organizationId = '*';
      
      if (getOrganization && typeof getOrganization === 'function') {
        organizationId = await getOrganization(req);
      } else if (req.user.organization) {
        organizationId = req.user.organization.toString();
      } else if (req.body && req.body.organizationId) {
        organizationId = req.body.organizationId;
      } else if (req.params && req.params.organizationId) {
        organizationId = req.params.organizationId;
      }

      // Special handling for cross-organization actions
      // SysAdmin can access any organization
      if (req.user.role === 'SysAdmin') {
        organizationId = '*';
      }

      // Check permission using Casbin
      const hasPermission = await checkPermission(
        req.user.role,
        resource,
        action,
        organizationId
      );

      if (!hasPermission) {
        console.log(`🚫 Access denied: ${req.user.role} cannot ${action} ${resource} in org ${organizationId}`);
        return res.status(403).json({ 
          message: 'Access denied',
          details: `You do not have permission to ${action} this ${resource}`,
          role: req.user.role,
          resource,
          action,
          organization: organizationId
        });
      }

      // User has permission, continue
      console.log(`✅ Access granted: ${req.user.role} can ${action} ${resource} in org ${organizationId}`);
      next();
    } catch (error) {
      console.error('❌ Casbin authorization error:', error);
      return res.status(500).json({ 
        message: 'Authorization check failed' 
      });
    }
  };
};

/**
 * Helper function to create organization extractor from request body
 * @param {string} field - Field name in request body containing organization ID
 * @returns {Function} Function to extract organization from request
 */
const getOrgFromBody = (field = 'organizationId') => {
  return (req) => {
    return req.body && req.body[field] ? req.body[field].toString() : '*';
  };
};

/**
 * Helper function to create organization extractor from request params
 * @param {string} field - Field name in request params containing organization ID
 * @returns {Function} Function to extract organization from request
 */
const getOrgFromParams = (field = 'organizationId') => {
  return (req) => {
    return req.params && req.params[field] ? req.params[field].toString() : '*';
  };
};

/**
 * Helper function to create organization extractor from user's organization
 * @returns {Function} Function to extract organization from authenticated user
 */
const getOrgFromUser = () => {
  return (req) => {
    return req.user && req.user.organization ? req.user.organization.toString() : '*';
  };
};

/**
 * Helper function to create organization extractor from complaint's organization
 * This fetches the complaint to determine its organization
 * @returns {Function} Function to extract organization from complaint
 */
const getOrgFromComplaint = () => {
  return async (req) => {
    try {
      const Complaint = require('../models/Complaint');
      const complaintId = req.params.id || req.params.complaintId;
      
      if (complaintId) {
        const complaint = await Complaint.findById(complaintId).select('organization');
        if (complaint && complaint.organization) {
          return complaint.organization.toString();
        }
      }
      
      return req.user && req.user.organization ? req.user.organization.toString() : '*';
    } catch (error) {
      console.error('Error extracting organization from complaint:', error);
      return '*';
    }
  };
};

/**
 * Pre-configured authorization middleware for common complaint operations
 */
const complaintAuth = {
  // Create complaint - any user can create in any organization (Citizens)
  create: casbinAuth('complaint', 'create', getOrgFromBody('organizationId')),
  
  // Read complaint - based on complaint's organization
  read: casbinAuth('complaint', 'read', getOrgFromComplaint()),
  
  // Update status - based on complaint's organization
  updateStatus: casbinAuth('complaint', 'update_status', getOrgFromComplaint()),
  
  // Assign complaint - based on complaint's organization
  assign: casbinAuth('complaint', 'assign', getOrgFromComplaint()),
  
  // Comment on complaint - based on complaint's organization
  comment: casbinAuth('complaint', 'comment', getOrgFromComplaint()),
  
  // Override complaint - based on complaint's organization
  override: casbinAuth('complaint', 'override', getOrgFromComplaint()),
  
  // Delete complaint - only SysAdmin
  delete: casbinAuth('complaint', 'delete')
};

module.exports = {
  casbinAuth,
  getOrgFromBody,
  getOrgFromParams,
  getOrgFromUser,
  getOrgFromComplaint,
  complaintAuth
};
