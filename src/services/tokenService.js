const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ms = require('ms');
const User = require('../models/User');

/**
 * Generate access token (short-lived)
 */
const generateAccessToken = (user, deviceId = null) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      type: 'access',
      deviceId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRE || '15m',
    }
  );
};

/**
 * Generate refresh token (long-lived)
 * Stores token in user document for session management
 */
const generateRefreshToken = async (
  user,
  deviceId,
  deviceName = 'Unknown'
) => {
  const refreshToken = crypto.randomBytes(64).toString('hex');

  // Supports formats like:
  // 30d, 7d, 12h, 15m
  const refreshExpiry =
    process.env.REFRESH_TOKEN_EXPIRE || '30d';

  const expiresAt = new Date(
    Date.now() + ms(refreshExpiry)
  );

  const tokenData = {
    token: refreshToken,
    deviceId,
    deviceName,
    expiresAt,
    createdAt: new Date(),
    isRevoked: false,
  };

  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(tokenData);

  // Keep only last 10 tokens per user
  if (user.refreshTokens.length > 10) {
    user.refreshTokens =
      user.refreshTokens.slice(-10);
  }

  await user.save();

  return refreshToken;
};

/**
 * Generate both tokens on login/register
 */
const generateAuthTokens = async (
  user,
  deviceId = null,
  deviceName = 'Unknown'
) => {
  const accessToken = generateAccessToken(
    user,
    deviceId
  );

  const refreshToken = await generateRefreshToken(
    user,
    deviceId,
    deviceName
  );

  return {
    accessToken,
    refreshToken,

    // Return access token expiry in seconds
    expiresIn:
      ms(process.env.ACCESS_TOKEN_EXPIRE || '15m') /
      1000,
  };
};

/**
 * Refresh access token using refresh token
 * Implements token rotation
 */
const refreshAccessToken = async (
  refreshToken,
  deviceId
) => {
  // Find user with this refresh token
  const user = await User.findOne({
    'refreshTokens.token': refreshToken,
    'refreshTokens.isRevoked': false,
    'refreshTokens.expiresAt': {
      $gt: new Date(),
    },
  });

  if (!user) {
    throw new Error(
      'Invalid or expired refresh token'
    );
  }

  // Find the specific token
  const tokenDoc = user.refreshTokens.find(
    (t) => t.token === refreshToken
  );

  // Check if token was invalidated by logout
  if (
    user.lastLogoutAt &&
    tokenDoc.createdAt < user.lastLogoutAt
  ) {
    throw new Error(
      'Token invalidated by logout'
    );
  }

  // Revoke old refresh token (rotation)
  tokenDoc.isRevoked = true;

  // Generate new tokens
  const newAccessToken = generateAccessToken(
    user,
    deviceId
  );

  const newRefreshToken =
    await generateRefreshToken(
      user,
      deviceId,
      tokenDoc.deviceName
    );

  await user.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,

    // Return expiry in seconds
    expiresIn:
      ms(process.env.ACCESS_TOKEN_EXPIRE || '15m') /
      1000,
  };
};

/**
 * Revoke a specific refresh token
 * (logout from current device)
 */
const revokeRefreshToken = async (
  userId,
  refreshToken
) => {
  const user = await User.findById(userId);

  if (user) {
    const tokenIndex =
      user.refreshTokens.findIndex(
        (t) => t.token === refreshToken
      );

    if (tokenIndex !== -1) {
      user.refreshTokens[
        tokenIndex
      ].isRevoked = true;

      await user.save();
    }
  }
};

/**
 * Revoke all tokens for a user
 * (logout from all devices)
 */
const revokeAllUserTokens = async (userId) => {
  const user = await User.findById(userId);

  if (user) {
    user.refreshTokens = [];
    user.lastLogoutAt = new Date();

    await user.save();
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateAuthTokens,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};