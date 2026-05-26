require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// 1. Middleware - CORS diletakkan di paling atas
app.use(cors());
app.use(express.json()); //

// 2. Koneksi Database
const databaseUrl = process.env.MONGO_URI;

if (!databaseUrl) {
  console.warn('⚠️ PERINGATAN: Variabel MONGO_URI tidak ditemukan di Environment Variables!');
}

// Menghubungkan ke MongoDB Atlas
mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully')) //
  .catch(err => console.error('❌ MongoDB Connection Error:', err)); //

// 3. Rute API
app.use('/api/health', healthRoutes); //

// Rute cadangan untuk memastikan backend aktif saat dibuka di browser
app.get('/', (req, res) => {
  res.send('🚀 DiaLens Backend Serverless is Running!');
});

const PORT = process.env.PORT || 5000; //
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`); //
});

// PENTING UNTUK VERCEL DEPLOY: Eksport aplikasi express kamu
module.exports = app;