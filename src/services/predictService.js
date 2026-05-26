const https = require('https');
const http = require('http');
const { URL } = require('url');

// Simple in-memory cache to speed up identical requests (short TTL)
const cache = new Map(); // key -> { ts, value }
const CACHE_TTL = Number(process.env.AI_CACHE_TTL_SECONDS) || 60; // seconds

function setCache(key, value) {
  cache.set(key, { ts: Date.now(), value });
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.ts) / 1000 > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function fallbackPredict(payload) {
  // Lightweight heuristic fallback: combine age, bmi, and bloodSugar
  const age = Number(payload.Age || payload.age || payload.biometrics?.age || 0);
  const bmi = Number(payload.BMI || payload.bmi || payload.biometrics?.bmi || 0);
  const sugar = Number(payload.bloodSugar || payload.clinical?.bloodSugar || 0);

  let score = 0;
  const factors = [];
  if (age >= 45) {
    score += 20;
    factors.push({ feature: 'Age', shap_value: 0.15, direction: 'risk' });
  }
  if (bmi >= 30) {
    score += 30;
    factors.push({ feature: 'BMI', shap_value: 0.25, direction: 'risk' });
  }
  if (sugar >= 140) {
    score += 40; // elevated fasting glucose
    factors.push({ feature: 'bloodSugar', shap_value: 0.40, direction: 'risk' });
  }
  if (factors.length === 0) {
    factors.push({ feature: 'GenHlth', shap_value: -0.12, direction: 'protective' });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    probability: score / 100,
    risk_level: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
    prediction: score >= 50 ? 1 : 0,
    threshold_used: 0.45,
    top_risk_factors: factors,
    explanation_method: 'heuristic_fallback',
    ai_recommendation: 'Gunakan hasil ini sebagai indikasi cepat; lakukan pemeriksaan lengkap jika risiko tinggi.'
  };
}

function postJson(url, payload, opts = {}) {
  const timeoutMs = opts.timeoutMs || Number(process.env.AI_REQUEST_TIMEOUT_MS) || 3000;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const payloadString = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString)
      }
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`AI Prediction API returned status ${res.statusCode}: ${body}`));
        }

        try {
          const json = JSON.parse(body || '{}');
          resolve(json);
        } catch (error) {
          reject(new Error(`Invalid JSON from AI Prediction API: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('AI Prediction API request timed out'));
    });
    req.write(payloadString);
    req.end();
  });
}

exports.getAiPrediction = async (payload) => {
  const envUrl = process.env.AI_PREDICT_URL || 'https://ai-api-dialens-production.up.railway.app';
  const path = process.env.AI_PREDICT_SCALAR === 'true' ? '/scalar' : '/predict';
  const aiUrl = envUrl.includes('/predict') || envUrl.includes('/scalar')
    ? envUrl
    : `${envUrl.replace(/\/$/, '')}${path}`;

  const cacheKey = JSON.stringify(payload || {});

  // return cached if available
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const resp = await postJson(aiUrl, payload, { timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 3000 });
    setCache(cacheKey, resp);
    return resp;
  } catch (err) {
    // Log and return heuristic fallback for speed/robustness
    console.error('AI service error, using fallback predictor:', err.message);
    const fb = fallbackPredict(payload);
    setCache(cacheKey, fb);
    return fb;
  }
};
