const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  refreshToken,
  forgotPassword,
  resetPassword,
  forgotPasswordOTP,
  resetPasswordWithOTP,
  getProfile,
  updateCitizenProfile,
  changePassword,
  logout
} = require('../controllers/authController');

// ========== PUBLIC ROUTES (No authentication required) ==========
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshToken);  // ← NEW: Refresh access token endpoint
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/forgot-password-otp', forgotPasswordOTP);
router.post('/reset-password-otp', resetPasswordWithOTP);

// ========== PROTECTED ROUTES (Authentication required) ==========
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateCitizenProfile);
router.post('/change-password', protect, changePassword);
router.post('/logout', protect, logout);

module.exports = router;