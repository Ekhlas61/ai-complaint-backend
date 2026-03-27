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

const seedAdmins = async () => {
  try {
    const defaultPassword = 'Admin@123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(defaultPassword, salt);

    // Create organizations
    const eepOrg = await Organization.findOneAndUpdate(
      { code: 'EEP' },
      { name: 'EEP', code: 'EEP', isActive: true },
      { upsert: true, returnDocument: 'after' }
    );
    const aawsaOrg = await Organization.findOneAndUpdate(
      { code: 'AAWSA' },
      { name: 'AAWSA', code: 'AAWSA', isActive: true },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('Organizations seeded:', {
      eep: { id: eepOrg._id, name: eepOrg.name },
      aawsa: { id: aawsaOrg._id, name: aawsaOrg.name },
    });

    // SysAdmin
    await User.findOneAndUpdate(
      { email: 'sysadmin@complaint.gov' },
      {
        fullName: 'System Administrator',
        email: 'sysadmin@complaint.gov',
        passwordHash,
        role: 'SysAdmin',
        loginMethod: 'manual',
        isActive: true,
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('SysAdmin seeded');

    // OrgAdmins
    const eepOrgAdmin = await User.findOneAndUpdate(
      { email: 'admin@eep.com.et' },
      {
        fullName: 'EEP Organization Admin',
        email: 'admin@eep.com.et',
        passwordHash,
        role: 'OrgAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: eepOrg._id,
      },
      { upsert: true, returnDocument: 'after' }
    );
    const aawsaOrgAdmin = await User.findOneAndUpdate(
      { email: 'admin@aawsa.gov.et' },
      {
        fullName: 'AAWSA Organization Admin',
        email: 'admin@aawsa.gov.et',
        passwordHash,
        role: 'OrgAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: aawsaOrg._id,
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log('OrgAdmins seeded:', {
      eep: { id: eepOrgAdmin._id, email: eepOrgAdmin.email, orgId: eepOrgAdmin.organization },
      aawsa: { id: aawsaOrgAdmin._id, email: aawsaOrgAdmin.email, orgId: aawsaOrgAdmin.organization },
    });

          // OrgAdmins
      await User.findOneAndUpdate(
        { email: 'admin@eep.com.et' },
        {
          fullName: 'EEP Organization Admin',
          email: 'admin@eep.com.et',
          passwordHash,
          role: 'OrgAdmin',
          loginMethod: 'manual',
          isActive: true,
          organization: eepOrg._id,
        },
        { upsert: true, returnDocument: 'after' }
      );
      await User.findOneAndUpdate(
        { email: 'admin@aawsa.gov.et' },
        {
          fullName: 'AAWSA Organization Admin',
          email: 'admin@aawsa.gov.et',
          passwordHash,
          role: 'OrgAdmin',
          loginMethod: 'manual',
          isActive: true,
          organization: aawsaOrg._id,
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log('OrgAdmins seeded');

      // Additional OrgAdmin for EEP
      await User.findOneAndUpdate(
        { email: 'eepadmin@gmail.com' },
        {
          fullName: 'EEP Organization Admin 2',
          email: 'eepadmin@gmail.com',
          passwordHash,
          role: 'OrgAdmin',
          loginMethod: 'manual',
          isActive: true,
          organization: eepOrg._id,
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log('Second EEP OrgAdmin seeded');

    // Departments
    const departmentsData = [
      {
        name: 'EEP - Customer Service',
        code: 'CS_EEP',
        organization: eepOrg._id,
        description: 'Handles billing, outages, meter issues, and general complaints.',
        isActive: true,
      },
      {
        name: 'AAWSA - Water Services',
        code: 'WATER_AAWSA',
        organization: aawsaOrg._id,
        description: 'Water supply interruptions, leaks, billing, new connections.',
        isActive: true,
      },
      {
        name: 'AAWSA - Sewerage & Sanitation',
        code: 'SEWER_AAWSA',
        organization: aawsaOrg._id,
        description: 'Drainage blockages, sewer backups, sanitation complaints.',
        isActive: true,
      },
    ];

    const departments = {};
    for (const deptData of departmentsData) {
      const department = await Department.findOneAndUpdate(
        { code: deptData.code },
        deptData,
        { upsert: true, returnDocument: 'after' }
      );
      departments[deptData.code] = department;
      console.log(`Department seeded: ${department.name} (ID: ${department._id}), org: ${department.organization}`);
    }

    // DeptAdmins
    const deptAdminsData = [
      {
        fullName: 'EEP Customer Service Manager',
        email: 'deptadmin.eep@eep.com.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: eepOrg._id,
        department: departments['CS_EEP']._id,
      },
      {
        fullName: 'AAWSA Water Services Manager',
        email: 'deptadmin.water@aawsa.gov.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: aawsaOrg._id,
        department: departments['WATER_AAWSA']._id,
      },
      {
        fullName: 'AAWSA Sewerage & Sanitation Manager',
        email: 'deptadmin.sewer@aawsa.gov.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: aawsaOrg._id,
        department: departments['SEWER_AAWSA']._id,
      },
    ];

    for (const deptAdmin of deptAdminsData) {
      const user = await User.findOneAndUpdate(
        { email: deptAdmin.email },
        deptAdmin,
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`DeptAdmin created: ${user.email} (ID: ${user._id})`);
      console.log(`  ↳ Organization: ${user.organization}`);
      console.log(`  ↳ Department: ${user.department}`);

      if (deptAdmin.department) {
        const updatedDept = await Department.findByIdAndUpdate(
          deptAdmin.department,
          { head: user._id },
          { new: true, returnDocument: 'after' }
        );
        console.log(`  ↳ Set head of department ${updatedDept.name} to ${user.fullName}`);
      } else {
        console.error(`  ✗ No department ID for ${user.email}`);
      }
    }

    console.log('Seeding completed.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  await seedAdmins();
};

run();