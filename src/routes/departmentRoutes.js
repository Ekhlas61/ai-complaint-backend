const express = require('express');
const router = express.Router();

const {
  createDepartment,
  getDepartments,
  updateDepartment,
  deactivateDepartment,
  
} = require('../controllers/departmentController');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');


router.post(
  '/',
  protect,
  authorizeRoles('OrgAdmin'),
  createDepartment
);

router.get(
  '/',
  protect,
  authorizeRoles('OrgAdmin'),
  getDepartments
);
router.put(
  '/:id',
  protect,
  authorizeRoles('OrgAdmin'),
  updateDepartment
);

router.put(
  '/:id/deactivate',
  protect,
  authorizeRoles('OrgAdmin'),
  deactivateDepartment
);


module.exports = router;