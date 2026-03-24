// seeds/adminSeeder.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Department = require('../models/Department');
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

    // ===== 1. SysAdmin =====
    const sysAdmin = {
      fullName: 'System Administrator',
      email: 'sysadmin@complaint.gov',
      passwordHash,
      role: 'SysAdmin',
      loginMethod: 'manual',
      isActive: true,
      // no organization, no department
    };

    // ===== 2. OrgAdmins =====
    const eepOrgAdmin = {
      fullName: 'EEP Organization Admin',
      email: 'admin@eep.com.et',
      passwordHash,
      role: 'OrgAdmin',
      loginMethod: 'manual',
      isActive: true,
      organization: 'EEP',
    };

    const aawsaOrgAdmin = {
      fullName: 'AAWSA Organization Admin',
      email: 'admin@aawsa.gov.et',
      passwordHash,
      role: 'OrgAdmin',
      loginMethod: 'manual',
      isActive: true,
      organization: 'AAWSA',
    };

    // ===== 3. Departments (complaint-handling only) =====
    const departmentsData = [
      {
        name: 'EEP - Customer Service',
        code: 'CS_EEP',
        description: 'Handles billing, outages, meter issues, and general complaints.',
        isActive: true,
        // head will be set later
      },
      {
        name: 'AAWSA - Water Services',
        code: 'WATER_AAWSA',
        description: 'Water supply interruptions, leaks, billing, new connections.',
        isActive: true,
      },
      {
        name: 'AAWSA - Sewerage & Sanitation',
        code: 'SEWER_AAWSA',
        description: 'Drainage blockages, sewer backups, sanitation complaints.',
        isActive: true,
      },
    ];

    // Create/update departments and store references
    const departments = {};
    for (const deptData of departmentsData) {
      let department = await Department.findOne({ code: deptData.code });
      if (!department) {
        department = await Department.create(deptData);
        console.log(`✅ Department created: ${department.name} (${department.code})`);
      } else {
        console.log(`⚠️ Department already exists: ${department.name}`);
      }
      departments[deptData.code] = department;
    }

    // ===== 4. DeptAdmins =====
    const deptAdminsData = [
      {
        fullName: 'EEP Customer Service Manager',
        email: 'deptadmin.eep@eep.com.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: 'EEP',
        department: departments['CS_EEP']._id, // link to department
      },
      {
        fullName: 'AAWSA Water Services Manager',
        email: 'deptadmin.water@aawsa.gov.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: 'AAWSA',
        department: departments['WATER_AAWSA']._id,
      },
      {
        fullName: 'AAWSA Sewerage & Sanitation Manager',
        email: 'deptadmin.sewer@aawsa.gov.et',
        passwordHash,
        role: 'DeptAdmin',
        loginMethod: 'manual',
        isActive: true,
        organization: 'AAWSA',
        department: departments['SEWER_AAWSA']._id,
      },
    ];

    // ===== 5. Insert all users =====
    const allUsers = [sysAdmin, eepOrgAdmin, aawsaOrgAdmin, ...deptAdminsData];

    for (const user of allUsers) {
      const existing = await User.findOne({ email: user.email });
      if (!existing) {
        const newUser = await User.create(user);
        console.log(`✅ User created: ${user.email} (${user.role})`);

        // If this user is a DeptAdmin, update the department's head field
        if (user.role === 'DeptAdmin' && user.department) {
          await Department.findByIdAndUpdate(user.department, { head: newUser._id });
          console.log(`   ↳ Linked as head of department: ${user.department}`);
        }
      } else {
        console.log(`⚠️ User already exists: ${user.email}`);
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