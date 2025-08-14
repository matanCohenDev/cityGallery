// controllers/metrics_controller.js
const Post  = require('../models/posts_model');   // קיים אצלך (routes/posts_routes)
const Group = require('../models/groups_model');
const User  = require('../models/users_model');   // לא חובה לגרפים האלו, אבל נשאיר להרחבות

exports.landingMetrics = async (req, res, next) => {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0,0,0,0);
    from.setDate(from.getDate() - 13); // כולל היום => 14 ימים

    // Posts per day (14 days)
    const postsAgg = await Post.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $project: { _id: 0, date: '$_id', count: 1 } },
      { $sort: { date: 1 } }
    ]);

    // Top 5 groups by members count
    const groupsAgg = await Group.aggregate([
      { $project: {
          name: '$name',
          membersCount: { $size: { $ifNull: ['$members', []] } }
      }},
      { $sort: { membersCount: -1, name: 1 } },
      { $limit: 5 }
    ]);

    res.json({
      postsLast14: postsAgg,     // [{date:'2025-08-12', count: 7}, ...]
      topGroups: groupsAgg       // [{name:'Group A', membersCount: 12}, ...]
    });
  } catch (err) { next(err); }
};
