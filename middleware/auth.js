// בדיקה שיש משתמש מחובר (מבוסס סשן)
module.exports.requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ msg: 'Unauthorized' });
};

// אופציונלי: לבדוק אדמין
module.exports.requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ msg: 'Forbidden' });
};
