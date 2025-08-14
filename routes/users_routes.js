const express = require('express');
const router = express.Router();
const { createUser, loginUser, logout, currentUser, getUsers, updateUser, deleteUser } =
  require('../controllers/users_controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.post('/register', createUser);
router.post('/login',    loginUser);
router.post('/logout',   logout);

router.get('/me',        currentUser);
router.get('/',          requireAdmin, getUsers); 

router.patch('/:id',     requireAuth, updateUser);
router.delete('/:id',    requireAdmin, deleteUser);

module.exports = router;
