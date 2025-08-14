// routes/metrics_routes.js
const express = require('express');
const router = express.Router();
const { landingMetrics } = require('../controllers/metrics_controller');

// אין צורך באימות — זה מוצג בדף נחיתה
router.get('/landing', landingMetrics);

module.exports = router;
