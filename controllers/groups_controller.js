const mongoose = require('mongoose');
const OID = (v) => new mongoose.Types.ObjectId(v);
const Group = require('../models/groups_model');
const User  = require('../models/users_model');
const { postTweet } = require('../utils/tweet');

exports.createGroup = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ msg: 'Missing group name' });

    const uid = OID(req.session.userId);

    const g = await Group.create({
      name,
      description,
      owner: uid,
      members: [uid],
    });

    await User.findByIdAndUpdate(uid, { $addToSet: { groups: g._id } });

    try {
      const tweetText = `New group just opened: "${name}" — join the community on CityGallery!`;
      const result = await postTweet(tweetText);
      if (result?.id) {
        g.tweetId = result.id;
        g.tweetUrl = result.url;
        g.tweetedAt = new Date();
        await g.save();
        console.log('[group] tweeted ✔', result.url);
      } else {
        console.warn('[group] tweet skipped/failed: twitter disabled or not configured');
      }
    } catch (twErr) {
      console.warn('[group] tweet error:', twErr?.message || twErr);
    }

    res.status(201).json(g);
  } catch (err) { next(err); }
};

exports.listGroups = async (req, res, next) => {
  try {
    const { q, mine } = req.query;
    const textFilter = q ? { name: { $regex: q, $options: 'i' } } : {};
    let baseFilter = { ...textFilter };

    if (String(mine) === '1' || String(mine).toLowerCase() === 'true') {
      if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
      const uid = req.session.userId;
      baseFilter = { ...textFilter, $or: [{ owner: uid }, { members: uid }] };
    }

    const list = await Group.find(baseFilter)
      .populate('owner', 'username')
      .lean();

    res.json(list);
  } catch (err) { next(err); }
};

exports.listMyGroups = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const uid = req.session.userId;

    const list = await Group.find({ $or: [{ owner: uid }, { members: uid }] })
      .populate('owner', 'username')
      .lean();

    res.json(list);
  } catch (err) { next(err); }
};

exports.listJoinableGroups = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const uid = req.session.userId;

    const { q, limit } = req.query;
    const lim = Math.max(1, Math.min(parseInt(limit || '50', 10) || 50, 200));
    const textFilter = q ? { name: { $regex: q, $options: 'i' } } : {};

    const query = {
      ...textFilter,
      owner: { $ne: uid },
      members: { $nin: [uid] },
    };

    const list = await Group.find(query)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate('owner', 'username')
      .lean();

    res.json(list);
  } catch (err) { next(err); }
};

exports.joinGroup = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;

    const g = await Group.findByIdAndUpdate(
      OID(id),
      { $addToSet: { members: OID(req.session.userId) } },
      { new: true }
    );

    if (!g) return res.status(404).json({ msg: 'Group not found' });

    await User.findByIdAndUpdate(OID(req.session.userId), { $addToSet: { groups: OID(id) } });
    res.json(g);
  } catch (err) { next(err); }
};

exports.leaveGroup = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;

    const g = await Group.findByIdAndUpdate(
      OID(id),
      { $pull: { members: { $in: [String(req.session.userId), OID(req.session.userId)] } } },
      { new: true }
    );

    if (!g) return res.status(404).json({ msg: 'Group not found' });

    await User.findByIdAndUpdate(OID(req.session.userId), { $pull: { groups: { $in: [String(id), OID(id)] } } });
    res.json(g);
  } catch (err) { next(err); }
};

exports.updateGroup = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ msg: 'Group not found' });
    if (String(g.owner) !== String(req.session.userId)) {
      return res.status(403).json({ msg: 'Only owner can update' });
    }

    const { name, description } = req.body;
    if (name !== undefined) g.name = name;
    if (description !== undefined) g.description = description;
    await g.save();
    res.json(g);
  } catch (err) { next(err); }
};

exports.listGroupMembers = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const uid = req.session.userId;

    const g = await Group.findById(req.params.id)
      .populate('owner', 'username email')
      .populate('members', 'username email')
      .lean();

    if (!g) return res.status(404).json({ msg: 'Group not found' });

    const isOwner  = String(g.owner?._id || g.owner) === String(uid);
    const isMember = Array.isArray(g.members) && g.members.some(m => String(m._id || m) === String(uid));
    if (!isOwner && !isMember) return res.status(403).json({ msg: 'Forbidden' });

    const members = (g.members || []).map(m => ({
      _id: String(m._id || m),
      username: m.username || 'User',
      email: m.email || ''
    }));

    res.json({
      group: { _id: String(g._id), name: g.name, owner: String(g.owner?._id || g.owner) },
      members,
      canRemove: !!isOwner
    });
  } catch (err) { next(err); }
};


exports.removeMember = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });

    const uid = String(req.session.userId);
    const { id, userId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ msg: 'Invalid id' });
    }

    const g = await Group.findById(OID(id));
    if (!g) return res.status(404).json({ msg: 'Group not found' });

    const isOwner = String(g.owner) === uid;
    if (!isOwner) return res.status(403).json({ msg: 'Only owner can remove members' });
    if (String(g.owner) === String(userId)) {
      return res.status(400).json({ msg: 'Cannot remove the owner' });
    }

    const isActuallyMember = (g.members || []).some(m => String(m) === String(userId));
    if (!isActuallyMember) {
      return res.status(404).json({ msg: 'User is not a member of this group' });
    }

    const pullRes = await Group.updateOne(
      { _id: OID(id) },
      { $pull: { members: { $in: [String(userId), OID(userId)] } } }
    );

    if (!pullRes.modifiedCount) {
      return res.status(409).json({ msg: 'Failed to remove member' });
    }

    await User.updateOne(
      { _id: OID(userId) },
      { $pull: { groups: { $in: [String(id), OID(id)] } } }
    );

    const updated = await Group.findById(OID(id)).select('members').lean();
    return res.json({
      msg: 'Member removed',
      groupId: String(id),
      userId: String(userId),
      membersCount: Array.isArray(updated?.members) ? updated.members.length : undefined
    });
  } catch (err) { next(err); }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'Invalid id' });

    const g = await Group.findById(OID(id));
    if (!g) return res.status(404).json({ msg: 'Group not found' });

    if (String(g.owner) !== String(req.session.userId)) {
      return res.status(403).json({ msg: 'Only owner can delete' });
    }

    await User.updateMany(
      { groups: { $in: [String(g._id), g._id] } },
      { $pull: { groups: { $in: [String(g._id), g._id] } } }
    );

    await g.deleteOne();

    return res.json({ msg: 'Group deleted', id: String(id) });
  } catch (err) { next(err); }
};
