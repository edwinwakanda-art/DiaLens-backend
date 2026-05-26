const mongoose = require('mongoose');

const adviceSchema = new mongoose.Schema({
  diseaseType: String, // 'diabetes', 'heart', 'hypertension'
  riskLevel: String,    // 'Low', 'Medium', 'High'
  dietRecommendation: String, // Contoh: "Kurangi karbohidrat spesifik" [cite: 26]
  activityRecommendation: String, // Contoh: "Jalan kaki 30 menit" [cite: 27]
  medicalStep: String  // Contoh: "Segera konsultasi ke dokter" [cite: 21, 28]
});

module.exports = mongoose.model('Advice', adviceSchema);