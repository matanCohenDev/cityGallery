const Post = require('../models/posts_model');

// POST /api/posts
exports.createPost = async (req, res, next) => {
  try {
    const { title, content, images, group, location } = req.body;
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const post = await Post.create({
      title, content, images: images || [],
      author: req.session.userId,
      group: group || null,
      location: location || {}
    });
    res.status(201).json(post);
  } catch (err) { next(err); }
};

// GET /api/posts
// תמיכה בפרמטרים לחיפוש (דוגמה לשלישיית פרמטרים: text + group + date range)
exports.listPosts = async (req, res, next) => {
  try {
    const { q, group, from, to } = req.query;
    const filter = {};
    if (q) filter.$or = [
      { title:   { $regex: q, $options: 'i' } },
      { content: { $regex: q, $options: 'i' } },
    ];
    if (group) filter.group = group;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    const posts = await Post.find(filter).populate('author', 'username').populate('group', 'name').lean();
    res.json(posts);
  } catch (err) { next(err); }
};

// GET /api/posts/:id
exports.getPost = async (req, res, next) => {
  try {
    const p = await Post.findById(req.params.id).populate('author', 'username').populate('group', 'name');
    if (!p) return res.status(404).json({ msg: 'Post not found' });
    res.json(p);
  } catch (err) { next(err); }
};

// PATCH /api/posts/:id
exports.updatePost = async (req, res, next) => {
  try {
    const p = await Post.findById(req.params.id);
    if (!p) return res.status(404).json({ msg: 'Post not found' });
    if (!req.session.userId || String(p.author) !== String(req.session.userId))
      return res.status(403).json({ msg: 'Only author can update' });

    const { title, content, images, location, group } = req.body;
    if (title !== undefined) p.title = title;
    if (content !== undefined) p.content = content;
    if (images !== undefined) p.images = images;
    if (location !== undefined) p.location = location;
    if (group !== undefined) p.group = group;
    await p.save();
    res.json(p);
  } catch (err) { next(err); }
};

// DELETE /api/posts/:id
exports.deletePost = async (req, res, next) => {
  try {
    const p = await Post.findById(req.params.id);
    if (!p) return res.status(404).json({ msg: 'Post not found' });
    if (!req.session.userId || String(p.author) !== String(req.session.userId))
      return res.status(403).json({ msg: 'Only author can delete' });

    await p.deleteOne();
    res.json({ msg: 'Post deleted', id: p._id });
  } catch (err) { next(err); }
};
