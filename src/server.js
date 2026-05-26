require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// 1. Middleware CORS Global (Izinkan semua origin agar tidak terkena CORS block)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 2. Koneksi Database MongoDB Atlas
const databaseUrl = process.env.MONGO_URI;
mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 3. Rute API utama
app.use('/api/health', healthRoutes);

// Rute tes untuk memastikan status server
app.get('/', (req, res) => {
  res.send('🚀 DiaLens Backend Serverless is Running Smoothly from src folder!');
});

// Jalankan app.listen HANYA jika tidak berjalan di lingkungan Vercel Serverless
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// WAJIB: Eksport app agar dibaca oleh Vercel Serverless Handler
module.exports = app;