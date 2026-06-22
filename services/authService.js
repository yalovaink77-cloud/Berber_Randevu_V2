const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const VALID_ROLES = ['barber', 'customer'];

// JWT_SECRET zorunlu — her ortamda
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET tanımlı değil veya çok kısa (en az 32 karakter). ' +
    '.env dosyanızı kontrol edin.'
  );
}

// Barber kaydına ortam kontrolü
const ALLOW_BARBER_REGISTRATION =
  String(process.env.ALLOW_BARBER_REGISTRATION || 'false').toLowerCase() === 'true';

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
  if (!VALID_ROLES.includes(role)) {
    const err = new Error('Geçersiz kullanıcı rolü');
    err.status = 400;
    throw err;
  }

  if (role === 'barber' && !ALLOW_BARBER_REGISTRATION) {
    const err = new Error('Berber kaydı şu an kapalı');
    err.status = 403;
    throw err;
  }

  if (!password || password.length < 8) {
    const err = new Error('Şifre en az 8 karakter olmalı');
    err.status = 400;
    throw err;
  }

  const normPhone = normalizePhoneNumber(phone);
  const existing = await User.findOne({ phone: normPhone });
  if (existing) {
    const err = new Error('Bu telefon numarası zaten kayıtlı');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    id: uuidv4(),
    name,
    phone: normPhone,
    email,
    passwordHash,
    role,
  });

  const token = generateToken(user);
  return { user: sanitize(user), token };
}

async function login({ phone, password }) {
  const normPhone = normalizePhoneNumber(phone);

  // Mongoose modeli üzerinden sorgula (hook'lar ve middleware devrede kalır)
  const user = await User.findOne({ phone: normPhone }).select('+passwordHash');
  if (!user || !user.passwordHash) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }

  const token = generateToken(user);

  let business = null;
  let subscription = null;
  if (user.role === 'barber' && user.businessId) {
    business = await getBusinessSummary(user.businessId);
    const subscriptionService = require('./subscriptionService');
    subscription = await subscriptionService.getSubscriptionSummary(user.businessId);
  }

  return { user: sanitize(user), token, business, subscription };
}

async function getBusinessSummary(businessId) {
  if (!businessId) return null;
  const Business = require('../models/Business');
  const business = await Business.findOne({ id: businessId });
  if (!business) return null;

  const obj = business.toObject ? business.toObject() : { ...business };
  return {
    id: obj.id,
    name: obj.name,
    slug: obj.slug,
    businessType: obj.businessType,
    status: obj.status,
  };
}

function generateToken(user) {
  const payload = {
    id: user.id || user._id,
    role: user.role,
    phone: user.phone,
  };
  if (user.businessId) {
    payload.businessId = String(user.businessId);
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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

module.exports = { register, login, verifyToken, sanitize, getBusinessSummary };
