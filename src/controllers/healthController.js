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

// ==========================================================
// 🚀 ENDPOINT: AMBIL RIWAYAT MEDIS (ANTI-500 CRASH GUARANTEE)
// ==========================================================
exports.getRecords = async (req, res) => {
  try {
    // 1. Ekstraksi ID Pengguna secara berlapis dari token JWT (Mencegah Undefined)
    let rawUserId = null;
    if (req.user) {
      rawUserId = req.user.id || req.user._id || (req.user.user && (req.user.user.id || req.user.user._id));
    }

    // Jika ID benar-back-empty, kembalikan JSON status 401 bukan melempar crash server HTML
    if (!rawUserId) {
      console.warn('⚠️ Request /records ditolak: ID Pengguna tidak ditemukan di token req.user');
      return res.status(401).json({ 
        message: 'Akses ditolak. Sesi autentikasi Anda tidak membawa ID Pengguna yang valid.' 
      });
    }

    const userIdStr = String(rawUserId).trim();

    // 2. Validasi format string: Apakah memenuhi standar BSON ObjectId MongoDB?
    if (!mongoose.Types.ObjectId.isValid(userIdStr)) {
      console.warn(`⚠️ Format ID Pengguna tidak standar MongoDB: "${userIdStr}"`);
      return res.status(400).json({ 
        message: 'Format User ID di dalam token tidak valid untuk pencarian database.' 
      });
    }

    // 3. Konversi string ke ObjectId asli agar Mongoose tidak melempar CastError 500
    const targetObjectId = new mongoose.Types.ObjectId(userIdStr);

    // 4. Pastikan model database siap digunakan
    if (!HealthRecord) {
      return res.status(500).json({ 
        error: 'Model database internal error', 
        message: 'Skema model HealthRecord gagal dimuat di server backend.' 
      });
    }

    // 5. Jalankan query pencarian ke database MongoDB Cluster
    const records = await HealthRecord.find({ userId: targetObjectId }).sort({ date: -1 });

    // JIKA data di database masih kosong, JANGAN di-crash-kan. Kembalikan array kosong [] secara sukses (200 OK)
    if (!records || records.length === 0) {
      return res.status(200).json([]);
    }

    // 6. Normalisasi data agar strukturnya aman dikonsumsi oleh chart Recharts Frontend
    const flattenedRecords = records.map((rec) => {
      const biometrics = rec.biometrics || {};
      const results = rec.results || {};

      let currentBmi = biometrics.bmi || '-';
      if ((currentBmi === '-' || currentBmi === 0 || !currentBmi) && biometrics.weight && biometrics.height) {
        const w = parseFloat(biometrics.weight);
        const h = parseFloat(biometrics.height) / 100;
        if (w > 0 && h > 0) {
          currentBmi = (w / (h * h)).toFixed(1);
        }
      }

      let rawRisk = undefined;
      if (results.diabetesRisk !== undefined && results.diabetesRisk !== null) {
        rawRisk = results.diabetesRisk;
      } else if (results.diabetesrisk !== undefined && results.diabetesrisk !== null) {
        rawRisk = results.diabetesrisk;
      } else if (rec.diabetesRisk !== undefined) {
        rawRisk = rec.diabetesRisk;
      }

      const finalDiabetesRisk = (rawRisk !== undefined && !isNaN(rawRisk)) ? Math.round(Number(rawRisk)) : null;

      return {
        id: rec._id ? rec._id.toString() : 'DL-Log',
        date: rec.date || rec.createdAt || new Date().toISOString(),
        age: biometrics.Age || biometrics.age || '-',
        weight: biometrics.weight || '-',
        height: biometrics.height || '-',
        bmi: String(currentBmi),
        highBP: rec.clinical?.highBP || 'No',
        highChol: rec.clinical?.highChol || 'No',
        prediction: results.riskLevel || results.prediction || 'Low',
        status: results.prediction === 1 || results.riskLevel === 'High' ? 'Warning' : 'Safe',
        ai_recommendation: results.aiRecommendation || 'Tidak ada rekomendasi dari AI.',
        risk_level: results.riskLevel || 'Low',
        diabetesRisk: finalDiabetesRisk 
      };
    });

    // 7. Kirim respon sukses dalam format JSON murni
    return res.status(200).json(flattenedRecords);

  } catch (err) {
    console.error('❌ Error fatal di dalam fungsi getRecords:', err);
    // Jika crash total terjadi, paksa kembalikan JSON terstruktur agar frontend tidak menangkap HTML
    return res.status(500).json({ 
      error: 'Terjadi kegagalan sistem internal database.', 
      message: err.message 
    });
  }
};

// ==========================================================
// 🚀 ENDPOINT: PROSES PREDIKSI AI BARU
// ==========================================================
exports.predict = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ message: 'Payload JSON diperlukan untuk melakukan prediksi.' });
    }

    let rawUserId = req.user ? (req.user.id || req.user._id || (req.user.user && (req.user.user.id || req.user.user._id))) : null;
    if (!rawUserId) {
      return res.status(401).json({ message: 'Akses ditolak. Sesi login Anda tidak valid.' });
    }

    const { getAiPrediction } = require('../services/predictService');
    const aiResponse = await getAiPrediction(payload);

    const normalizedResponse = {
      probability: typeof aiResponse.probability === 'number' ? aiResponse.probability : Number(aiResponse.probability || 0),
      risk_level: aiResponse.risk_level || aiResponse.riskLevel || null,
      prediction: typeof aiResponse.prediction === 'number' ? aiResponse.prediction : (aiResponse.prediction === true ? 1 : aiResponse.prediction === false ? 0 : null),
      threshold_used: typeof aiResponse.threshold_used === 'number' ? aiResponse.threshold_used : typeof aiResponse.thresholdUsed === 'number' ? aiResponse.thresholdUsed : null,
      explanation_method: aiResponse.explanation_method || aiResponse.explanationMethod || null,
      ai_recommendation: aiResponse.ai_recommendation || aiResponse.aiRecommendation || 'Tidak ada rekomendasi dari AI.',
      top_risk_factors: normalizeTopRiskFactors(aiResponse.top_risk_factors || aiResponse.topRiskFactors)
    };

    if (!HealthRecord) {
      return res.status(500).json({ error: 'Model database belum siap.' });
    }

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
    console.error('❌ Error di endpoint predict:', err);
    return res.status(500).json({ error: 'Gagal memproses prediksi AI', message: err.message });
  }
};