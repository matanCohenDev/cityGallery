const Group = require('../models/groups_model');
const User  = require('../models/users_model');

// POST /api/groups
exports.createGroup = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ msg: 'Missing group name' });
    const g = await Group.create({ name, description, owner: req.session.userId, members: [req.session.userId] });
    await User.findByIdAndUpdate(req.session.userId, { $addToSet: { groups: g._id } });
    res.status(201).json(g);
  } catch (err) { next(err); }
};

// GET /api/groups
exports.listGroups = async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const list = await Group.find(filter).populate('owner', 'username').lean();
    res.json(list);
  } catch (err) { next(err); }
};

// POST /api/groups/:id/join
exports.joinGroup = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;
    const g = await Group.findByIdAndUpdate(id, { $addToSet: { members: req.session.userId } }, { new: true });
    if (!g) return res.status(404).json({ msg: 'Group not found' });
    await User.findByIdAndUpdate(req.session.userId, { $addToSet: { groups: id } });
    res.json(g);
  } catch (err) { next(err); }
};

// POST /api/groups/:id/leave
exports.leaveGroup = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;
    const g = await Group.findByIdAndUpdate(id, { $pull: { members: req.session.userId } }, { new: true });
    if (!g) return res.status(404).json({ msg: 'Group not found' });
    await User.findByIdAndUpdate(req.session.userId, { $pull: { groups: id } });
    res.json(g);
  } catch (err) { next(err); }
};

// PATCH /api/groups/:id (owner only)
exports.updateGroup = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ msg: 'Group not found' });
    if (String(g.owner) !== String(req.session.userId)) return res.status(403).json({ msg: 'Only owner can update' });

    const { name, description } = req.body;
    if (name !== undefined) g.name = name;
    if (description !== undefined) g.description = description;
    await g.save();
    res.json(g);
  } catch (err) { next(err); }
};

// DELETE /api/groups/:id (owner only)
exports.deleteGroup = async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ msg: 'Group not found' });
    if (String(g.owner) !== String(req.session.userId)) return res.status(403).json({ msg: 'Only owner can delete' });
    await g.deleteOne();
    res.json({ msg: 'Group deleted', id: g._id });
  } catch (err) { next(err); }
};
