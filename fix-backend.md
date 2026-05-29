# Panduan Fix Backend DiaLens

Dokumen ini dibuat sebagai panduan fixing untuk junior dev berdasarkan kondisi backend saat ini.

## Ringkasan Situasi

Endpoint `POST /api/health/predict` saat ini sudah memanggil AI service lewat `src/services/predictService.js`, lalu menyimpan hasilnya ke MongoDB lewat `HealthRecord`.

Masalah utamanya bukan di pemanggilan AI, tetapi di kontrak payload dan penyimpanan data:

- Backend meneruskan `req.body` apa adanya ke AI.
- AI mengharapkan field uppercase numeric seperti `HighBP`, `GenHlth`, `HighChol`, `Age`, `BMI`.
- Backend belum melakukan mapping payload frontend ke format AI secara eksplisit.
- Backend perlu memisahkan `aiPayload` dan metadata record seperti tinggi/berat.
- Saat menyimpan record, penggunaan operator `||` membuat nilai `0` dianggap kosong.
- Beberapa field input AI belum ikut disimpan ke history, misalnya `CholCheck`, `HvyAlcoholConsump`, `PhysActivity`, dan `Smoker`.
- Frontend saat ini bisa mengirim `heightCm` dan `weightKg`, tetapi backend belum membacanya.
- Response AI perlu diparse sebagai number, karena bisa saja FastAPI mengirim angka dalam bentuk string.
- Probability perlu dijaga agar konsisten di skala `0-1`.
- Refresh token controller sudah ada, tetapi route `/api/health/refresh` belum didaftarkan.

## Kontrak AI Yang Harus Didukung

Payload yang dikirim ke AI sebaiknya selalu berbentuk seperti ini:

```json
{
  "HighBP": 0,
  "GenHlth": 1,
  "HighChol": 0,
  "Age": 7,
  "CholCheck": 0,
  "HvyAlcoholConsump": 1,
  "BMI": 30,
  "PhysActivity": 0,
  "Smoker": 0
}
```

Response AI yang diharapkan:

```json
{
  "probability": 0.108,
  "risk_level": "Low",
  "prediction": 0,
  "threshold_used": 0.45,
  "top_risk_factors": [],
  "explanation_method": "shap_kernel_runtime",
  "ai_recommendation": "..."
}
```

## Fix Prioritas 1: Bentuk Payload AI Di Backend

File utama: `src/controllers/healthController.js`

Tambahkan helper untuk membentuk payload AI dari beberapa kemungkinan format input frontend. Tujuannya supaya frontend boleh mengirim `HighBP` atau `highBP`, tetapi AI tetap menerima format uppercase numeric.

Penting: `aiPayload` hanya boleh berisi 9 field yang dibutuhkan FastAPI AI. Jangan ikut kirim metadata seperti `Weight`, `Height`, `heightCm`, atau `weightKg` ke AI service.

Isi final `aiPayload` harus hanya:

```js
{
  HighBP,
  GenHlth,
  HighChol,
  Age,
  CholCheck,
  HvyAlcoholConsump,
  BMI,
  PhysActivity,
  Smoker
}
```

Contoh implementasi:

```js
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
```

Lalu di `exports.predict`, ganti:

```js
const payload = req.body;
```

menjadi:

```js
const payload = req.body;
const aiPayload = buildAiPayload(payload);
```

Dan ganti pemanggilan AI dari:

```js
aiResponse = await predictService.getAiPrediction(payload);
```

menjadi:

```js
aiResponse = await predictService.getAiPrediction(aiPayload);
```

Dengan begitu, backend tidak bergantung penuh pada casing field dari frontend.

Kalau frontend mengirim data tambahan seperti tinggi dan berat, data itu tetap boleh diterima oleh backend, tetapi hanya dipakai untuk penyimpanan record, bukan untuk request ke FastAPI AI.

## Fix Prioritas 2: Jangan Pakai `||` Untuk Nilai Yang Bisa `0`

File utama: `src/controllers/healthController.js`

Saat ini ada kode seperti:

```js
highBP: payload.HighBP || payload.highBP || 'No'
```

Masalahnya, kalau `payload.HighBP` bernilai `0`, JavaScript menganggapnya falsy, lalu jatuh ke default `'No'`. Untuk data numeric AI, ini berbahaya.

Gunakan nullish coalescing `??`, atau lebih baik pakai `aiPayload` yang sudah dibentuk.

Contoh:

```js
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
}
```

Untuk biometrics:

```js
biometrics: {
  age: aiPayload.Age,
  weight: payload.Weight ?? payload.weight ?? payload.weightKg ?? payload.biometrics?.weight ?? payload.biometrics?.weightKg ?? null,
  height: payload.Height ?? payload.height ?? payload.heightCm ?? payload.biometrics?.height ?? payload.biometrics?.heightCm ?? null,
  bmi: aiPayload.BMI
}
```

Catatan: `weightKg` dan `heightCm` tidak masuk ke `aiPayload`. Keduanya hanya disimpan sebagai metadata record.

## Fix Prioritas 3: Simpan Semua Field Yang Dipakai AI

Model `HealthRecord` sudah punya field `clinical`, `lifestyle`, dan `biometrics` bertipe `Mixed`, jadi tidak wajib ubah schema untuk mulai menyimpan field tambahan.

Minimal field yang perlu tersimpan:

```js
biometrics: {
  age,
  bmi,
  weight,
  height
},
clinical: {
  highBP,
  highChol,
  genHlth,
  cholCheck
},
lifestyle: {
  hvyAlcoholConsump,
  physActivity,
  smoker
}
```

Ini penting supaya data history bisa merepresentasikan input yang benar-benar dipakai saat prediksi.

## Fix Prioritas 4: Normalisasi Response AI

File utama: `src/controllers/healthController.js`

Saat ini normalisasi response AI hanya menerima `probability` kalau tipenya sudah `number`:

```js
probability: typeof aiResponse.probability === 'number' ? aiResponse.probability : 0
```

Masalahnya, kalau FastAPI mengirim `"0.108"` sebagai string, backend akan menyimpan `0`.

Ubah menjadi parse number:

```js
const rawProbability = Number(aiResponse.probability);
const normalizedProbability = Number.isFinite(rawProbability) ? rawProbability : 0;
```

Lalu pakai:

```js
probability: normalizedProbability
```

Lakukan pola serupa untuk field numeric lain yang penting, misalnya:

```js
const rawPrediction = Number(aiResponse.prediction);
const rawThreshold = Number(aiResponse.threshold_used);
```

## Fix Prioritas 5: Normalisasi Probability Ke Skala `0-1`

File utama: `src/controllers/healthController.js`

Kontrak yang diinginkan adalah `probability` dalam skala `0-1`, misalnya:

```js
0.108
```

Bukan:

```js
10.8
```

atau:

```js
55
```

Tambahkan guard setelah parse number:

```js
const rawProbability = Number(aiResponse.probability);
const parsedProbability = Number.isFinite(rawProbability) ? rawProbability : 0;
const normalizedProbability = parsedProbability > 1 ? parsedProbability / 100 : parsedProbability;
```

Lalu pakai `normalizedProbability` untuk:

```js
probability: normalizedProbability
```

dan saat menyimpan record:

```js
diabetesRisk: normalizedResponse.probability
```

Dengan ini response `/predict` dan `/records` sama-sama konsisten memakai probability skala `0-1`.

## Fix Prioritas 6: Pastikan Response `/records` Jelas Untuk Frontend

Endpoint `GET /api/health/records` saat ini mengembalikan field flat dengan lowercase/camelCase:

```js
{
  id,
  date,
  age,
  weight,
  height,
  bmi,
  highBP,
  highChol,
  prediction,
  status,
  risk_level,
  diabetesRisk,
  ai_recommendation,
  topRiskFactors
}
```

Ini boleh dipertahankan. Yang penting frontend tahu bahwa:

- Payload ke `/predict` sebaiknya bisa uppercase sesuai AI, atau backend akan map otomatis.
- Response `/records` tetap lowercase/camelCase.
- Response `/predict` saat ini dibungkus di property `data`.

Contoh response backend `/predict` saat ini:

```json
{
  "message": "Prediksi berhasil diproses dan disimpan.",
  "recordId": "...",
  "data": {
    "probability": 0.108,
    "risk_level": "Low",
    "prediction": 0,
    "threshold_used": 0.45,
    "explanation_method": "shap_kernel_runtime",
    "ai_recommendation": "...",
    "top_risk_factors": []
  }
}
```

Kalau frontend ingin response `/predict` persis sama seperti response AI tanpa wrapper `data`, perlu disepakati dulu karena itu breaking change.

## Fix Prioritas 7: Tambahkan Validasi Minimal

Sebelum memanggil AI, validasi field penting agar error lebih jelas.

Contoh sederhana:

```js
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
```

Lalu di `predict`:

```js
const missingOrInvalidFields = validateAiPayload(aiPayload);

if (missingOrInvalidFields.length > 0) {
  return res.status(400).json({
    message: 'Payload prediksi tidak valid.',
    fields: missingOrInvalidFields
  });
}
```

Catatan: kalau memakai `toNumberOrDefault`, field kosong otomatis menjadi `0`. Jika ingin validasi strict, jangan langsung beri default `0` untuk semua field. Pilih salah satu sesuai kebutuhan product.

## Fix Prioritas 8: Perbaiki Fallback Predictor Untuk `Age`

File utama: `src/services/predictService.js`

Saat ini fallback predictor membaca `Age` seperti umur asli:

```js
if (age >= 45)
```

Padahal payload AI memakai `Age` sebagai kategori `1-13`, bukan umur asli. Contoh: kategori `9` kira-kira mewakili usia sekitar 60-64 tahun.

Ganti aturan fallback menjadi berbasis kategori:

```js
if (age >= 9) {
  score += 20;
  factors.push({ feature: 'Age', shap_value: 0.15, direction: 'risk' });
}
```

Jika fallback lain masih ada di `src/controllers/healthController.js`, samakan juga logikanya agar tidak ada dua aturan berbeda.

## Fix Prioritas 9: Daftarkan Route Refresh Token

File utama: `src/routes/healthRoutes.js`

Controller refresh token sudah ada di `src/controllers/authController.js`, tetapi route `/api/health/refresh` belum didaftarkan.

Tambahkan route:

```js
router.post('/refresh', authController.refresh);
```

Letakkan dekat route auth lain:

```js
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh', authController.refresh);
```

Setelah ini frontend bisa memanggil:

```txt
POST /api/health/refresh
```

dengan body:

```json
{
  "refreshToken": "..."
}
```

## Checklist Setelah Fix

- Kirim request `/api/health/predict` dengan payload uppercase numeric.
- Pastikan AI menerima field uppercase, bukan `highBP` atau `bmi`.
- Pastikan AI tidak menerima metadata seperti `heightCm`, `weightKg`, `Height`, atau `Weight`.
- Pastikan response `/predict` berisi `recordId` dan `data`.
- Pastikan record baru masuk ke MongoDB.
- Pastikan nilai `0` tetap tersimpan sebagai `0`, bukan berubah menjadi `'No'`.
- Pastikan `heightCm` dan `weightKg` tersimpan ke record sebagai `height` dan `weight`.
- Pastikan `probability` string seperti `"0.108"` tetap tersimpan sebagai `0.108`.
- Pastikan probability yang masuk `55` dinormalisasi menjadi `0.55`.
- Pastikan `/api/health/records` tetap mengembalikan `bmi`, `highBP`, `highChol`.
- Pastikan field tambahan seperti `cholCheck`, `hvyAlcoholConsump`, `physActivity`, dan `smoker` ikut tersimpan jika dibutuhkan frontend.
- Pastikan fallback predictor memakai `Age` sebagai kategori, bukan umur asli.
- Pastikan `POST /api/health/refresh` tersedia.

## Rekomendasi Urutan Kerja

1. Tambahkan helper `buildAiPayload`.
2. Ubah call AI agar memakai `aiPayload`.
3. Pastikan metadata `heightCm` dan `weightKg` hanya dipakai untuk save record.
4. Ubah penyimpanan `HealthRecord` agar memakai `aiPayload` dan `??`.
5. Tambahkan field `lifestyle` saat menyimpan record.
6. Parse response AI numeric dari number atau string.
7. Normalisasi probability ke skala `0-1`.
8. Perbaiki fallback predictor agar `Age` dibaca sebagai kategori.
9. Daftarkan route `/refresh`.
10. Test manual endpoint `/predict`.
11. Test manual endpoint `/records`.
12. Test manual endpoint `/refresh`.
13. Baru diskusikan apakah response `/predict` perlu tetap pakai wrapper `data` atau dibuat sama persis dengan response AI.
