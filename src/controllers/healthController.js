const mongoose = require('mongoose');

// Pastikan pemanggilan Model HealthRecord aman dan tidak bernilai undefined
let HealthRecord;
try {
  HealthRecord = require('../models/HealthRecord');
} catch (e) {
  console.error("❌ Gagal me-require model HealthRecord:", e);
}

// ==========================================================
// 🛠️ HELPER FUNCTIONS
// ==========================================================
function pickValue(payload, upperKey, lowerKey, groupKey) {
  return (
    payload[upperKey] ??
    payload[lowerKey] ??
    payload[groupKey]?.[lowerKey]
  );
}

function toNumberOrDefault(value, defaultValue = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : defaultValue;
}

function buildAiPayload(payload) {
  return {
    HighBP: toNumberOrDefault(pickValue(payload, 'HighBP', 'highBP', 'clinical')),
    GenHlth: toNumberOrDefault(pickValue(payload, 'GenHlth', 'genHlth', 'clinical'), 1),
    HighChol: toNumberOrDefault(pickValue(payload, 'HighChol', 'highChol', 'clinical')),
    Age: toNumberOrDefault(pickValue(payload, 'Age', 'age', 'biometrics')),
    CholCheck: toNumberOrDefault(pickValue(payload, 'CholCheck', 'cholCheck', 'clinical')),
    HvyAlcoholConsump: toNumberOrDefault(pickValue(payload, 'HvyAlcoholConsump', 'hvyAlcoholConsump', 'lifestyle')),
    BMI: toNumberOrDefault(pickValue(payload, 'BMI', 'bmi', 'biometrics')),
    PhysActivity: toNumberOrDefault(pickValue(payload, 'PhysActivity', 'physActivity', 'lifestyle')),
    Smoker: toNumberOrDefault(pickValue(payload, 'Smoker', 'smoker', 'lifestyle'))
  };
}

function validateAiPayload(aiPayload) {
  const requiredFields = [
    'HighBP',
    'GenHlth',
    'HighChol',
    'Age',
    'CholCheck',
    'HvyAlcoholConsump',
    'BMI',
    'PhysActivity',
    'Smoker'
  ];
  return requiredFields.filter((field) => !Number.isFinite(aiPayload[field]));
}

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
// 🚀 ENDPOINT: AMBIL RIWAYAT MEDIS
// ==========================================================
exports.getRecords = async (req, res) => {
  try {
    let rawUserId = null;
    if (req.user) {
      rawUserId = req.user.id || req.user._id || req.user.userId;
    }

    if (!rawUserId) {
      return res.status(401).json({ message: 'Akses ditolak. Token tidak mengenali ID Pengguna.' });
    }

    const records = await HealthRecord.find({ 
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()) 
    }).sort({ date: -1 });

    const formattedRecords = records.map(record => {
      const biometrics = record.biometrics || {};
      const clinical = record.clinical || {};
      const results = record.results || {};

      const statusText = results.prediction === 1 ? 'Diabetes Terdeteksi' : 'Aman / Normal';

      return {
        id: record._id.toString(),
        date: record.date,
        
        age: String(biometrics.age ?? '-'),
        weight: String(biometrics.weight ?? '-'),
        height: String(biometrics.height ?? '-'),
        bmi: String(biometrics.bmi ?? '-'),
        
        highBP: String(clinical.highBP ?? 'No'),
        highChol: String(clinical.highChol ?? 'No'),
        
        prediction: String(results.prediction ?? 0),
        status: statusText,
        risk_level: results.riskLevel || 'Unknown',
        diabetesRisk: results.diabetesRisk ?? 0,
        ai_recommendation: results.aiRecommendation || 'Tidak ada rekomendasi.',
        topRiskFactors: results.topRiskFactors || []
      };
    });

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
    
    const aiPayload = buildAiPayload(payload);

    const missingOrInvalidFields = validateAiPayload(aiPayload);
    if (missingOrInvalidFields.length > 0) {
      return res.status(400).json({
        message: 'Payload prediksi tidak valid.',
        fields: missingOrInvalidFields
      });
    }

    const predictService = require('../services/predictService');
    
    let aiResponse;
    try {
      aiResponse = await predictService.getAiPrediction(aiPayload);
    } catch (aiErr) {
      console.warn("⚠️ AI Service gagal, beralih ke Fallback Predictor:", aiErr.message);
      aiResponse = predictService.getAiPredictionFromFallback(aiPayload);
    }

    const rawProbability = Number(aiResponse.probability);
    const parsedProbability = Number.isFinite(rawProbability) ? rawProbability : 0;
    const normalizedProbability = parsedProbability > 1 ? parsedProbability / 100 : parsedProbability;

    const rawPrediction = Number(aiResponse.prediction);
    const normalizedPrediction = Number.isFinite(rawPrediction) ? rawPrediction : 0;

    const rawThreshold = Number(aiResponse.threshold_used);
    const normalizedThreshold = Number.isFinite(rawThreshold) ? rawThreshold : 0.5;

    const normalizedResponse = {
      probability: normalizedProbability,
      risk_level: aiResponse.risk_level || 'Unknown',
      prediction: normalizedPrediction,
      threshold_used: normalizedThreshold,
      explanation_method: aiResponse.explanation_method || 'N/A',
      ai_recommendation: aiResponse.ai_recommendation || '',
      top_risk_factors: normalizeTopRiskFactors(aiResponse.top_risk_factors || aiResponse.topRiskFactors)
    };

    // =========================================================================
    // ✨ DETEKSI CERDAS KEY VARIABEL DARI FRONTEND (MENCEGAH ERROR SINKRONISASI)
    // =========================================================================
    const weightRaw = payload.weight ?? 
                      payload.Weight ?? 
                      payload.weightKg ?? 
                      payload.biometrics?.weight ?? 
                      payload.biometrics?.Weight ?? "-";

    const heightRaw = payload.height ?? 
                      payload.Height ?? 
                      payload.heightCm ?? 
                      payload.biometrics?.height ?? 
                      payload.biometrics?.Height ?? "-";

    let cleanWeight = weightRaw !== null && weightRaw !== undefined ? String(weightRaw).trim() : "-";
    let cleanHeight = heightRaw !== null && heightRaw !== undefined ? String(heightRaw).trim() : "-";

    // Jika data benar-benar kosong/corrupt barulah berikan default nilai standar
    if (cleanWeight === "-" || cleanWeight === "0") cleanWeight = "70";
    if (cleanHeight === "-" || cleanHeight === "0") cleanHeight = "165";

    const newRecord = new HealthRecord({
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()),
      biometrics: {
        age: aiPayload.Age,
        bmi: aiPayload.BMI,
        weight: cleanWeight, // Menyimpan nilai asli kiriman form secara dinamis
        height: cleanHeight  // Menyimpan nilai asli kiriman form secara dinamis
      },
      clinical: {
        highBP: aiPayload.HighBP,
        highChol: aiPayload.HighChol,
        genHlth: aiPayload.GenHlth,
        cholCheck: aiPayload.CholCheck
      },
      lifestyle: {
        hvyAlcoholConsump: aiPayload.HvyAlcoholConsump,
        physActivity: aiPayload.PhysActivity,
        smoker: aiPayload.Smoker
      },
      results: {
        diabetesRisk: normalizedResponse.probability,
        riskLevel: normalizedResponse.risk_level,
        prediction: normalizedResponse.prediction,
        thresholdUsed: normalizedResponse.threshold_used,
        explanation_method: normalizedResponse.explanation_method,
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