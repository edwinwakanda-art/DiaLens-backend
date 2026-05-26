const mongoose = require('mongoose');
const Advice = require('./models/Advice');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    await Advice.deleteMany(); // Bersihkan data lama
    await Advice.insertMany([
      {
        diseaseType: 'diabetes',
        riskLevel: 'High',
        dietRecommendation: 'Kurangi karbohidrat spesifik dan gula tambahan.',
        activityRecommendation: 'Jalan cepat minimal 30 menit setiap hari.',
        medicalStep: 'Segera konsultasi ke dokter spesialis penyakit dalam.'
      },
      {
        diseaseType: 'heart',
        riskLevel: 'Medium',
        dietRecommendation: 'Tingkatkan konsumsi serat dan kurangi lemak jenuh.',
        activityRecommendation: 'Lakukan olahraga kardio ringan 3-4 kali seminggu.',
        medicalStep: 'Lakukan pemeriksaan EKG di laboratorium terdekat.'
      }
    ]);
    console.log("Data Saran Medis berhasil dimasukkan!");
    process.exit();
  });