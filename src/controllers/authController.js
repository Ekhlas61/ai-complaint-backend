const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const { sendEmail, generateOTP } = require('../utils/email');

// 🔑 Generate Token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

// 📝 Register User - only citizens can self register 
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required' });
    }

    // Check existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Force role = Citizen
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: 'Citizen',
      loginMethod: 'manual',
    });

    const token = generateToken(user);

    return res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

// 🔐 Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    return res.json({
      message: 'Login successful',
      _id: user._id,
      role: user.role,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// Forgot Password - Request reset 
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

    // Generate token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Log the token for testing 
    console.log(`RESET TOKEN FOR ${email}: ${resetToken}`);

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; 

    await user.save();

    // Create reset URL (Dynamic: checks body first, then Origin header, then ENV fallback)
    const frontend = req.body.clientUrl || req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontend}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

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

      console.log('sendResult from sendEmail:', sendResult);

      // If sendEmail returned an error object, surface it for debugging
      if (sendResult && sendResult.error) {
        console.error('Email send failed:', sendResult);
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        await user.save();
        return res.status(500).json({ 
          message: 'Email could not be sent', 
          error: sendResult.error 
        });
      }

      // If using Ethereal or test account, include previewUrl to help local testing
      if (sendResult && sendResult.previewUrl) {
        return res.status(200).json({
          message: 'A reset link has been sent (preview available).',
          previewUrl: sendResult.previewUrl,
        });
      }

      // For real email services, return success message
      return res.status(200).json({ message: 'A reset link has been sent to your email.' });
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save();

      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Forgot Password with OTP - Send OTP to email
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

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiration (15 minutes)
    user.resetPasswordOTP = otp;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
    
    await user.save();

    console.log(`OTP FOR ${email}: ${otp}`);

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

      console.log('OTP send result:', sendResult);

      if (sendResult && sendResult.error) {
        console.error('OTP email send failed:', sendResult);
        user.resetPasswordOTP = null;
        user.resetPasswordExpire = null;
        await user.save();
        return res.status(500).json({ 
          message: 'OTP could not be sent', 
          error: sendResult.error 
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
      console.error('OTP email send error:', emailErr);
      user.resetPasswordOTP = null;
      user.resetPasswordExpire = null;
      await user.save();

      return res.status(500).json({ message: 'OTP could not be sent' });
    }
  } catch (error) {
    console.error('Forgot password OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset Password with OTP
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

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    // Clear OTP fields
    user.resetPasswordOTP = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({ message: 'Password reset successful. Please login.' });
  } catch (error) {
    console.error('Reset password with OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset Password - Set new password 
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({ message: 'Token, email, and password are required' });
    }

    // Hash the incoming token to compare
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    // Clear reset fields
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({ message: 'Password reset successful. Please login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user's profile
exports.getProfile = async (req, res) => {
  try {
    // req.user is already attached by protect middleware
    const user = await User.findById(req.user._id).select(
      '-passwordHash -resetPasswordToken -resetPasswordExpire -__v'
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

// Change password (unchanged)
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

    // Check old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);

    await user.save();

    return res.status(200).json({ message: 'Password changed successfully. Please log in again with the new password.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
// ...log out...
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.status(200).json({ message: 'Logged out successfully' });
};
// ...log out ...

