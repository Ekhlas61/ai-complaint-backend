const Department = require('../models/Department');

async function getDepartmentsForPrompt(organizationId) {
  const departments = await Department.find({ organization: organizationId })
    .select('code name description')
    .lean();
  
  return departments.map(d => 
    `- ${d.code}: ${d.name} – ${d.description || 'No description'}`
  ).join('\n');
}

async function findDepartmentByCode(organizationId, code) {
  return await Department.findOne({ organization: organizationId, code });
}

module.exports = { getDepartmentsForPrompt, findDepartmentByCode };