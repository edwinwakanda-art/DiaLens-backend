const path = require('path');
// Cukup panggil dotenv biasa tanpa path paksaan jika menggunakan Environment Variables Railway
require('dotenv').config(); 

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// PASTIKAN penulisan 'routes/healthRoutes' sama persis dengan nama file asli Anda di folder
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// ==========================================
// 1. MIDDLEWARE CORS & PARSING
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 2. KONEKSI DATABASE
// ==========================================
const databaseUrl = process.env.MONGO_URI;
mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// 3. ROUTING API
// ==========================================
// Ini akan menghasilkan endpoint /api/health/records jika digabung dengan router.get('/records')
app.use('/api/health', healthRoutes);

// Rute tes status utama
app.get('/', (req, res) => {
  res.send('🚀 DiaLens Backend Server is Running Smoothly on Railway!');
});

// ==========================================
// 4. MENYALAKAN PORT SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server berjalan permanen dan mendengarkan port ${PORT}`);
});

module.exports = app;