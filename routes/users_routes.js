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

// ===== Auth =====
router.post('/register', createUser);
router.post('/login',    loginUser);
router.post('/logout',   logout);

// ===== Me =====
router.get('/me',        currentUser);

// פרופיל עצמי — תואם לנסיונות שהפרונט שלך מבצע
router.patch('/me',          requireAuth, updateMe);
router.patch('/profile',     requireAuth, updateProfileAlias); // alias
router.put('/update',        requireAuth, updateProfileAlias); // alias

// שינוי סיסמה — תואם לכל הראוטים שהפרונט מנסה
router.post('/change-password',    requireAuth, changePassword);
router.patch('/me/password',       requireAuth, changePasswordPatch);
router.put('/password',            requireAuth, changePasswordPatch);

// ===== Admin / collection =====
router.get('/',                requireAdmin, getUsers);
router.patch('/:id',           requireAuth,  updateUser);   // ודא שבמידלוור אתה בודק הרשאות (עצמי/אדמין)
router.delete('/:id',          requireAdmin, deleteUser);

module.exports = router;
