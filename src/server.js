const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// 1. MIDDLEWARE WAJIB UNTUK VERCEL (Mengizinkan parsing JSON & CORS penuh)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. KONEKSI DATABASE
const databaseUrl = process.env.MONGO_URI;
mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 3. ROUTING API
app.use('/api/health', healthRoutes);

// Rute tes status utama
app.get('/', (req, res) => {
  res.send('🚀 DiaLens Backend Serverless is Running Smoothly from src folder!');
});

// Jalankan port jika di komputer lokal (development)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// EKSPOR UTAMA UNTUK FUNCTION VERCEL
module.exports = app;