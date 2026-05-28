const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const healthController = require('../controllers/healthController');
const authMiddleware = require('../middleware/authMiddleware');
const HealthRecord = require('../models/HealthRecord');

// Endpoint Auth & Tokens
router.post('/login', authController.login);
router.post('/register', authController.register);
// Fix Prioritas 9: Daftarkan route refresh token di sini
router.post('/refresh', authController.refresh);

// Endpoint Health Predict & Records
router.post('/predict', authMiddleware, healthController.predict);
router.get('/records', authMiddleware, healthController.getRecords);

// Endpoint: DELETE /api/health/records/:id
router.delete('/records/:id', authMiddleware, async (req, res) => {
  try {
    const recordId = req.params.id;
    const userId = req.user.id;

    const record = await HealthRecord.findOneAndDelete({ _id: recordId, userId });

    if (!record) {
      return res.status(404).json({ message: 'Catatan medis tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    res.status(200).json({ message: 'Catatan riwayat medis berhasil dihapus permanen.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses penghapusan data', detail: err.message });
  }
});

module.exports = router;