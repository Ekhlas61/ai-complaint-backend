
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
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

const seedComplaints = async () => {
  try {
    // Search of citizen, if it doesn't exist create one
    let citizen = await User.findOne({ email: 'test.citizen@example.com' });
    if (!citizen) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Citizen@123', salt);
      citizen = await User.create({
        fullName: 'Test Citizen',
        email: 'test.citizen@example.com',
        passwordHash,
        role: 'Citizen',
        loginMethod: 'manual',
        isActive: true,
      });
      console.log('Created test citizen');
    }

    // Find departments
    const eepDept = await Department.findOne({ code: 'CS_EEP' });
    const waterDept = await Department.findOne({ code: 'WATER_AAWSA' });
    const sewerDept = await Department.findOne({ code: 'SEWER_AAWSA' });

    // Sample complaints data
    const complaints = [
      {
        title: 'Power outage in Bole',
        description: 'No electricity since yesterday evening',
        category: 'Electricity',
        location: { locationName: 'Bole, Addis Ababa' },
        submittedBy: citizen._id,
        department: eepDept._id,
        status: 'Submitted',
        priority: 'High',
      },
      {
        title: 'Water leak in front of my house',
        description: 'Water leaking from main pipe for two days',
        category: 'Water Supply',
        location: { locationName: 'Kazanchis, Addis Ababa' },
        submittedBy: citizen._id,
        department: waterDept._id,
        status: 'In Progress',
        priority: 'Medium',
      },
      {
        title: 'Sewer blockage',
        description: 'Sewage backing up into street',
        category: 'Sanitation',
        location: { locationName: 'Megenagna, Addis Ababa' },
        submittedBy: citizen._id,
        department: sewerDept._id,
        status: 'Resolved',
        priority: 'Critical',
      },
    ];

    for (const comp of complaints) {
      const existing = await Complaint.findOne({ title: comp.title });
      if (!existing) {
        const complaint = await Complaint.create(comp);
        console.log(`Complaint created: ${complaint.title}`);
      } else {
        console.log(`Complaint already exists: ${comp.title}`);
      }
    }

    console.log('Sample complaints seeded.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  await seedComplaints();
};

run();