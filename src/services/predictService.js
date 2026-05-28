const https = require('https');
const http = require('http');
const { URL } = require('url');

const cache = new Map();
const CACHE_TTL = Number(process.env.AI_CACHE_TTL_SECONDS) || 60;

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

/**
 * Heuristic Fallback Predictor
 * Fix Prioritas 8: Menggunakan Age sebagai kategori (1-13) bukan umur asli.
 */
function fallbackPredict(payload) {
  const age = Number(payload.Age ?? payload.age ?? payload.biometrics?.age ?? 0);
  const bmi = Number(payload.BMI ?? payload.bmi ?? payload.biometrics?.bmi ?? 0);
  // Hilangkan variabel sugar karena tidak ada di spesifikasi kontrak 9 field AI utama

  let score = 0;
  const factors = [];

  // Jika kategori usia >= 9 (Setara umur 60-64 tahun ke atas)
  if (age >= 9) {
    score += 20;
    factors.push({ feature: 'Age', shap_value: 0.15, direction: 'risk' });
  }
  if (bmi >= 30) {
    score += 30;
    factors.push({ feature: 'BMI', shap_value: 0.25, direction: 'risk' });
  }
  
  if (factors.length === 0) {
    factors.push({ feature: 'GenHlth', shap_value: -0.12, direction: 'protective' });
  }

  score = Math.max(0, Math.min(100, score));
  const riskLevel = score >= 50 ? 'High' : score >= 20 ? 'Medium' : 'Low';

  let recommendationsText = '';
  if (riskLevel === 'High') {
    recommendationsText = `*Interpretasi hasil* \nHasil analisis cepat mendeteksi indikasi tingkat risiko **High**. Berdasarkan kombinasi usia dan parameter fisik, diperlukan perhatian khusus. \n\n*3 langkah konkret untuk minggu ini* \n1. **Batasi Karbohidrat** – Kurangi porsi nasi putih dan singkirkan makanan/minuman manis olahan. \n2. **Kardio Terukur** – Lakukan jalan cepat atau olahraga ringan selama 30 menit setiap hari. \n3. **Konsultasi Formal** – Segera jadwalkan pemeriksaan laboratorium HbA1c ke fasilitas kesehatan terdekat.`;
  } else if (riskLevel === 'Medium') {
    recommendationsText = `*Interpretasi hasil* \nHasil analisis cepat berada pada level **Medium**. Anda disarankan untuk mulai mengontrol gaya hidup secara lebih disiplin. \n\n*3 langkah konkret untuk minggu ini* \n1. **Kurangi Camilan Malam** – Batasi konsumsi makanan berat atau camilan tinggi gula menjelang waktu tidur. \n2. **Kelola Waktu Istirahat** – Pastikan tidur malam berkualitas selama 7-8 jam untuk stabilitas metabolisme. \n3. **Tingkatkan Serat** – Perbanyak porsi sayur berdaun hijau di setiap menu makanan utama Anda.`;
  } else {
    recommendationsText = `*Interpretasi hasil* \nHasil analisis cepat menunjukkan tingkat risiko **Low**. Kondisi metabolisme tubuh Anda relatif stabil. \n\n*3 langkah konkret untuk minggu ini* \n1. **Pertahankan Hidrasi** – Minum air putih minimal 2 hingga 2,5 Liter secara konsisten setiap hari. \n2. **Aktivitas Fisik Rutin** – Upayakan berjalan kaki 30 menit setelah makan siang atau makan malam. \n3. **Skrining Berkala** – Lakukan pengecekan kesehatan mandiri secara berkala di DiaLens untuk memantau tren tubuh.`;
  }

  return {
    probability: score / 100,
    risk_level: riskLevel,
    prediction: score >= 40 ? 1 : 0,
    threshold_used: 0.45,
    top_risk_factors: factors,
    explanation_method: 'heuristic_fallback',
    ai_recommendation: recommendationsText
  };
}

// Export agar bisa dipanggil secara aman dari catch block healthController
exports.getAiPredictionFromFallback = (payload) => {
  return fallbackPredict(payload);
};

function postJson(url, payload, opts = {}) {
  const timeoutMs = opts.timeoutMs || Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60000;

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
  const envUrl = process.env.AI_PREDICT_URL || 'https://ai-api-dialens-production.up.railway.app/';
  const path = process.env.AI_PREDICT_SCALAR === 'true' ? '/scalar' : '/predict';
  const aiUrl = envUrl.includes('/predict') || envUrl.includes('/scalar')
    ? envUrl
    : `${envUrl.replace(/\/$/, '')}${path}`;

  const cacheKey = JSON.stringify(payload || {});

  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const resp = await postJson(aiUrl, payload, { timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60000 });
    setCache(cacheKey, resp);
    return resp;
  } catch (err) {
    console.error('AI service error, using fallback predictor:', err.message);
    const fb = fallbackPredict(payload);
    setCache(cacheKey, fb);
    return fb;
  }
};