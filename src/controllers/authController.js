const bcrypt = require('bcryptjs');
const User = require('../models/User');
const crypto = require('crypto');
const { sendEmail, generateOTP } = require('../utils/email');
const AuditLog = require('../models/AuditLog');
const tokenService = require('../services/tokenService');

// Helper function for audit logging (only for SysAdmin and OrgAdmin)
const createAdminAuditLog = async (
  req,
  action,
  targetType,
  targetId,
  description,
  status = 'SUCCESS',
  errorMessage = null
) => {
  const adminRoles = ['SysAdmin', 'OrgAdmin'];
  const userRole = req.user?.role;

  if (!userRole || !adminRoles.includes(userRole)) {
    return;
  }

  const ipAddress =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    'unknown';

  try {
    await AuditLog.create({
      user: req.user._id,
      action,
      description,
      targetType,
      targetId,
      orgId: req.user?.organization || null,
      status,
      errorMessage,
      ip: ipAddress,
      adminRole: req.user.role,
    });
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
};

// ========== AUTH CONTROLLERS ==========

/**
 * Register User - only citizens can self register
 */
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'Citizen',
      loginMethod: 'manual',
    });

    // Get device info
    const deviceId = req.headers['x-device-id'] || crypto.randomBytes(16).toString('hex');
    const deviceName = req.headers['x-device-name'] || 'Web Registration';

    // Generate tokens
    const tokens = await tokenService.generateAuthTokens(user, deviceId, deviceName);

    return res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

/**
 * Login User
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) {
      // Log failed login attempt for admin roles
      const adminRoles = ['SysAdmin', 'OrgAdmin'];
      const userCheck = await User.findOne({ email });
      if (userCheck && adminRoles.includes(userCheck.role)) {
        await createAdminAuditLog(
          { ip: req.ip, user: null },
          'LOGIN',
          'User',
          userCheck._id,
          `Failed login attempt for ${userCheck.role}: ${email}`,
          'FAILURE',
          'Invalid email or password'
        );
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    // Audit log for admin roles
    const adminRoles = ['SysAdmin', 'OrgAdmin'];
    if (adminRoles.includes(user.role)) {
      await createAdminAuditLog(
        { ...req, user },
        'LOGIN',
        'User',
        user._id,
        `${user.role} logged in successfully`,
        'SUCCESS'
      );
    }

    // Get device info
    const deviceId = req.headers['x-device-id'] || crypto.randomBytes(16).toString('hex');
    const deviceName = req.headers['x-device-name'] || 'Unknown Device';

    // Generate tokens
    const tokens = await tokenService.generateAuthTokens(user, deviceId, deviceName);

    return res.json({
      message: 'Login successful',
      _id: user._id,
      role: user.role,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * Refresh Access Token - Get new access token using refresh token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required' });
    }

    const deviceId = req.headers['x-device-id'] || crypto.randomBytes(16).toString('hex');

    const tokens = await tokenService.refreshAccessToken(refreshToken, deviceId);

    return res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    console.error('Refresh token error:', error);

    if (error.message === 'Invalid or expired refresh token') {
      return res.status(401).json({
        message: 'Session expired. Please login again.',
        code: 'SESSION_EXPIRED',
      });
    }

    if (error.message === 'Token invalidated by logout') {
      return res.status(401).json({
        message: 'Session invalidated. Please login again.',
        code: 'SESSION_INVALIDATED',
      });
    }

    return res.status(401).json({
      message: error.message || 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }
};

/**
 * Logout - Revoke refresh token and clear session
 */
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;

    if (refreshToken) {
      await tokenService.revokeRefreshToken(req.user._id, refreshToken);
    }

    // Audit log for admin logout
    const adminRoles = ['SysAdmin', 'OrgAdmin'];
    if (req.user && adminRoles.includes(req.user.role)) {
      await createAdminAuditLog(
        req,
        'LOGOUT',
        'User',
        req.user._id,
        `${req.user.role} logged out`,
        'SUCCESS'
      );
    }

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
};

/**
 * Forgot Password - Request reset (NO AUDIT NEEDED)
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: 'No account found with that email address.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

    await user.save();

    const frontend =
      req.body.clientUrl || req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontend}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      email
    )}`;

    const html = `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset. Click the link below:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

    try {
      const sendResult = await sendEmail({
        to: user.email,
        subject: 'Complaint System - Reset Your Password',
        html,
      });

      if (sendResult && sendResult.error) {
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        await user.save();
        console.error('Forgot password email error:', sendResult.error);
        return res.status(500).json({ 
          message: 'Email could not be sent', 
          error: sendResult.error,
          code: sendResult.code || 'EMAIL_SEND_FAILED'
        });
      }

      if (sendResult && sendResult.previewUrl) {
        return res.status(200).json({
          message: 'A reset link has been sent (preview available).',
          previewUrl: sendResult.previewUrl,
        });
      }

      return res.status(200).json({ message: 'A reset link has been sent to your email.' });
    } catch (emailErr) {
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save();
      console.error('Forgot password email exception:', emailErr);
      return res.status(500).json({ 
        message: 'Email could not be sent',
        error: emailErr.message,
        code: 'EMAIL_EXCEPTION'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Forgot Password with OTP - Send OTP to email
 */
exports.forgotPasswordOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        message: 'No account found with that email address.',
      });
    }

    const otp = generateOTP();

    user.resetPasswordOTP = otp;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    await user.save();

    const html = `
      <h2>Password Reset OTP</h2>
      <p>You requested a password reset for your Complaint System account.</p>
      <p>Your OTP code is: <strong style="font-size: 24px; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">${otp}</strong></p>
      <p>This OTP will expire in 15 minutes.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

    try {
      const sendResult = await sendEmail({
        to: user.email,
        subject: 'Complaint System - Password Reset OTP',
        html,
      });

      if (sendResult && sendResult.error) {
        user.resetPasswordOTP = null;
        user.resetPasswordExpire = null;
        await user.save();
        console.error('Forgot password OTP email error:', sendResult.error);
        return res.status(500).json({ 
          message: 'OTP could not be sent', 
          error: sendResult.error,
          code: sendResult.code || 'EMAIL_SEND_FAILED'
        });
      }

      if (sendResult && sendResult.previewUrl) {
        return res.status(200).json({
          message: 'OTP has been sent (preview available).',
          previewUrl: sendResult.previewUrl,
        });
      }

      return res.status(200).json({ message: 'OTP has been sent to your email.' });
    } catch (emailErr) {
      user.resetPasswordOTP = null;
      user.resetPasswordExpire = null;
      await user.save();
      console.error('Forgot password OTP email exception:', emailErr);
      return res.status(500).json({ 
        message: 'OTP could not be sent',
        error: emailErr.message,
        code: 'EMAIL_EXCEPTION'
      });
    }
  } catch (error) {
    console.error('Forgot password OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Reset Password with OTP
 */
exports.resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordOTP: otp,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    user.resetPasswordOTP = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({ message: 'Password reset successful. Please login.' });
  } catch (error) {
    console.error('Reset password with OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Reset Password - Set new password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({ message: 'Token, email, and password are required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({ message: 'Password reset successful. Please login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get current user's profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      '-passwordHash -resetPasswordToken -resetPasswordExpire -__v -refreshTokens'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      userId: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin || null,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update Citizen Profile - Only for citizens to update their full name
 */
exports.updateCitizenProfile = async (req, res) => {
  try {
    // Check if user is a citizen
    if (req.user.role !== 'Citizen') {
      return res.status(403).json({ 
        message: 'Access denied. Only citizens can update their profile.' 
      });
    }

    const { fullName } = req.body;

    if (!fullName || fullName.trim() === '') {
      return res.status(400).json({ 
        message: 'Full name is required and cannot be empty' 
      });
    }

    // Update the user's full name 
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { fullName: fullName.trim() },
      { new: true, runValidators: true }
    ).select('-passwordHash -resetPasswordToken -resetPasswordExpire -__v -refreshTokens');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        userId: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        lastLogin: updatedUser.lastLogin,
        isActive: updatedUser.isActive,
      }
    });
  } catch (error) {
    console.error('Update citizen profile error:', error);
    return res.status(500).json({ message: 'Server error while updating profile' });
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old password and new password are required' });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);

    await user.save();

    return res.status(200).json({
      message: 'Password changed successfully. Please log in again with the new password.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};