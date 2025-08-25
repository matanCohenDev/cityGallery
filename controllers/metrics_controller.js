const Post  = require('../models/posts_model');   
const Group = require('../models/groups_model');
const User  = require('../models/users_model');  

exports.landingMetrics = async (req, res, next) => {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0,0,0,0);
    from.setDate(from.getDate() - 13); 

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

    const groupsAgg = await Group.aggregate([
      { $project: {
          name: '$name',
          membersCount: { $size: { $ifNull: ['$members', []] } }
      }},
      { $sort: { membersCount: -1, name: 1 } },
      { $limit: 5 }
    ]);

    res.json({
      postsLast14: postsAgg,
      topGroups: groupsAgg
    });
  } catch (err) { next(err); }
};
