const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// Session (in-memory לפיתוח; לפרודקשן מומלץ connect-mongo)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// DB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('connected to db'))
  .catch(err => console.error('mongo connect error:', err.message));

// Routes
app.use('/api/users',    require('./routes/users_routes'));
app.use('/api/posts',    require('./routes/posts_routes'));
app.use('/api/branches', require('./routes/galleryBranches_routes'));
app.use('/api/groups',   require('./routes/groups_routes'));
app.use('/api/uploads',  require('./routes/uploads_routes'));

// Error handler
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.use('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'views' , 'profile.html'));
});

app.use('/feed', (req, res) => {
    res.sendFile(path.join(__dirname, 'views' , 'feed.html'));
});

app.use('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views' , 'landingPage.html'));
});

app.listen(process.env.PORT || 3000, () => console.log(`Server started on port ${process.env.PORT || 3000}`));

// git checkout main
// git pull
// git add .
// ./even_commits.sh "Feat"   # מפזר קומיטים בין ה-5
// git push
// ./decorate_merges.sh


//26
//33
