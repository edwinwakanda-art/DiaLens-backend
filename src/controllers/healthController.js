const HealthRecord = require('../models/HealthRecord');
const { getAiPrediction } = require('../services/predictService');

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

exports.predict = async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ message: 'Payload JSON diperlukan untuk melakukan prediksi.' });
    }

    const aiResponse = await getAiPrediction(payload);

    const normalizedResponse = {
      probability: typeof aiResponse.probability === 'number' ? aiResponse.probability : Number(aiResponse.probability || 0),
      risk_level: aiResponse.risk_level || aiResponse.riskLevel || null,
      prediction: typeof aiResponse.prediction === 'number' ? aiResponse.prediction : (aiResponse.prediction === true ? 1 : aiResponse.prediction || null),
      threshold_used: typeof aiResponse.threshold_used === 'number' ? aiResponse.threshold_used : Number(aiResponse.thresholdUsed || 0.5),
      explanation_method: aiResponse.explanation_method || aiResponse.explanationMethod || 'none',
      ai_recommendation: aiResponse.ai_recommendation || aiResponse.aiRecommendation || 'Tidak ada rekomendasi dari AI.',
      top_risk_factors: normalizeTopRiskFactors(aiResponse.top_risk_factors || aiResponse.topRiskFactors || [])
    };

    // Menyimpan rekam medis ke database MongoDB dengan skema nested
    const newRecord = new HealthRecord({
      userId: req.user.id,
      biometrics: {
        Age: payload.Age,
        BMI: payload.BMI,
        weight: payload.weight,
        height: payload.height,
      },
      clinical: {
        highBP: payload.HighBP,
        highChol: payload.HighChol,
        cholCheck: payload.CholCheck,
        generalHealth: payload.GenHlth,
      },
      lifestyle: {
        physActivity: payload.PhysActivity,
        smoker: payload.Smoker,
        heavyAlcohol: payload.HvyAlcoholConsump,
      },
      results: {
        diabetesRisk: normalizedResponse.probability ? normalizedResponse.probability * 100 : null,
        riskLevel: normalizedResponse.risk_level,
        prediction: normalizedResponse.prediction,
        thresholdUsed: normalizedResponse.threshold_used,
        explanationMethod: normalizedResponse.explanation_method,
        aiRecommendation: normalizedResponse.ai_recommendation,
        topRiskFactors: normalizedResponse.top_risk_factors
      },
      date: new Date()
    });

    await newRecord.save();

    res.status(200).json(normalizedResponse);
  } catch (err) {
    console.error('❌ Error Detail:', err.message);
    res.status(500).json({
      error: 'Gagal memproses prediksi AI',
      detail: err.message
    });
  }
};

/**
 * 🛠️ FUNGSI GET RECORDS (SUDAH FIXED & LEAN)
 */
exports.getRecords = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Menggunakan .lean() agar MongoDB mengembalikan JSON mentah yang properti bersarangnya mudah dibaca
    const records = await HealthRecord.find({ userId })
      .sort({ date: -1 })
      .limit(100)
      .lean();

    if (!records || records.length === 0) {
      return res.status(200).json([]);
    }

    // Proses Flattening Data: Mengeluarkan data dari objek bersarang
    const flattenedRecords = records.map((rec) => {
      const biometrics = rec.biometrics || {};
      const results = rec.results || {};

      let currentBmi = biometrics.BMI !== undefined ? biometrics.BMI : (biometrics.bmi || 0);

      // Pengecekan ganda ekstraksi persentase risiko dari database
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
        date: rec.date || rec.createdAt,
        age: biometrics.Age || biometrics.age || '-',
        weight: biometrics.weight || '-',
        height: biometrics.height || '-',
        bmi: currentBmi,
        highBP: rec.clinical?.highBP || 'No',
        highChol: rec.clinical?.highChol || 'No',
        prediction: results.riskLevel || results.prediction || 'Low',
        status: results.prediction === 1 || results.riskLevel === 'High' ? 'Warning' : 'Safe',
        ai_recommendation: results.aiRecommendation || 'Tidak ada rekomendasi dari AI.',
        risk_level: results.riskLevel || 'Low',
        // Dilempar ke tingkat teratas objek JSON agar langsung dibaca Recharts frontend
        diabetesRisk: finalDiabetesRisk 
      };
    });

    res.status(200).json(flattenedRecords);
  } catch (err) {
    console.error('❌ Error getRecords:', err.message);
    res.status(500).json({
      error: 'Gagal mengambil riwayat kesehatan',
      detail: err.message
    });
  }
};