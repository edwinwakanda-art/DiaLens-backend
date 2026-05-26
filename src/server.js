require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// 1. Middleware - CORS diletakkan di paling atas
// Mengizinkan semua domain (default) agar frontend Vercel kamu bisa mengakses backend ini
app.use(cors());
app.use(express.json()); //

// 2. Koneksi Database
// Mengambil URL dari process.env.MONGO_URI (Variabel yang kamu isi di Vercel Dashboard)
const databaseUrl = process.env.MONGO_URI;

if (!databaseUrl) {
  console.warn('⚠️ PERINGATAN: Variabel MONGO_URI tidak ditemukan di Environment Variables!');
  console.warn('Sistem otomatis beralih menggunakan database lokal komputer (Fallback).');
}

// Menghubungkan ke MongoDB Atlas kamu, atau ke database lokal jika MONGO_URI kosong
mongoose.connect(databaseUrl || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully')) //
  .catch(err => console.error('❌ MongoDB Connection Error:', err)); //

// 3. Rute API
app.use('/api/health', healthRoutes); //

const PORT = process.env.PORT || 5000; //
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`); //
});