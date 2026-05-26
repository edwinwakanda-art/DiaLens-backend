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

// Debug: GET /api/health/me -> returns decoded token payload
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Endpoint: POST /api/health/refresh
router.post('/refresh', authController.refresh);

// Endpoint: POST /api/health/logout
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;