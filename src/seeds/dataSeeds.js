const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('DB connection error:', err);
    process.exit(1);
  }
};

const seedAll = async () => {
  try {
    const defaultPassword = 'Admin@123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(defaultPassword, salt);

    // ========== CREATE ORGANIZATIONS ==========
    const eepOrg = await Organization.findOneAndUpdate(
      { code: 'EEP' },
      { name: 'Ethiopian Electric Utility', code: 'EEP', isActive: true },
      { upsert: true, new: true }
    );
    const aawsaOrg = await Organization.findOneAndUpdate(
      { code: 'AAWSA' },
      { name: 'Addis Ababa Water & Sewerage Authority', code: 'AAWSA', isActive: true },
      { upsert: true, new: true }
    );
    console.log('Organizations seeded:', {
      eep: { id: eepOrg._id, name: eepOrg.name },
      aawsa: { id: aawsaOrg._id, name: aawsaOrg.name },
    });

    // ========== CREATE SYSMIN ==========
    const sysAdmin = await User.findOneAndUpdate(
      { email: 'sysadmin@complaint.gov' },
      {
        fullName: 'System Administrator',
        email: 'sysadmin@complaint.gov',
        passwordHash,
        role: 'SysAdmin',
        loginMethod: 'manual',
        isActive: true,
      },
      { upsert: true, new: true }
    );
    console.log('SysAdmin seeded:', sysAdmin.email);

    // ========== CREATE ORGADMINS (one per organization) ==========
    const orgAdminsData = [
      {
        email: 'admin@eep.com.et',
        fullName: 'EEP Organization Admin',
        organization: eepOrg._id,
      },
      {
        email: 'admin@aawsa.gov.et',
        fullName: 'AAWSA Organization Admin',
        organization: aawsaOrg._id,
      },
    ];

    const orgAdmins = [];
    for (const data of orgAdminsData) {
      const existing = await User.findOne({ 
        organization: data.organization, 
        role: 'OrgAdmin', 
        isActive: true 
      });
      if (existing && existing.email !== data.email) {
        console.warn(`OrgAdmin for organization ${data.organization} already exists: ${existing.email}. Skipping ${data.email}`);
        continue;
      }
      const admin = await User.findOneAndUpdate(
        { email: data.email },
        {
          fullName: data.fullName,
          email: data.email,
          passwordHash,
          role: 'OrgAdmin',
          loginMethod: 'manual',
          isActive: true,
          organization: data.organization,
        },
        { upsert: true, new: true }
      );
      orgAdmins.push(admin);
      console.log(`OrgAdmin seeded: ${admin.email} (org: ${admin.organization})`);
    }

    //CREATE DEPARTMENTS  
    
    // AAWSA departments
    const aawsaDepartments = [
      { 
        name: 'Water Supply Department', 
        code: 'WATER_SUPPLY', 
        description: `Handles water availability and pressure issues. Manages complaints about no water, low pressure, intermittent supply, or complete water cuts.`
      },
      { 
        name: 'Water Quality Department', 
        code: 'WATER_QUALITY', 
        description: `Addresses water that is dirty, discolored, has bad smell, strange taste, or contains visible particles.`
      },
      { 
        name: 'Pipe Maintenance Department', 
        code: 'PIPE_MAINTENANCE', 
        description: `Responsible for physical damage to water pipes and infrastructure, including burst pipes, leaks, broken mains, and gushing water.`
      },
      { 
        name: 'Sewerage Department', 
        code: 'SEWERAGE', 
        description: `Handles sewage and drainage system problems such as blockages, overflow, bad odours, and manhole issues.`
      },
      { 
        name: 'Meter Service (AAWSA)', 
        code: 'METER_SERVICE_AAWSA', 
        description: `Manages water meter problems including non‑working meters, incorrect readings, tampering, and replacement requests.`
      },
      { 
        name: 'Customer Service (AAWSA)', 
        code: 'CUSTOMER_SERVICE_AAWSA', 
        description: `Handles billing disputes, account management, payments, new connections, and general inquiries not related to physical water issues.`
      },
    ];

    // EEP departments
    const eepDepartments = [
      { 
        name: 'Power Outage Response', 
        code: 'POWER_OUTAGE', 
        description: `Handles complete loss of electricity, area‑wide blackouts, frequent power cuts, and unstable supply.`
      },
      { 
        name: 'Safety & Emergency', 
        code: 'SAFETY_EMERGENCY', 
        description: `Addresses immediate dangers from electrical faults, such as exposed live wires, fallen poles, sparking cables, and electric shock risks.`
      },
      { 
        name: 'Transformer Maintenance', 
        code: 'TRANSFORMER_ISSUE', 
        description: `Manages problems with electrical transformers, including explosions, humming noise, oil leaks, or complete failure.`
      },
      { 
        name: 'Line Maintenance', 
        code: 'LINE_MAINTENANCE', 
        description: `Responsible for overhead power lines and cables – fallen lines, tree branches touching wires, loose or sagging cables.`
      },
      { 
        name: 'Meter Service (EEP)', 
        code: 'METER_SERVICE', 
        description: `Handles electricity meter issues – non‑working meters, incorrect readings, tampering, and replacement requests.`
      },
      { 
        name: 'Customer Service (EEP)', 
        code: 'CUSTOMER_SERVICE_EEP', 
        description: `Manages billing disputes, account issues, payments, new connections, and inquiries not related to physical electrical problems.`
      },
    ];

    const allDepartments = [
      ...aawsaDepartments.map(d => ({ ...d, organization: aawsaOrg._id })),
      ...eepDepartments.map(d => ({ ...d, organization: eepOrg._id })),
    ];

    const createdDepts = {};
    for (const deptData of allDepartments) {
      const dept = await Department.findOneAndUpdate(
        { code: deptData.code },
        { ...deptData, isActive: true },
        { upsert: true, new: true }
      );
      createdDepts[deptData.code] = dept;
      console.log(`Department seeded: ${dept.code} (${dept.name})`);
    }

    // ========== CREATE DEPTADMINS (one per department) ==========
    const deptAdminsData = [
      // AAWSA DeptAdmins
      { fullName: 'Ayele Water Supply', email: 'water.supply@aawsa.gov.et', departmentCode: 'WATER_SUPPLY', org: aawsaOrg },
      { fullName: 'Bekele Water Quality', email: 'water.quality@aawsa.gov.et', departmentCode: 'WATER_QUALITY', org: aawsaOrg },
      { fullName: 'Chala Pipe Maintenance', email: 'pipe.maintenance@aawsa.gov.et', departmentCode: 'PIPE_MAINTENANCE', org: aawsaOrg },
      { fullName: 'Desta Sewerage', email: 'sewerage@aawsa.gov.et', departmentCode: 'SEWERAGE', org: aawsaOrg },
      { fullName: 'Eshetu Meter Service', email: 'meter.service.aawsa@aawsa.gov.et', departmentCode: 'METER_SERVICE_AAWSA', org: aawsaOrg },
      { fullName: 'Fikru Customer Service', email: 'customer.service.aawsa@aawsa.gov.et', departmentCode: 'CUSTOMER_SERVICE_AAWSA', org: aawsaOrg },
      // EEP DeptAdmins
      { fullName: 'Girma Power Outage', email: 'power.outage@eep.com.et', departmentCode: 'POWER_OUTAGE', org: eepOrg },
      { fullName: 'Hana Safety Emergency', email: 'safety.emergency@eep.com.et', departmentCode: 'SAFETY_EMERGENCY', org: eepOrg },
      { fullName: 'Ibrahim Transformer', email: 'transformer.issue@eep.com.et', departmentCode: 'TRANSFORMER_ISSUE', org: eepOrg },
      { fullName: 'Jemal Line Maintenance', email: 'line.maintenance@eep.com.et', departmentCode: 'LINE_MAINTENANCE', org: eepOrg },
      { fullName: 'Kebede Meter Service', email: 'meter.service.eep@eep.com.et', departmentCode: 'METER_SERVICE', org: eepOrg },
      { fullName: 'Lemlem Customer Service', email: 'customer.service.eep@eep.com.et', departmentCode: 'CUSTOMER_SERVICE_EEP', org: eepOrg },
    ];

    for (const adminData of deptAdminsData) {
      const department = createdDepts[adminData.departmentCode];
      if (!department) {
        console.error(`Department ${adminData.departmentCode} not found – skipping user ${adminData.email}`);
        continue;
      }

      const existingDeptAdmin = await User.findOne({
        department: department._id,
        role: 'DeptAdmin',
        isActive: true,
      });
      if (existingDeptAdmin && existingDeptAdmin.email !== adminData.email) {
        console.warn(`DeptAdmin for department ${department.code} already exists: ${existingDeptAdmin.email}. Skipping ${adminData.email}`);
        continue;
      }

      const user = await User.findOneAndUpdate(
        { email: adminData.email },
        {
          fullName: adminData.fullName,
          email: adminData.email,
          passwordHash,
          role: 'DeptAdmin',
          loginMethod: 'manual',
          isActive: true,
          organization: adminData.org._id,
          department: department._id,
        },
        { upsert: true, new: true }
      );
      console.log(`DeptAdmin seeded: ${user.email} (dept: ${department.code})`);

      await Department.findByIdAndUpdate(department._id, { head: user._id });
    }

    console.log('\n✅ Seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  await seedAll();
};

run();