const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const healthController = require('../controllers/healthController');
const authMiddleware = require('../middleware/authMiddleware');

// Endpoint: POST /api/health/login
router.post('/login', authController.login);
// Endpoint: POST /api/health/register
router.post('/register', authController.register);

// Endpoint: POST /api/health/predict
router.post('/predict', authMiddleware, healthController.predict);
// Endpoint: GET /api/health/records
router.get('/records', authMiddleware, healthController.getRecords);

module.exports = router;