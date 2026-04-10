require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const User = require('./src/models/User');
const Organization = require('./src/models/Organization');
const Department = require('./src/models/Department');

// Seed data
const seedData = {
  organizations: [
    {
      name: 'EEP - Ethiopian Electric Power',
      code: 'EEP',
      description: 'Ethiopian Electric Power - National electricity utility company',
      address: 'Addis Ababa, Ethiopia',
      isActive: true
    },
    {
      name: 'AAWSA - Addis Ababa Water and Sewerage Authority',
      code: 'AAWSA',
      description: 'Addis Ababa Water and Sewerage Authority - Water and sanitation services',
      address: 'Addis Ababa, Ethiopia',
      isActive: true
    }
  ],
  
  departments: [
    {
      name: 'Customer Service',
      description: 'Handles customer complaints and service requests',
      isActive: true
    },
    {
      name: 'Water Services',
      description: 'Water supply and distribution services',
      isActive: true
    },
    {
      name: 'Sewerage & Sanitation',
      description: 'Sewerage systems and sanitation services',
      isActive: true
    }
  ],

  users: [
    {
      fullName: 'System Administrator',
      email: 'sysadmin@complaint.gov',
      password: 'Admin@123',
      role: 'SysAdmin',
      isActive: true
    },
    {
      fullName: 'EEP Org Admin',
      email: 'admin@eep.com.et',
      password: 'Admin@123',
      role: 'OrgAdmin',
      isActive: true
    },
    {
      fullName: 'AAWSA Org Admin',
      email: 'admin@aawsa.gov.et',
      password: 'Admin@123',
      role: 'OrgAdmin',
      isActive: true
    },
    {
      fullName: 'EEP Customer Service Admin',
      email: 'deptadmin.eep@eep.com.et',
      password: 'Admin@123',
      role: 'DeptAdmin',
      isActive: true
    },
    {
      fullName: 'AAWSA Water Services Admin',
      email: 'deptadmin.water@aawsa.gov.et',
      password: 'Admin@123',
      role: 'DeptAdmin',
      isActive: true
    },
    {
      fullName: 'AAWSA Sewerage Admin',
      email: 'deptadmin.sewer@aawsa.gov.et',
      password: 'Admin@123',
      role: 'DeptAdmin',
      isActive: true
    }
  ]
};

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Organization.deleteMany({});
    await Department.deleteMany({});
    console.log('✅ Cleared existing data');

    // Seed organizations
    console.log('🏢 Seeding organizations...');
    const createdOrgs = await Organization.insertMany(seedData.organizations);
    console.log(`✅ Created ${createdOrgs.length} organizations`);

    // Seed departments
    console.log('🏛️ Seeding departments...');
    const departmentsWithOrg = [
      {
        ...seedData.departments[0], // Customer Service
        code: 'CUSTOMER_SERVICE',
        organization: createdOrgs[0]._id // EEP
      },
      {
        ...seedData.departments[1], // Water Services
        code: 'WATER_SERVICES',
        organization: createdOrgs[1]._id // AAWSA
      },
      {
        ...seedData.departments[2], // Sewerage & Sanitation
        code: 'SEWERAGE_SANITATION',
        organization: createdOrgs[1]._id // AAWSA
      }
    ];
    const createdDepts = await Department.insertMany(departmentsWithOrg);
    console.log(`✅ Created ${createdDepts.length} departments`);

    // Seed users
    console.log('👥 Seeding users...');
    const usersToCreate = [];
    
    // Hash passwords and prepare users
    for (const userData of seedData.users) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = {
        ...userData,
        passwordHash: hashedPassword
      };
      
      // Add organization reference for OrgAdmins
      if (userData.role === 'OrgAdmin') {
        if (userData.email === 'admin@eep.com.et') {
          user.organization = createdOrgs[0]._id; // EEP
        } else if (userData.email === 'admin@aawsa.gov.et') {
          user.organization = createdOrgs[1]._id; // AAWSA
        }
      }
      
      // Add department references for DeptAdmins
      if (userData.role === 'DeptAdmin') {
        if (userData.email === 'deptadmin.eep@eep.com.et') {
          user.organization = createdOrgs[0]._id; // EEP
          user.department = createdDepts[0]._id; // Customer Service
        } else if (userData.email === 'deptadmin.water@aawsa.gov.et') {
          user.organization = createdOrgs[1]._id; // AAWSA
          user.department = createdDepts[1]._id; // Water Services
        } else if (userData.email === 'deptadmin.sewer@aawsa.gov.et') {
          user.organization = createdOrgs[1]._id; // AAWSA
          user.department = createdDepts[2]._id; // Sewerage & Sanitation
        }
      }
      
      usersToCreate.push(user);
    }
    
    const createdUsers = await User.insertMany(usersToCreate);
    console.log(`✅ Created ${createdUsers.length} users`);

    // Display created credentials
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('────────────────────────────────────');
    
    createdUsers.forEach(user => {
      const originalUser = seedData.users.find(u => u.email === user.email);
      console.log(`${user.role}:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Password: ${originalUser.password}`);
      console.log(`  Name: ${user.fullName}`);
      console.log('');
    });

    console.log('🏢 Organization:');
    console.log(`  Name: ${createdOrgs[0].name}`);
    console.log(`  ID: ${createdOrgs[0]._id}`);
    console.log('');
    
    console.log('🏛️ Departments:');
    createdDepts.forEach((dept, index) => {
      console.log(`  ${index + 1}. ${dept.name} (ID: ${dept._id})`);
    });

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the seeding
seedDatabase();
