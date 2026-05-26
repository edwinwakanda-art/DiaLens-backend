const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.header('Authorization') || req.header('authorization');

  if (!authHeader) {
    console.warn('authMiddleware: missing Authorization header from', req.ip || req.hostname || req.headers.host);
    return res.status(401).json({ message: 'Akses ditolak! Silakan login terlebih dahulu.' });
  }

  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

  try {
    const secretKey = process.env.JWT_SECRET || 'super_secret_key_2026';
    const verified = jwt.verify(token, secretKey);
    req.user = verified; // attach decoded payload
    next();
  } catch (err) {
    // Log details on server for debugging
    console.error('authMiddleware: token verification failed:', err && err.message ? err.message : err);
    // Return 401 with optional detail in non-production
    const response = { message: 'Token tidak valid' };
    if (process.env.NODE_ENV !== 'production') response.detail = err && err.message ? err.message : String(err);
    return res.status(401).json(response);
  }
};