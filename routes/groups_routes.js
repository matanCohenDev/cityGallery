const express = require('express');
const router = express.Router();
const { createGroup, listGroups, joinGroup, leaveGroup, updateGroup, deleteGroup } =
  require('../controllers/groups_controller');
const { requireAuth } = require('../middleware/auth');

router.get('/',          listGroups);
router.post('/',         requireAuth, createGroup);
router.post('/:id/join', requireAuth, joinGroup);
router.post('/:id/leave',requireAuth, leaveGroup);
router.patch('/:id',     requireAuth, updateGroup);
router.delete('/:id',    requireAuth, deleteGroup);

module.exports = router;
