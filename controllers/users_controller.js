const bcrypt = require('bcryptjs');
const User = require('../models/users_model');

const sanitizeUser = (u) => ({
  _id: u._id,
  username: u.username,
  email: u.email,
  role: u.role,
  groups: u.groups,
  bio: u.bio || '',        // אופציונלי — נוח לפרונט שלך
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

// Helper: attach sanitized user to session after changes
function refreshSession(req, userDoc) {
  if (!req?.session) return;
  req.session.userId = userDoc._id;
  req.session.user = sanitizeUser(userDoc);
}

// Helper: uniform duplicate key error (E11000)
function handleMongoDup(res, err) {
  if (err && err.code === 11000) {
    const key = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ msg: `${key} already in use` });
  }
  return null;
}

// ================== Auth flows ==================

// POST /api/users/register
exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ msg: 'Missing fields' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashed,
      role: role || 'user',
    });
    refreshSession(req, user);
    return res.status(201).json(sanitizeUser(user));
  } catch (err) {
    if (!handleMongoDup(res, err)) next(err);
  }
};

// POST /api/users/login
exports.loginUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const u = await User.findOne({ username });
    if (!u) return res.status(400).json({ msg: 'User not found' });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(400).json({ msg: 'Invalid credentials' });

    refreshSession(req, u);
    return res.json({ msg: 'Login successful', user: sanitizeUser(u) });
  } catch (err) { next(err); }
};

// POST /api/users/logout
exports.logout = (req, res) => {
  req.session?.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ msg: 'Logged out' });
  });
};

// GET /api/users/me
exports.currentUser = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'No user logged in' });
    const u = await User.findById(req.session.userId).populate('groups', 'name');
    if (!u) return res.status(404).json({ msg: 'User not found' });
    return res.json(sanitizeUser(u));
  } catch (err) { next(err); }
};

// ================== Admin/user list & CRUD (admin) ==================

// GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const list = await User.find().select('-password').lean();
    res.json(list);
  } catch (err) { next(err); }
};

// PATCH /api/users/:id  (admin/self — תלוי במידלוור)
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const data = {};
    if (req.body.username != null) data.username = String(req.body.username).trim();
    if (req.body.email != null)    data.email    = String(req.body.email).trim().toLowerCase();
    if (req.body.role != null)     data.role     = req.body.role; // ודא שמידלוור מגן על זה
    if (req.body.password)         data.password = await bcrypt.hash(req.body.password, 10);

    const u = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!u) return res.status(404).json({ msg: 'User not found' });

    // אם העדכון הוא על המשתמש המחובר — רענון סשן
    if (String(req.session?.userId) === String(u._id)) {
      refreshSession(req, u);
    }

    res.json(sanitizeUser(u));
  } catch (err) {
    if (!handleMongoDup(res, err)) next(err);
  }
};

// DELETE /api/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const u = await User.findByIdAndDelete(id);
    if (!u) return res.status(404).json({ msg: 'User not found' });
    res.json({ msg: 'User deleted', id: u._id });
  } catch (err) { next(err); }
};

// ================== Self profile update (matches frontend) ==================

// PATCH /api/users/me  (and aliases) — update username/email for current user
exports.updateMe = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'No user logged in' });

    const updates = {};
    if (req.body.username != null) updates.username = String(req.body.username).trim();
    if (req.body.email != null)    updates.email    = String(req.body.email).trim().toLowerCase();

    if (!Object.keys(updates).length) {
      return res.status(400).json({ msg: 'No fields to update' });
    }

    const u = await User.findByIdAndUpdate(
      req.session.userId,
      updates,
      { new: true, runValidators: true }
    );
    if (!u) return res.status(404).json({ msg: 'User not found' });

    refreshSession(req, u); // חשוב שהפרונט יראה ערכים מעודכנים
    res.json(sanitizeUser(u));
  } catch (err) {
    if (!handleMongoDup(res, err)) next(err);
  }
};

// ================== Password change for current user ==================

// POST /api/users/change-password
// Body: { currentPassword, newPassword }
exports.changePassword = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'No user logged in' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 chars' });
    }

    const u = await User.findById(req.session.userId);
    if (!u) return res.status(404).json({ msg: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, u.password);
    if (!ok) return res.status(400).json({ msg: 'Current password is incorrect' });

    u.password = await bcrypt.hash(newPassword, 10);
    await u.save();

    refreshSession(req, u);
    res.json({ msg: 'Password updated' });
  } catch (err) { next(err); }
};

// Alias controller to support PATCH /api/users/me/password and PUT /api/users/password
exports.changePasswordPatch = exports.changePassword;
exports.updateProfileAlias = exports.updateMe; // for /profile and /update
