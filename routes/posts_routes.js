// server/routes/posts_routes.js
const express = require('express');
const router = express.Router();
const {
  createPost, listPosts, getPost, updatePost, deletePost,
  toggleLike, listComments, addComment, deleteComment, getPreview
} = require('../controllers/posts_controller');
const { requireAuth } = require('../middleware/auth');

// פוסטים
router.get('/',        listPosts);
router.get('/:id',     getPost);
router.post('/',       requireAuth, createPost);
router.patch('/:id',   requireAuth, updatePost);
router.delete('/:id',  requireAuth, deletePost);

// לייקים
router.post('/:id/like', requireAuth, toggleLike);

// תגובות
router.get('/:id/comments',          listComments);
router.post('/:id/comments',         requireAuth, addComment);
router.delete('/:postId/comments/:commentId', requireAuth, deleteComment);

// פריוויו לפופ-אפ
router.get('/:id/preview', getPreview);

module.exports = router;
