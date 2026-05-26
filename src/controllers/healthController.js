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
      prediction: typeof aiResponse.prediction === 'number' ? aiResponse.prediction : (aiResponse.prediction === true ? 1 : aiResponse.prediction === false ? 0 : Number(aiResponse.prediction ?? 0)),
      threshold_used: typeof aiResponse.threshold_used === 'number' ? aiResponse.threshold_used : typeof aiResponse.thresholdUsed === 'number' ? aiResponse.thresholdUsed : null,
      top_risk_factors: normalizeTopRiskFactors(aiResponse.top_risk_factors || aiResponse.topRiskFactors || []),
      explanation_method: aiResponse.explanation_method || aiResponse.explanationMethod || null,
      ai_recommendation: aiResponse.ai_recommendation || aiResponse.aiRecommendation || null
    };

    const newRecord = new HealthRecord({
      userId: req.user.id,
      biometrics: {
        Age: payload.Age,
        BMI: payload.BMI,
        height: payload.height,
        weight: payload.weight,
        HighBP: payload.HighBP,
        HighChol: payload.HighChol,
        CholCheck: payload.CholCheck,
        GenHlth: payload.GenHlth,
        HvyAlcoholConsump: payload.HvyAlcoholConsump,
        PhysActivity: payload.PhysActivity,
        Smoker: payload.Smoker,
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

exports.getRecords = async (req, res) => {
  try {
    const userId = req.user.id;
    const records = await HealthRecord.find({ userId }).sort({ date: -1 }).limit(100);
    res.json({ records });
  } catch (err) {
    console.error('Error fetching records:', err.message);
    res.status(500).json({ message: 'Gagal mengambil riwayat kesehatan', detail: err.message });
  }
};