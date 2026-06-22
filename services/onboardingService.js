const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Business = require('../models/Business');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Service = require('../models/Service');
const authService = require('./authService');
const subscriptionService = require('./subscriptionService');
const DatabaseService = require('./databaseService');

const VALID_BUSINESS_TYPES = ['berber', 'kuafor', 'guzellik_merkezi'];

function slugify(value) {
  const trMap = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  };
  let str = String(value || '');
  for (const key of Object.keys(trMap)) {
    str = str.replace(new RegExp(key, 'g'), trMap[key]);
  }
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function validateInput(data) {
  const err = new Error('Geçersiz kayıt verisi');
  err.status = 400;
  err.details = [];

  if (!data || typeof data !== 'object') {
    err.details.push('İstek gövdesi gerekli');
    throw err;
  }

  const ownerName = String(data.ownerName || '').trim();
  const ownerPhone = data.ownerPhone;
  const password = data.password;
  const businessName = String(data.businessName || '').trim();
  const businessType = String(data.businessType || '').trim();

  if (!ownerName) err.details.push('ownerName zorunlu');
  if (!ownerPhone) err.details.push('ownerPhone zorunlu');
  if (!password) err.details.push('password zorunlu');
  if (!businessName) err.details.push('businessName zorunlu');
  if (!businessType) err.details.push('businessType zorunlu');
  if (password && password.length < 8) err.details.push('password en az 8 karakter olmalı');
  if (businessType && !VALID_BUSINESS_TYPES.includes(businessType)) {
    err.details.push(`businessType şunlardan biri olmalı: ${VALID_BUSINESS_TYPES.join(', ')}`);
  }

  if (err.details.length) throw err;

  return {
    ownerName,
    ownerPhone,
    ownerEmail: data.ownerEmail ? String(data.ownerEmail).trim().toLowerCase() : undefined,
    password,
    businessName,
    businessType,
    city: data.city ? String(data.city).trim() : '',
  };
}

async function generateUniqueSlug(businessName, city) {
  const baseParts = [slugify(businessName)];
  if (city) baseParts.push(slugify(city));
  const base = baseParts.filter(Boolean).join('-') || `business-${Date.now()}`;

  let candidate = base;
  let suffix = 2;
  while (await Business.findOne({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function rollbackOnboarding({ businessId, userId }) {
  if (businessId) {
    await Service.deleteMany({ businessId: String(businessId) });
    await Subscription.deleteMany({ businessId: String(businessId) });
    await Business.deleteOne({ id: String(businessId) });
  }
  if (userId) {
    await User.deleteOne({ id: String(userId) });
  }
}

/**
 * Self-service işletme kaydı — Business, owner User, trial Subscription, default services.
 */
async function registerBusiness(data) {
  const input = validateInput(data);
  const normPhone = authService.normalizePhoneNumber(input.ownerPhone);

  const existingUser = await User.findOne({ phone: normPhone });
  if (existingUser) {
    const err = new Error('Bu telefon numarası zaten kayıtlı');
    err.status = 409;
    throw err;
  }

  const businessId = uuidv4();
  const userId = uuidv4();
  let userCreated = false;

  try {
    const slug = await generateUniqueSlug(input.businessName, input.city);

    await Business.create({
      id: businessId,
      name: input.businessName,
      slug,
      businessType: input.businessType,
      city: input.city,
      status: 'active',
    });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
      id: userId,
      name: input.ownerName,
      phone: normPhone,
      email: input.ownerEmail,
      passwordHash,
      role: 'barber',
      businessId,
      businessName: input.businessName,
      assistantStatus: 'working',
    });
    userCreated = true;

    await subscriptionService.createTrialSubscription(businessId);
    await DatabaseService.seedDefaultServicesForBusiness(businessId, input.businessType);

    return { user };
  } catch (error) {
    if (userCreated || businessId) {
      await rollbackOnboarding({ businessId, userId });
    }
    throw error;
  }
}

module.exports = {
  registerBusiness,
  validateInput,
  generateUniqueSlug,
  slugify,
};
