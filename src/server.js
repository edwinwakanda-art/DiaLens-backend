require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// PERBAIKAN JALUR: Karena server.js selevel dengan folder routes di dalam src
const healthRoutes = require('./routes/healthRoutes'); 

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Koneksi Database MongoDB Atlas
const databaseUrl = process.env.MONGO_URI;

if (!databaseUrl) {
  console.warn('⚠️ PERINGATAN: Variabel MONGO_URI tidak ditemukan di Environment Variables Vercel!');
}

mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 3. Rute API
app.use('/api/health', healthRoutes);

// Jalur tes utama untuk memastikan backend hidup di browser
app.get('/', (req, res) => {
  res.send('🚀 DiaLens Backend Serverless is Running Smoothly from src folder!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// PENTING: Export aplikasi agar dikenali Vercel Serverless
module.exports = app;