const Branch = require('../models/galleryBranches_model');

// POST /api/branches
exports.createBranch = async (req, res, next) => {
  try {
    const { name, address, coordinates } = req.body;
    if (!name || !address || !coordinates?.lat || !coordinates?.lng)
      return res.status(400).json({ msg: 'Missing fields' });
    const b = await Branch.create({ name, address, coordinates });
    res.status(201).json(b);
  } catch (err) { next(err); }
};

// GET /api/branches
exports.listBranches = async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = q ? { $or: [
      { name:    { $regex: q, $options: 'i' } },
      { address: { $regex: q, $options: 'i' } },
    ]} : {};
    const list = await Branch.find(filter).lean();
    res.json(list);
  } catch (err) { next(err); }
};

// GET /api/branches/:id
exports.getBranch = async (req, res, next) => {
  try {
    const b = await Branch.findById(req.params.id);
    if (!b) return res.status(404).json({ msg: 'Branch not found' });
    res.json(b);
  } catch (err) { next(err); }
};

// PATCH /api/branches/:id
exports.updateBranch = async (req, res, next) => {
  try {
    const { name, address, coordinates } = req.body;
    const b = await Branch.findByIdAndUpdate(req.params.id, { name, address, coordinates }, { new: true });
    if (!b) return res.status(404).json({ msg: 'Branch not found' });
    res.json(b);
  } catch (err) { next(err); }
};

// DELETE /api/branches/:id
exports.deleteBranch = async (req, res, next) => {
  try {
    const b = await Branch.findByIdAndDelete(req.params.id);
    if (!b) return res.status(404).json({ msg: 'Branch not found' });
    res.json({ msg: 'Branch deleted', id: b._id });
  } catch (err) { next(err); }
};
