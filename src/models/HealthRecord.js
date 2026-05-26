const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  biometrics: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  clinical: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lifestyle: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  results: {
    diabetesRisk: Number, // [cite: 14]
    riskLevel: String,
    prediction: Number,
    thresholdUsed: Number,
    explanationMethod: String,
    aiRecommendation: String,
    topRiskFactors: [
      {
        feature: String,
        shap_value: Number,
        direction: String
      }
    ]
  }
});

module.exports = mongoose.model('HealthRecord', healthRecordSchema);