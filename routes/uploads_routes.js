const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();

// ודא שקיימת התיקייה /public/uploads
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// הגדרת אחסון: שם קובץ ייחודי + תיקיית יעד
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'image', ext)
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext || '.jpg'}`);
  }
});

// סינון סוגי קבצים (אופציונלי)
function fileFilter(req, file, cb) {
  if (!/^image\//.test(file.mimetype)) {
    return cb(new Error('Only image uploads are allowed'), false);
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // עד 5MB

// POST /api/uploads  (שדה: image)
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded (field name should be "image")' });
  }
  // מייצר URL ציבורי מתוך /public
  const publicUrl = `/uploads/${req.file.filename}`;
  res.json({ url: publicUrl });
});

module.exports = router;
