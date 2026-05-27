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

// 🎯 TAMBAHKAN ENDPOINT HAPUS BARU INI
router.delete('/records/:id', authMiddleware, async (req, res) => {
  try {
    const recordId = req.params.id;
    const userId = req.user.id;

    // Pastikan rekam medis yang dihapus benar-benar milik user yang sedang terautentikasi
    const record = await require('../models/HealthRecord').findOneAndDelete({ _id: recordId, userId });

    if (!record) {
      return res.status(404).json({ message: 'Catatan medis tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    res.status(200).json({ message: 'Catatan riwayat medis berhasil dihapus permanen.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses penghapusan data', detail: err.message });
  }
});

module.exports = router;