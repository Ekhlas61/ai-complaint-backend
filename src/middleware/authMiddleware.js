const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// Protect routes – require valid JWT
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-passwordHash -__v');

      if (!req.user) {
        res.status(401);
        throw new Error('User not found – account may have been removed');
      }

      if (!req.user.isActive) {
        res.status(403);
        throw new Error('Account is deactivated');
      }

      next();
    } catch (error) {
      console.error('Token error:', error.message);
      res.status(401);
      throw new Error('Not authorized – invalid token');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized – no token provided');
  }
});

module.exports = protect;