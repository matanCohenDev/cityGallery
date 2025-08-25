const express = require('express');
const router = express.Router();
const { getBranchesWeather } = require('../controllers/weather_controller');
const { requireAuth } = require('../middleware/auth'); 

router.get('/branches', getBranchesWeather);

module.exports = router;
