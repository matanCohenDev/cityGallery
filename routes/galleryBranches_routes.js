const express = require('express');
const router = express.Router();
const { createBranch, listBranches, getBranch, updateBranch, deleteBranch } =
  require('../controllers/galleryBranches_controller');
const { requireAdmin } = require('../middleware/auth');

router.get('/',        listBranches);
router.get('/:id',     getBranch);
router.post('/',       requireAdmin, createBranch);
router.patch('/:id',   requireAdmin, updateBranch);
router.delete('/:id',  requireAdmin, deleteBranch);

module.exports = router;
