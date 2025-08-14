const bcrypt = require('bcryptjs');
const User = require('../models/users_model');

const sanitizeUser = (u) => ({
  _id: u._id,
  username: u.username,
  email: u.email,
  role: u.role,
  groups: u.groups,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

// POST /api/users/register
exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) return res.status(400).json({ msg: 'Missing fields' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed, role: role || 'user' });
    return res.status(201).json(sanitizeUser(user));
  } catch (err) { next(err); }
};

// POST /api/users/login
exports.loginUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const u = await User.findOne({ username });
    if (!u) return res.status(400).json({ msg: 'User not found' });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(400).json({ msg: 'Invalid credentials' });

    req.session.userId = u._id;
    req.session.user = sanitizeUser(u);
    return res.json({ msg: 'Login successful', user: sanitizeUser(u) });
  } catch (err) { next(err); }
};

// POST /api/users/logout
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ msg: 'Logged out' });
  });
};

// GET /api/users/me
exports.currentUser = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'No user logged in' });
    const u = await User.findById(req.session.userId).populate('groups', 'name');
    if (!u) return res.status(404).json({ msg: 'User not found' });
    return res.json(sanitizeUser(u));
  } catch (err) { next(err); }
};

// GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const list = await User.find().select('-password').lean();
    res.json(list);
  } catch (err) { next(err); }
};

// PATCH /api/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = { username: req.body.username, email: req.body.email, role: req.body.role };
    if (req.body.password) data.password = await bcrypt.hash(req.body.password, 10);
    const u = await User.findByIdAndUpdate(id, data, { new: true }).select('-password');
    if (!u) return res.status(404).json({ msg: 'User not found' });
    res.json(u);
  } catch (err) { next(err); }
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
