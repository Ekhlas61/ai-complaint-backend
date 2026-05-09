const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

/**
 * Protect routes – require valid access token
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verify token type
      if (decoded.type !== 'access') {
        res.status(401);
        throw new Error('Invalid token type');
      }

      req.user = await User.findById(decoded.id).select('-passwordHash -__v -refreshTokens');

      if (!req.user) {
        res.status(401);
        throw new Error('User not found');
      }

      if (!req.user.isActive) {
        res.status(403);
        throw new Error('Account is deactivated');
      }

      req.deviceId = decoded.deviceId;
      next();
    } catch (error) {
      console.error('Token error:', error.message);

      if (error.name === 'TokenExpiredError') {
        res.status(401);
        throw new Error('Access token expired');
      }

      res.status(401);
      throw new Error('Not authorized – invalid token');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized – no token provided');
  }
});

module.exports = { protect };