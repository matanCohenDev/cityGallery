const express = require('express');
const router = express.Router();
const { getBranchesWeather } = require('../controllers/weather_controller');
const { requireAuth } = require('../middleware/auth'); // אם תרצה להציג גם לאורחים – אפשר להסיר

// אם אתה רוצה שהדף נחיתה (אורחים) יקבלו תחזית – אל תשתמש ב-requireAuth פה
router.get('/branches', getBranchesWeather);

module.exports = router;
