const { newEnforcer } = require('casbin');
const path = require('path');

let enforcer = null;

/**
 * Initialize Casbin enforcer with model and policy files
 */
const initCasbin = async () => {
  try {
    const modelPath = path.join(__dirname, '..', 'casbin', 'model.conf');
    const policyPath = path.join(__dirname, '..', 'casbin', 'policy.csv');
    
    enforcer = await newEnforcer(modelPath, policyPath);
    
    console.log('✅ Casbin enforcer initialized successfully');
    
    // Load initial policies if needed
    await loadPolicies();
    
    return enforcer;
  } catch (error) {
    console.error('❌ Failed to initialize Casbin enforcer:', error);
    throw error;
  }
};

/**
 * Load policies into the enforcer
 */
const loadPolicies = async () => {
  try {
    // Policies are automatically loaded from policy.csv during initialization
    // Additional policies can be added programmatically here if needed
    console.log('📋 Casbin policies loaded');
  } catch (error) {
    console.error('❌ Failed to load Casbin policies:', error);
    throw error;
  }
};

/**
 * Get the Casbin enforcer instance
 * @returns {Object} Casbin enforcer
 */
const getEnforcer = () => {
  if (!enforcer) {
    throw new Error('Casbin enforcer not initialized. Call initCasbin() first.');
  }
  return enforcer;
};

/**
 * Check if a user has permission for a specific action on a resource
 * @param {string} role - User role
 * @param {string} resource - Resource type (e.g., 'complaint')
 * @param {string} action - Action (e.g., 'create', 'read', 'update_status')
 * @param {string} organization - Organization ID or '*'
 * @returns {Promise<boolean>} Whether the user has permission
 */
const checkPermission = async (role, resource, action, organization) => {
  try {
    const enforcer = getEnforcer();
    const result = await enforcer.enforce(role, resource, action, organization);
    return result;
  } catch (error) {
    console.error('❌ Error checking permission:', error);
    return false;
  }
};

/**
 * Add a new policy
 * @param {string} role - User role
 * @param {string} resource - Resource type
 * @param {string} action - Action
 * @param {string} organization - Organization ID or '*'
 */
const addPolicy = async (role, resource, action, organization) => {
  try {
    const enforcer = getEnforcer();
    const added = await enforcer.addPolicy(role, resource, action, organization);
    if (added) {
      console.log(`✅ Policy added: ${role}, ${resource}, ${action}, ${organization}`);
    }
    return added;
  } catch (error) {
    console.error('❌ Error adding policy:', error);
    return false;
  }
};

/**
 * Remove a policy
 * @param {string} role - User role
 * @param {string} resource - Resource type
 * @param {string} action - Action
 * @param {string} organization - Organization ID or '*'
 */
const removePolicy = async (role, resource, action, organization) => {
  try {
    const enforcer = getEnforcer();
    const removed = await enforcer.removePolicy(role, resource, action, organization);
    if (removed) {
      console.log(`✅ Policy removed: ${role}, ${resource}, ${action}, ${organization}`);
    }
    return removed;
  } catch (error) {
    console.error('❌ Error removing policy:', error);
    return false;
  }
};

/**
 * Get all policies
 * @returns {Array} Array of policies
 */
const getAllPolicies = async () => {
  try {
    const enforcer = getEnforcer();
    const policies = await enforcer.getPolicy();
    return policies;
  } catch (error) {
    console.error('❌ Error getting policies:', error);
    return [];
  }
};

module.exports = {
  initCasbin,
  getEnforcer,
  checkPermission,
  addPolicy,
  removePolicy,
  getAllPolicies
};
