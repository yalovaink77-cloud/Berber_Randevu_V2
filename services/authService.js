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
  if (phone == null || phone === '') return '';

  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('90') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return '+90' + digits;
  }

  return '';
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

  return buildAuthResponse(user, { includeToken: true });
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

  return buildAuthResponse(user, { includeToken: true });
}

/**
 * Auth endpoint'leri için standart yanıt gövdesi.
 * user: sanitize edilmiş kullanıcı
 * business / subscription / tenant: berber + businessId varsa dolar
 * token: includeToken true ise eklenir
 */
async function buildAuthResponse(user, { includeToken = false } = {}) {
  const sanitized = sanitize(user);
  let business = null;
  let subscription = null;

  if (sanitized.role === 'barber' && sanitized.businessId) {
    business = await getBusinessSummary(sanitized.businessId);
    const subscriptionService = require('./subscriptionService');
    subscription = await subscriptionService.getSubscriptionSummary(sanitized.businessId);
  }

  const response = {
    user: sanitized,
    business,
    subscription,
    tenant: business ? { businessId: business.id } : null,
  };

  if (includeToken) {
    response.token = generateToken(user);
  }

  return response;
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
    city: obj.city || '',
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

module.exports = {
  register,
  login,
  verifyToken,
  sanitize,
  getBusinessSummary,
  normalizePhoneNumber,
  generateToken,
  buildAuthResponse,
};
