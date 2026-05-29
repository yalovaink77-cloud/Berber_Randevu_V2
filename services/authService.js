const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'degistir_bunu_production_da';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const VALID_ROLES = ['barber', 'customer'];

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'degistir_bunu_production_da') {
  throw new Error('Production ortamında JWT_SECRET zorunludur');
}

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+90' + cleaned.substring(1);
  } else if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    cleaned = '+90' + cleaned;
  } else if (!cleaned.startsWith('+') && cleaned.startsWith('90') && cleaned.length === 12) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

async function register({ name, phone, email, password, role = 'customer' }) {
  const normPhone = normalizePhoneNumber(phone);
  if (!VALID_ROLES.includes(role)) {
    const err = new Error('Geçersiz kullanıcı rolü');
    err.status = 400;
    throw err;
  }

  if (
    role === 'barber' &&
    process.env.NODE_ENV === 'production' &&
    String(process.env.ALLOW_BARBER_REGISTRATION || 'false').toLowerCase() !== 'true'
  ) {
    const err = new Error('Berber kaydı production ortamında kapalı');
    err.status = 403;
    throw err;
  }

  const existing = await User.findOne({ phone: normPhone });
  if (existing) {
    const err = new Error('Bu telefon numarası zaten kayıtlı');
    err.status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ id: uuidv4(), name, phone: normPhone, email, passwordHash, role });
  const token = generateToken(user);
  return { user: sanitize(user), token };
}

async function login({ phone, password }) {
  const normPhone = normalizePhoneNumber(phone);
  // Raw MongoDB sorgusu - Mongoose model filtrelerini bypass eder
  const raw = await User.collection.findOne({ phone: normPhone });
  if (!raw || !raw.passwordHash) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }
  const valid = await bcrypt.compare(password, raw.passwordHash);
  if (!valid) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }
  const token = generateToken(raw);
  delete raw.passwordHash;
  delete raw.__v;
  return { user: raw, token };
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

module.exports = { register, login, verifyToken, sanitize };
