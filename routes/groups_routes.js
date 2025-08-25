const express = require('express');
const router = express.Router();
const {
  createGroup,
  listGroups,
  listMyGroups,
  listJoinableGroups,
  listGroupMembers,     
  removeMember,         
  joinGroup,
  leaveGroup,
  updateGroup,
  deleteGroup
} = require('../controllers/groups_controller');
const { requireAuth } = require('../middleware/auth');

router.get('/',              listGroups);
router.get('/mine',          listMyGroups);
router.get('/joinable',      requireAuth, listJoinableGroups);

router.get('/:id/members',   requireAuth, listGroupMembers);
router.delete('/:id/members/:userId', requireAuth, removeMember);

router.post('/',             requireAuth, createGroup);
router.post('/:id/join',     requireAuth, joinGroup);
router.post('/:id/leave',    requireAuth, leaveGroup);
router.patch('/:id',         requireAuth, updateGroup);
router.delete('/:id',        requireAuth, deleteGroup);

router.get('/:id/tweet', async (req, res, next) => {
  try {
    const g = await Group.findById(req.params.id).lean();
    if (!g) return res.status(404).json({ msg: 'Not found' });
    res.json({ tweetId: g.tweetId || null, tweetUrl: g.tweetUrl || null, tweetedAt: g.tweetedAt || null });
  } catch (e) { next(e); }
});


module.exports = router;
