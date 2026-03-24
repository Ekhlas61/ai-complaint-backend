const express = require('express');
const router = express.Router();

const protect = require('../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getProfile,
  changePassword,
} = require('../controllers/authController');


router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);


router.get('/profile', protect, getProfile);
router.post('/change-password', protect, changePassword);

module.exports = router;