require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// 1. Middleware - CORS harus paling atas
app.use(cors());
app.use(express.json());

// 2. Koneksi Database
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthrisk-backend')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 3. Rute API - Pastikan prefix ini sesuai dengan frontend
app.use('/api/health', healthRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});