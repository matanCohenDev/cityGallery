const express = require('express');
const router = express.Router();
const { landingMetrics } = require('../controllers/metrics_controller');

router.get('/landing', landingMetrics);

module.exports = router;
