const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


// 🔑 Generate Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};


// 📝 Register User
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user (force role to "Citizen", ignore any provided role)
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'Citizen',
    });

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// 🔐 Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
