const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Email atau Password salah" });
    }

    // Gunakan fallback key jika process.env.JWT_SECRET kosong
    const secretKey = process.env.JWT_SECRET || 'super_secret_key_2026';

    const token = jwt.sign({ id: user._id }, secretKey, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user._id }, secretKey, { expiresIn: '7d' });

    // simpan refresh token untuk user ini
    user.refreshToken = refreshToken;
    await user.save();

    res.json({ token, refreshToken, user: { id: user._id, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.register = async (req, res) => {
  try {
    // PERBAIKAN: Mengambil data nama baik dari properti 'name' ataupun 'fullName' yang dikirim frontend
    const name = req.body.name || req.body.fullName;
    const { email, password } = req.body;

    // Validasi kelengkapan data input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nama, email, dan password diperlukan' });
    }

    // Cek apakah email sudah terdaftar sebelumnya
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email sudah terdaftar' });
    }

    // Enkripsi password menggunakan bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    // Membuat instance user baru dan menyimpannya ke database MongoDB
    const user = new User({ name, email, password: hashed });
    await user.save();

    // Pembuatan JWT Token setelah sukses mendaftar
    const secretKey = process.env.JWT_SECRET || 'super_secret_key_2026';
    const token = jwt.sign({ id: user._id }, secretKey, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user._id }, secretKey, { expiresIn: '7d' });

    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({ token, refreshToken, user: { id: user._id, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'refreshToken diperlukan' });

    const secretKey = process.env.JWT_SECRET || 'super_secret_key_2026';
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, secretKey);
    } catch (err) {
      return res.status(401).json({ message: 'Refresh token tidak valid', detail: err.message });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token tidak cocok' });
    }

    const newToken = jwt.sign({ id: user._id }, secretKey, { expiresIn: '1d' });
    const newRefresh = jwt.sign({ id: user._id }, secretKey, { expiresIn: '7d' });

    user.refreshToken = newRefresh;
    await user.save();

    res.json({ token: newToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(500).json({ message: 'Gagal refresh token', detail: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res.json({ message: 'Logout berhasil' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal logout', detail: err.message });
  }
};