# DiaLens Backend

Backend API untuk aplikasi DiaLens — platform skrining risiko diabetes berbasis AI.

## Tech Stack

- **Runtime:** Node.js (CommonJS)
- **Framework:** Express.js v5
- **Database:** MongoDB (Mongoose v9)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **AI Service:** FastAPI external service + heuristic fallback
- **Deploy:** Vercel / Railway

## Project Structure

```
src/
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   └── healthController.js
├── middleware/
│   └── authMiddleware.js
├── models/
│   ├── User.js
│   ├── HealthRecord.js
│   └── Advice.js
├── routes/
│   ├── authRoutes.js
│   └── healthRoutes.js
├── services/
│   └── predictService.js
└── server.js
```

## Environment Variables

Buat file `.env` di root project:

```env
MONGO_URI=mongodb://127.0.0.1:27017/dialens
JWT_SECRET=your_secret_key
AI_PREDICT_URL=https://ai-api-dialens-production.up.railway.app/
AI_REQUEST_TIMEOUT_MS=60000
AI_CACHE_TTL_SECONDS=60
AI_PREDICT_SCALAR=false
PORT=5000
```

## Install & Run

```bash
npm install
npm run dev
```

Server berjalan di `http://localhost:5000`.

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/health/register` | - | Register user baru |
| POST | `/api/health/login` | - | Login, dapat token |
| POST | `/api/health/refresh` | - | Refresh access token |

### Health Prediction

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/health/predict` | Bearer | Prediksi risiko diabetes |
| GET | `/api/health/records` | Bearer | Ambil riwayat prediksi |
| DELETE | `/api/health/records/:id` | Bearer | Hapus satu record |

### Request Predict

```json
POST /api/health/predict
Authorization: Bearer <token>
x-user-weight: 70
x-user-height: 170

{
  "HighBP": 0,
  "HighChol": 0,
  "GenHlth": 1,
  "Age": 25,
  "CholCheck": 1,
  "HvyAlcoholConsump": 0,
  "BMI": 22,
  "PhysActivity": 1,
  "Smoker": 0
}
```

Backend otomatis mapping field dari frontend ke format AI (uppercase numeric) dan konversi umur asli ke kategori 1-13.

### Response Predict

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

## Seed Data

```bash
node seed.js
```
