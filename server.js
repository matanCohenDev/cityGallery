const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper: האם הבקשה היא לעמוד HTML (נוויגציה) ---
function wantsHtml(req) {
  const a = req.headers['accept'] || '';
  return a.includes('text/html');
}

// --- Allowlist למסלולים פתוחים כשאין סשן ---
// (דף נחיתה, קבצי סטטיק, ופעולות התחברות/רישום)
const OPEN_HTML_PATHS = new Set([
  '/', '/index.html', '/landing', '/landingPage', '/landingPage.html'
]);
function isOpenPath(req) {
  if (OPEN_HTML_PATHS.has(req.path)) return true;
  if (req.path.startsWith('/uploads/')) return true;                  // תמונות וכד'
  if (req.path.startsWith('/CSS/') || req.path.startsWith('/JS/') ||
      req.path.startsWith('/images/') || req.path.startsWith('/img/')) return true;
  // API פתוחים להתחברות/רישום
  if (req.path.startsWith('/api/users/login') || req.path.startsWith('/api/users/register')) return true;
  return false;
}

// --- Gate כללי לכל ה־HTML (לפני ראוטים של דפים) ---
app.use((req, res, next) => {
  // רק לבקשות HTML (לא שוברים API/סטטיק/XHR)
  if (!wantsHtml(req)) return next();

  // אם אין סשן ואין זה מסלול מותר – נחזיר את דף הנחיתה
  if (!req.session?.userId && !isOpenPath(req)) {
    return res.sendFile(path.join(__dirname, 'views', 'landingPage.html'));
  }
  next();
});

// DB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('connected to db'))
  .catch(err => console.error('mongo connect error:', err.message));

// API Routes
app.use('/api/users',    require('./routes/users_routes'));
app.use('/api/posts',    require('./routes/posts_routes'));
app.use('/api/branches', require('./routes/galleryBranches_routes'));
app.use('/api/groups',   require('./routes/groups_routes'));
app.use('/api/uploads',  require('./routes/uploads_routes'));
app.use('/api/metrics', require('./routes/metrics_routes'));
app.use('/api/weather', require('./routes/weather_routes'));

// דפי אפליקציה (חסומים ללא סשן ע"י השומר הגלובלי מעל)
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

app.get('/feed', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'feed.html'));
});

// דף נחיתה (פתוח)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'landingPage.html'));
});

// Error handler (אחרי כל הראוטים)
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`Server started on port ${process.env.PORT || 3000}`)
);

// git checkout main
// git pull
// git add .
// ./even_commits.sh "Feat"   # מפזר קומיטים בין ה-5
// git push
// ./decorate_merges.sh

//33
