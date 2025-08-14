const Post = require('../models/posts_model');

// Helper: pagination
function parsePageLimit(req, defLimit = 24, maxLimit = 100) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  let limit = parseInt(req.query.limit || String(defLimit), 10);
  if (Number.isNaN(limit) || limit < 1) limit = defLimit;
  limit = Math.min(limit, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// Helper: match filter from query
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

// POST /api/posts
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
      location: location || {}
    });

    // נוח לפרונט
    await post.populate('author', 'username').populate('group', 'name');

    res.status(201).json(post);
  } catch (err) { next(err); }
};

// GET /api/posts
// תומך: q, group, from, to, mine, page, limit, groupBy=day|author|group, sort=latest|count, itemsPerGroup
exports.listPosts = async (req, res, next) => {
  try {
    const { groupBy, sort = 'latest' } = req.query;
    const { page, limit, skip } = parsePageLimit(req, 24, 100);

    // בונים match; זורקים 401 אם mine=true ואין סשן
    const match = buildMatch(req);

    // --- ללא grouping: מחזירים פוסטים רגילים + עימוד (תאימות לאחור) ---
    if (!groupBy) {
      const [items, total] = await Promise.all([
        Post.find(match)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('author', 'username')
          .populate('group', 'name')
          .lean(),
        Post.countDocuments(match),
      ]);
      const pages = Math.max(1, Math.ceil(total / limit));
      return res.json({ items, total, page, pages, limit });
    }

    // --- עם grouping: בניית aggregate ---
    // mapping לשדות קיבוץ
    let groupIdExpr;
    if (groupBy === 'day') {
      // YYYY-MM-DD (אזורי זמן – אם אתה רוצה ידנית: הוסף timezone)
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
      // מיון מקדים כדי שה-$push עם $first/$last/וכד׳ ישמר סדר
      { $sort: { createdAt: -1, _id: -1 } },
      // קיבוץ
      {
        $group: {
          _id: groupIdExpr,
          count: { $sum: 1 },
          latestAt: { $max: '$createdAt' },
          items: { $push: '$$ROOT' }, // נוסיף slice בהמשך
        }
      },
      // נחתוך לכל קבוצה רק כמה פריטים שנרצה
      {
        $project: {
          _id: 1,
          count: 1,
          latestAt: 1,
          items: { $slice: ['$items', itemsPerGroup] },
        }
      },
    ];

    // מיון קבוצות
    if (sort === 'count') {
      basePipeline.push({ $sort: { count: -1, latestAt: -1 } });
    } else {
      // latest (ברירת מחדל)
      basePipeline.push({ $sort: { latestAt: -1 } });
    }

    // עימוד ברמת הקבוצות
    basePipeline.push(
      { $skip: skip },
      { $limit: limit },
    );

    // לוקים לשמות (author/group) אם צריך
    if (groupBy === 'author') {
      basePipeline.push(
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'author' } },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
        { $addFields: { groupKey: { _id: '$_id', username: '$author.username' } } },
      );
    } else if (groupBy === 'group') {
      basePipeline.push(
        { $lookup: { from: 'groups', localField: '_id', foreignField: '_id', as: 'group' } },
        { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },
        { $addFields: { groupKey: { _id: '$_id', name: '$group.name' } } },
      );
    } else if (groupBy === 'day') {
      basePipeline.push(
        { $addFields: { groupKey: '$_id' } }
      );
    }

    // פופולייט מינימלי לפריטים בתוך items (author.username, group.name)
    basePipeline.push(
      {
        $lookup: { from: 'users', localField: 'items.author', foreignField: '_id', as: 'itemsAuthors' }
      },
      {
        $lookup: { from: 'groups', localField: 'items.group', foreignField: '_id', as: 'itemsGroups' }
      },
      // נבנה items עם author/group מצומצמים (username/name) ע"י מיפוי
      {
        $addFields: {
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
                author: {
                  $let: {
                    vars: {
                      a: {
                        $first: {
                          $filter: {
                            input: '$itemsAuthors',
                            as: 'a',
                            cond: { $eq: ['$$a._id', '$$it.author'] }
                          }
                        }
                      }
                    },
                    in: { _id: '$$a._id', username: '$$a.username' }
                  }
                },
                group: {
                  $let: {
                    vars: {
                      g: {
                        $first: {
                          $filter: {
                            input: '$itemsGroups',
                            as: 'g',
                            cond: { $eq: ['$$g._id', '$$it.group'] }
                          }
                        }
                      }
                    },
                    in: {
                      $cond: [
                        { $ifNull: ['$$g', false] },
                        { _id: '$$g._id', name: '$$g.name' },
                        null
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      // ניקוי שדות העזר
      { $project: { itemsAuthors: 0, itemsGroups: 0 } }
    );

    // סופרים כמות קבוצות כולל עימוד (count צריך לרוץ בלי skip/limit)
    const countPipeline = [
      { $match: match },
      {
        $group: { _id: groupIdExpr }
      },
      { $count: 'total' }
    ];

    const [groups, countArr] = await Promise.all([
      Post.aggregate(basePipeline),
      Post.aggregate(countPipeline)
    ]);

    const total = countArr?.[0]?.total || 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      groupBy,
      groups: groups.map(g => ({
        key: g.groupKey ?? g._id, // string (day) או אובייקט מזהה
        count: g.count,
        latestAt: g.latestAt,
        items: g.items,
      })),
      totalGroups: total,
      page,
      pages,
      limit,
      itemsPerGroup
    });
  } catch (err) {
    if (err && err.status === 401) return res.status(401).json({ msg: 'Unauthorized' });
    next(err);
  }
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

    const { title, content, images, location, group, status } = req.body;
    if (title !== undefined)   p.title = title;
    if (content !== undefined) p.content = content;
    if (images !== undefined)  p.images = Array.isArray(images) ? images : [];
    if (location !== undefined)p.location = location;
    if (group !== undefined)   p.group = group;
    if (status !== undefined)  p.status = status;

    await p.save();
    await p.populate('author', 'username');
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
