const mongoose = require('mongoose');

// Pastikan pemanggilan Model HealthRecord aman dan tidak bernilai undefined
let HealthRecord;
try {
  HealthRecord = require('../models/HealthRecord');
} catch (e) {
  console.error("❌ Gagal me-require model HealthRecord:", e);
}

// Helper untuk normalisasi top risk factors
function normalizeTopRiskFactors(factors) {
  if (!Array.isArray(factors)) return [];
  return factors.map((factor) => {
    if (typeof factor === 'string') {
      return { feature: factor, shap_value: null, direction: 'unknown' };
    }
    return {
      feature: factor.feature || factor.name || null,
      shap_value: typeof factor.shap_value === 'number' ? factor.shap_value : typeof factor.value === 'number' ? factor.value : null,
      direction: factor.direction || factor.effect || 'unknown'
    };
  });
}

// Helper untuk prediksi cadangan (Heuristic Fallback) jika AI utama offline
function fallbackPredict(payload) {
  const age = Number(payload.Age || payload.age || 0);
  const bmi = Number(payload.BMI || payload.bmi || 0);
  
  let score = 0;
  if (age >= 45) score += 0.2;
  if (bmi >= 25) score += 0.25;

  const riskLevel = score > 0.4 ? 'High' : score > 0.15 ? 'Medium' : 'Low';
  return {
    probability: score,
    risk_level: riskLevel,
    prediction: score > 0.4 ? 1 : 0,
    threshold_used: 0.4,
    explanation_method: 'Heuristic Fallback',
    ai_recommendation: 'Silakan lakukan konsultasi medis resmi untuk hasil akurat.',
    top_risk_factors: [
      { feature: 'Age', shap_value: age, direction: 'positive' },
      { feature: 'BMI', shap_value: bmi, direction: 'positive' }
    ]
  };
}

// ==========================================================
// 🚀 ENDPOINT: AMBIL RIWAYAT MEDIS (FLATTENED PAYLOAD FOR FRONTEND)
// ==========================================================
exports.getRecords = async (req, res) => {
  try {
    // 1. Ekstraksi ID Pengguna secara berlapis dari token JWT
    let rawUserId = null;
    if (req.user) {
      rawUserId = req.user.id || req.user._id || req.user.userId;
    }

    if (!rawUserId) {
      return res.status(401).json({ message: 'Akses ditolak. Token tidak mengenali ID Pengguna.' });
    }

    // 2. Ambil data dari database berdasarkan userId, urutkan dari yang terbaru
    const records = await HealthRecord.find({ 
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()) 
    }).sort({ date: -1 });

    // 3. ✨ PERBAIKAN UTAMA: Transformasi data bersarang menjadi flat object sesuai interface Next.js
    const formattedRecords = records.map(record => {
      const biometrics = record.biometrics || {};
      const clinical = record.clinical || {};
      const results = record.results || {};

      // Konversi nilai prediksi numerik ke status teks yang ramah dibaca frontend
      const statusText = results.prediction === 1 ? 'Diabetes Terdeteksi' : 'Aman / Normal';

      return {
        id: record._id.toString(),
        date: record.date,
        
        // Meratakan (Flattening) properti biometrics
        age: String(biometrics.age ?? '-'),
        weight: String(biometrics.weight ?? '-'),
        height: String(biometrics.height ?? '-'),
        bmi: String(biometrics.bmi ?? '-'),
        
        // Meratakan properti clinical
        highBP: String(clinical.highBP ?? 'No'),
        highChol: String(clinical.highChol ?? 'No'),
        
        // Meratakan properti results
        prediction: String(results.prediction ?? 0),
        status: statusText,
        risk_level: results.riskLevel || 'Unknown',
        diabetesRisk: results.diabetesRisk ?? 0,
        ai_recommendation: results.aiRecommendation || 'Tidak ada rekomendasi.',
        topRiskFactors: results.topRiskFactors || []
      };
    });

    // 4. Kirim data yang sudah rapi ke frontend
    return res.status(200).json(formattedRecords);

  } catch (err) {
    console.error("❌ Error di getRecords:", err);
    return res.status(500).json({ 
      message: 'Gagal mengambil riwayat medis dari server.', 
      detail: err.message 
    });
  }
};

// ==========================================================
// 🚀 ENDPOINT: PROSES PREDIKSI & SIMPAN KE DATABASE
// ==========================================================
exports.predict = async (req, res) => {
  try {
    let rawUserId = null;
    if (req.user) {
      rawUserId = req.user.id || req.user._id || req.user.userId;
    }

    if (!rawUserId) {
      return res.status(401).json({ message: 'Akses ditolak. Pengguna tidak terautentikasi.' });
    }

    const payload = req.body;
    const predictService = require('../services/predictService');
    
    let aiResponse;
    try {
      aiResponse = await predictService.getAiPrediction(payload);
    } catch (aiErr) {
      console.warn("⚠️ AI Service gagal, beralih ke Fallback Predictor:", aiErr.message);
      aiResponse = fallbackPredict(payload);
    }

    const normalizedResponse = {
      probability: typeof aiResponse.probability === 'number' ? aiResponse.probability : 0,
      risk_level: aiResponse.risk_level || 'Unknown',
      prediction: typeof aiResponse.prediction === 'number' ? aiResponse.prediction : 0,
      threshold_used: aiResponse.threshold_used || 0.5,
      explanation_method: aiResponse.explanation_method || 'N/A',
      ai_recommendation: aiResponse.ai_recommendation || '',
      top_risk_factors: normalizeTopRiskFactors(aiResponse.top_risk_factors || aiResponse.topRiskFactors)
    };

    const newRecord = new HealthRecord({
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()),
      biometrics: {
        age: payload.Age || payload.age || null,
        weight: payload.Weight || payload.weight || null,
        height: payload.Height || payload.height || null,
        bmi: payload.BMI || payload.bmi || null
      },
      clinical: {
        highBP: payload.HighBP || payload.highBP || 'No',
        highChol: payload.HighChol || payload.highChol || 'No',
        genHlth: payload.GenHlth || payload.genHlth || 'Good',
        sex: payload.Sex || payload.sex || 'Male'
      },
      results: {
        diabetesRisk: normalizedResponse.probability,
        riskLevel: normalizedResponse.risk_level,
        prediction: normalizedResponse.prediction,
        thresholdUsed: normalizedResponse.threshold_used,
        explanationMethod: normalizedResponse.explanation_method,
        aiRecommendation: normalizedResponse.ai_recommendation,
        topRiskFactors: normalizedResponse.top_risk_factors
      }
    });

    const savedRecord = await newRecord.save();
    return res.status(201).json({
      message: 'Prediksi berhasil diproses dan disimpan.',
      recordId: savedRecord._id,
      data: normalizedResponse
    });

  } catch (err) {
    console.error("❌ Error di predict:", err);
    return res.status(500).json({ message: 'Gagal memproses AI Skrining.', error: err.message });
  }
};