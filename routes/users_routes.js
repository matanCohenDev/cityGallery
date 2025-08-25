const express = require('express');
const router = express.Router();
const {
  createUser,
  loginUser,
  logout,
  currentUser,
  getUsers,
  updateUser,
  deleteUser,
  updateMe,
  updateProfileAlias,
  changePassword,
  changePasswordPatch,
} = require('../controllers/users_controller');

const { requireAuth, requireAdmin } = require('../middleware/auth');

router.post('/register', createUser);
router.post('/login',    loginUser);
router.post('/logout',   logout);

router.get('/me',        currentUser);

router.patch('/me',          requireAuth, updateMe);
router.patch('/profile',     requireAuth, updateProfileAlias);
router.put('/update',        requireAuth, updateProfileAlias); 

router.post('/change-password',    requireAuth, changePassword);
router.patch('/me/password',       requireAuth, changePasswordPatch);
router.put('/password',            requireAuth, changePasswordPatch);

router.get('/',                requireAdmin, getUsers);
router.patch('/:id',           requireAuth,  updateUser);   
router.delete('/:id',          requireAdmin, deleteUser);

module.exports = router;
