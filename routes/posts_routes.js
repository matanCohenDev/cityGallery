const express = require('express');
const router = express.Router();
const { createPost, listPosts, getPost, updatePost, deletePost } =
  require('../controllers/posts_controller');
const { requireAuth } = require('../middleware/auth');

router.get('/',        listPosts);
router.get('/:id',     getPost);
router.post('/',       requireAuth, createPost);
router.patch('/:id',   requireAuth, updatePost);
router.delete('/:id',  requireAuth, deletePost);

module.exports = router;
