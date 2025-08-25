// server/controllers/posts_controller.js
const mongoose = require('mongoose');
const Post = require('../models/posts_model');
const { Types } = mongoose;

// ===== helpers =====
function parsePageLimit(req, defLimit = 24, maxLimit = 100) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  let limit = parseInt(req.query.limit || String(defLimit), 10);
  if (Number.isNaN(limit) || limit < 1) limit = defLimit;
  limit = Math.min(limit, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildMatch(req) {
  const { q, group, from, to, mine } = req.query;
  const match = {};

  if (q) {
    match.$or = [
      { title:   { $regex: q, $options: 'i' } },
      { content: { $regex: q, $options: 'i' } },
    ];
  }
  if (group) match.group = group;

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
  }

  if (mine === 'true') {
    if (!req.session?.userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    match.author = req.session.userId;
  }

  return match;
}

function pickPreviewFields(p) {
  return {
    _id: p._id,
    title: p.title,
    content: p.content,
    images: p.images,
    author: p.author && typeof p.author === 'object' ? { _id: p.author._id, username: p.author.username } : p.author,
    group: p.group && typeof p.group === 'object' ? { _id: p.group._id, name: p.group.name } : p.group,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function decorateCounts(doc, userId) {
  const d = doc.toObject ? doc.toObject() : doc;
  d.likesCount = Array.isArray(d.likes) ? d.likes.length : 0;
  d.commentsCount = Array.isArray(d.comments) ? d.comments.length : 0;
  d.userLiked = !!(userId && d.likes?.some(id => String(id) === String(userId)));
  return d;
}

// ===== CRUD =====
exports.createPost = async (req, res, next) => {
  try {
    const { title, content, images, group, location } = req.body;
    if (!req.session.userId) return res.status(401).json({ msg: 'Unauthorized' });
    if (!title || !content)  return res.status(400).json({ msg: 'Missing title/content' });

    const post = await Post.create({
      title, content,
      images: Array.isArray(images) ? images : [],
      author: req.session.userId,
      group: group || null,
      location: location || {},
    });

    await post.populate([{ path: 'author', select: 'username' }, { path: 'group', select: 'name' }]);
    res.status(201).json(post);
  } catch (err) { next(err); }
};

// GET /api/posts (supports groupBy=day|author|group)
exports.listPosts = async (req, res, next) => {
  try {
    const { groupBy, sort = 'latest' } = req.query;
    const { page, limit, skip } = parsePageLimit(req, 24, 100);
    const match = buildMatch(req);
    const userId = req.session?.userId ? String(req.session.userId) : null;

    if (!groupBy) {
      const [items, total] = await Promise.all([
        Post.find(match)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('+author title content images createdAt updatedAt likes comments')
          .populate('author', 'username')
          .populate('group', 'name')
          .lean(),
        Post.countDocuments(match),
      ]);

      // הזרקת מונים + userLiked והסרת מערכים כבדים
      const shaped = items.map(p => {
        const likesCount = Array.isArray(p.likes) ? p.likes.length : 0;
        const commentsCount = Array.isArray(p.comments) ? p.comments.length : 0;
        const userLiked = !!(userId && p.likes?.some(id => String(id) === userId));
        delete p.likes;
        delete p.comments;
        return { ...p, likesCount, commentsCount, userLiked };
      });

      const pages = Math.max(1, Math.ceil(total / limit));
      return res.json({ items: shaped, total, page, pages, limit });
    }

    // === Grouped ===
    let groupIdExpr;
    if (groupBy === 'day') {
      groupIdExpr = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    } else if (groupBy === 'author') {
      groupIdExpr = '$author';
    } else if (groupBy === 'group') {
      groupIdExpr = '$group';
    } else {
      return res.status(400).json({ msg: 'Unsupported groupBy value' });
    }

    const itemsPerGroup = Math.max(1, Math.min(parseInt(req.query.itemsPerGroup || '5', 10), 20));

    const basePipeline = [
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: {
          _id: groupIdExpr,
          count: { $sum: 1 },
          latestAt: { $max: '$createdAt' },
          items: { $push: '$$ROOT' },
      }},
      { $project: {
          _id: 1, count: 1, latestAt: 1,
          items: { $slice: ['$items', itemsPerGroup] }
      }},
      ...(sort === 'count' ? [{ $sort: { count: -1, latestAt: -1 } }] : [{ $sort: { latestAt: -1 } }]),
      { $skip: skip }, { $limit: limit },
    ];

    if (groupBy === 'author') {
      basePipeline.push(
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'author' } },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
        { $addFields: { groupKey: { _id: '$_id', username: '$author.username' } } }
      );
    } else if (groupBy === 'group') {
      basePipeline.push(
        { $lookup: { from: 'groups', localField: '_id', foreignField: '_id', as: 'group' } },
        { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },
        { $addFields: { groupKey: { _id: '$_id', name: '$group.name' } } }
      );
    } else if (groupBy === 'day') {
      basePipeline.push({ $addFields: { groupKey: '$_id' } });
    }

    basePipeline.push(
      { $lookup: { from: 'users', localField: 'items.author', foreignField: '_id', as: 'itemsAuthors' } },
      { $lookup: { from: 'groups', localField: 'items.group', foreignField: '_id', as: 'itemsGroups' } },
      { $addFields: {
          items: {
            $map: {
              input: '$items',
              as: 'it',
              in: {
                _id: '$$it._id',
                title: '$$it.title',
                content: '$$it.content',
                images: '$$it.images',
                createdAt: '$$it.createdAt',
                updatedAt: '$$it.updatedAt',
                // נשאיר likes/comments כדי לחשב מונים בצד JS ואז נסיר
                likes: '$$it.likes',
                comments: '$$it.comments',
                author: {
                  $let: {
                    vars: { a: { $first: { $filter: { input: '$itemsAuthors', as: 'a', cond: { $eq: ['$$a._id', '$$it.author'] } } } } },
                    in: { _id: '$$a._id', username: '$$a.username' }
                  }
                },
                group: {
                  $let: {
                    vars: { g: { $first: { $filter: { input: '$itemsGroups', as: 'g', cond: { $eq: ['$$g._id', '$$it.group'] } } } } },
                    in: { $cond: [{ $ifNull: ['$$g', false] }, { _id: '$$g._id', name: '$$g.name' }, null] }
                  }
                }
              }
            }
          }
      }},
      { $project: { itemsAuthors: 0, itemsGroups: 0 } }
    );

    const countPipeline = [
      { $match: match },
      { $group: { _id: groupIdExpr } },
      { $count: 'total' }
    ];

    const [groups, countArr] = await Promise.all([
      Post.aggregate(basePipeline),
      Post.aggregate(countPipeline)
    ]);

    const total = countArr?.[0]?.total || 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    // חשב מונים וחיתוך likes/comments מהפריטים
    const shapedGroups = groups.map(g => ({
      key: g.groupKey ?? g._id,
      count: g.count,
      latestAt: g.latestAt,
      items: (g.items || []).map(it => {
        const likesCount = Array.isArray(it.likes) ? it.likes.length : 0;
        const commentsCount = Array.isArray(it.comments) ? it.comments.length : 0;
        const userLiked = !!(userId && it.likes?.some(id => String(id) === userId));
        delete it.likes;
        delete it.comments;
        return { ...it, likesCount, commentsCount, userLiked };
      })
    }));

    return res.json({
      groupBy,
      groups: shapedGroups,
      totalGroups: total,
      page, pages, limit, itemsPerGroup
    });
  } catch (err) {
    if (err && err.status === 401) return res.status(401).json({ msg: 'Unauthorized' });
    next(err);
  }
};

exports.getPost = async (req, res, next) => {
  try {
    const p = await Post.findById(req.params.id)
      .populate('author', 'username')
      .populate('group', 'name');
    if (!p) return res.status(404).json({ msg: 'Post not found' });
    res.json(p);
  } catch (err) { next(err); }
};

exports.updatePost = async (req, res, next) => {
  try {
    const p = await Post.findById(req.params.id);
    if (!p) return res.status(404).json({ msg: 'Post not found' });
    if (!req.session.userId || String(p.author) !== String(req.session.userId))
      return res.status(403).json({ msg: 'Only author can update' });

    const { title, content, images, location, group, status } = req.body;
    if (title    !== undefined) p.title    = title;
    if (content  !== undefined) p.content  = content;
    if (images   !== undefined) p.images   = Array.isArray(images) ? images : [];
    if (location !== undefined) p.location = location;
    if (group    !== undefined) p.group    = group;
    if (status   !== undefined) p.status   = status;

    await p.save();
    await p.populate('author', 'username');
    res.json(p);
  } catch (err) { next(err); }
};

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

// ===== Likes =====
// POST /api/posts/:id/like  (toggle)
exports.toggleLike = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;
    const uid = String(req.session.userId);

    const post = await Post.findById(id).select('likes');
    if (!post) return res.status(404).json({ msg: 'Post not found' });

    const i = post.likes.findIndex(u => String(u) === uid);
    let liked;
    if (i >= 0) {
      post.likes.splice(i, 1);
      liked = false;
    } else {
      post.likes.push(req.session.userId);
      liked = true;
    }
    await post.save();
    return res.json({ liked, likesCount: post.likes.length });
  } catch (err) { next(err); }
};

// ===== Comments =====
// GET /api/posts/:id/comments
exports.listComments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const p = await Post.findById(id)
      .select('comments')
      .populate('comments.user', 'username');
    if (!p) return res.status(404).json({ msg: 'Post not found' });

    // ממיינים מהחדש לישן
    const comments = [...(p.comments || [])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(c => ({
        _id: c._id,
        text: c.text,
        createdAt: c.createdAt,
        user: c.user && typeof c.user === 'object' ? { _id: c.user._id, username: c.user.username } : c.user
      }));

    res.json({ comments });
  } catch (err) { next(err); }
};

// POST /api/posts/:id/comments
exports.addComment = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ msg: 'Missing text' });

    const p = await Post.findById(id).select('comments');
    if (!p) return res.status(404).json({ msg: 'Post not found' });

    const newComment = { user: req.session.userId, text: text.trim(), createdAt: new Date() };
    p.comments.push(newComment);
    await p.save();

    // שליפה עם יוזר לשם
    const created = p.comments[p.comments.length - 1];
    await p.populate({ path: 'comments.user', select: 'username' });

    const c = p.comments.id(created._id);
    res.status(201).json({
      _id: c._id,
      text: c.text,
      createdAt: c.createdAt,
      user: { _id: c.user._id, username: c.user.username },
      commentsCount: p.comments.length
    });
  } catch (err) { next(err); }
};

// DELETE /api/posts/:postId/comments/:commentId
exports.deleteComment = async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ msg: 'Unauthorized' });
    const { postId, commentId } = req.params;
    const uid = String(req.session.userId);

    const p = await Post.findById(postId).select('author comments');
    if (!p) return res.status(404).json({ msg: 'Post not found' });

    const c = p.comments.id(commentId);
    if (!c) return res.status(404).json({ msg: 'Comment not found' });

    const isOwner = String(c.user) === uid;
    const isPostAuthor = String(p.author) === uid;
    if (!isOwner && !isPostAuthor) return res.status(403).json({ msg: 'Forbidden' });

    c.deleteOne();
    await p.save();
    res.json({ msg: 'Comment deleted', commentsCount: p.comments.length });
  } catch (err) { next(err); }
};

// ===== Preview (פופ-אפ) =====
// GET /api/posts/:id/preview
exports.getPreview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.session?.userId ? String(req.session.userId) : null;

    const p = await Post.findById(id)
      .populate('author', 'username')
      .populate('group', 'name')
      .populate('comments.user', 'username');

    if (!p) return res.status(404).json({ msg: 'Post not found' });

    const base = pickPreviewFields(p);
    const likesCount = p.likes?.length || 0;
    const commentsSorted = [...(p.comments || [])].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const result = {
      ...base,
      likesCount,
      commentsCount: commentsSorted.length,
      userLiked: !!(userId && p.likes?.some(u => String(u) === userId)),
      comments: commentsSorted.map(c => ({
        _id: c._id,
        text: c.text,
        createdAt: c.createdAt,
        user: c.user && typeof c.user === 'object' ? { _id: c.user._id, username: c.user.username } : c.user
      })),
    };
    res.json(result);
  } catch (err) { next(err); }
};
