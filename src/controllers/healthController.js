const mongoose = require('mongoose');

let HealthRecord;
try {
  HealthRecord = require('../models/HealthRecord');
} catch (e) {
  console.error("❌ Gagal me-require model HealthRecord:", e);
}

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

function ageToCategory(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (num >= 1 && num <= 13) return num;
  if (num < 18) return 0;
  if (num <= 24) return 1;
  if (num <= 29) return 2;
  if (num <= 34) return 3;
  if (num <= 39) return 4;
  if (num <= 44) return 5;
  if (num <= 49) return 6;
  if (num <= 54) return 7;
  if (num <= 59) return 8;
  if (num <= 64) return 9;
  if (num <= 69) return 10;
  if (num <= 74) return 11;
  if (num <= 79) return 12;
  return 13;
}

function buildAiPayload(payload) {
  return {
    HighBP: toNumberOrDefault(pickValue(payload, 'HighBP', 'highBP', 'clinical')),
    GenHlth: toNumberOrDefault(pickValue(payload, 'GenHlth', 'genHlth', 'clinical'), 1),
    HighChol: toNumberOrDefault(pickValue(payload, 'HighChol', 'highChol', 'clinical')),
    Age: ageToCategory(pickValue(payload, 'Age', 'age', 'biometrics')),
    CholCheck: toNumberOrDefault(pickValue(payload, 'CholCheck', 'cholCheck', 'clinical')),
    HvyAlcoholConsump: toNumberOrDefault(pickValue(payload, 'HvyAlcoholConsump', 'hvyAlcoholConsump', 'lifestyle')),
    BMI: toNumberOrDefault(pickValue(payload, 'BMI', 'bmi', 'biometrics'), 22),
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

// ==========================================================
// 🚀 ENDPOINT GET RECORDS
// ==========================================================
exports.getRecords = async (req, res) => {
  try {
    let rawUserId = null;
    if (req.user) rawUserId = req.user.id || req.user._id || req.user.userId;
    if (!rawUserId) return res.status(401).json({ message: 'Akses ditolak.' });

    const records = await HealthRecord.find({ 
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()) 
    }).sort({ date: -1 });

    const formattedRecords = records.map(record => {
      const biometrics = record.biometrics || {};
      const results = record.results || {};
      const statusText = results.prediction === 1 ? 'Diabetes Terdeteksi' : 'Aman / Normal';

      return {
        id: record._id.toString(),
        date: record.date,
        age: String(biometrics.age ?? '-'),
        weight: String(biometrics.weight ?? '-'),
        height: String(biometrics.height ?? '-'),
        bmi: String(biometrics.bmi ?? '-'),
        highBP: String(record.clinical?.highBP === 1 ? 'Ya' : 'Tidak'),
        highChol: String(record.clinical?.highChol === 1 ? 'Ya' : 'Tidak'),
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
    return res.status(500).json({ message: 'Gagal mengambil data.', detail: err.message });
  }
};

// ==========================================================
// 🚀 ENDPOINT POST PREDICT
// ==========================================================
exports.predict = async (req, res) => {
  try {
    let rawUserId = null;
    if (req.user) rawUserId = req.user.id || req.user._id || req.user.userId;
    if (!rawUserId) return res.status(401).json({ message: 'Akses ditolak.' });

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
      aiResponse = predictService.getAiPredictionFromFallback(aiPayload);
    }

    const rawProbability = Number(aiResponse.probability);
    const parsedProbability = Number.isFinite(rawProbability) ? rawProbability : 0;
    const normalizedProbability = parsedProbability > 1 ? parsedProbability / 100 : parsedProbability;

    const normalizedResponse = {
      probability: normalizedProbability,
      risk_level: aiResponse.risk_level || 'Unknown',
      prediction: Number(aiResponse.prediction) || 0,
      threshold_used: Number(aiResponse.threshold_used) || 0.5,
      explanation_method: aiResponse.explanation_method || 'N/A',
      ai_recommendation: aiResponse.ai_recommendation || '',
      top_risk_factors: aiResponse.top_risk_factors || []
    };

    // ✨ AMBIL DATA BB & TB DARI HTTP HEADERS (PAYLOAD UTAMA TETAP 9 DATA AMAN)
    const weightRaw = req.headers['x-user-weight'];
    const heightRaw = req.headers['x-user-height'];

    const cleanWeight = (weightRaw !== null && weightRaw !== undefined) ? String(weightRaw).trim() : "-";
    const cleanHeight = (heightRaw !== null && heightRaw !== undefined) ? String(heightRaw).trim() : "-";

    const newRecord = new HealthRecord({
      userId: new mongoose.Types.ObjectId(String(rawUserId).trim()),
      biometrics: {
        age: aiPayload.Age,
        bmi: aiPayload.BMI,
        weight: cleanWeight, 
        height: cleanHeight  
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
    console.error("❌ Error:", err);
    return res.status(500).json({ message: 'Gagal memproses.', error: err.message });
  }
};