const Business = require('../models/Business');
const User = require('../models/User');
const authService = require('./authService');
const { requireBusinessId } = require('../utils/tenant');

const VALID_BUSINESS_TYPES = ['berber', 'kuafor', 'guzellik_merkezi'];

function validateUpdateInput(data) {
  if (!data || typeof data !== 'object') {
    const err = new Error('Geçersiz istek verisi');
    err.status = 400;
    err.details = ['İstek gövdesi gerekli'];
    throw err;
  }

  const err = new Error('Geçersiz istek verisi');
  err.status = 400;
  err.details = [];
  const payload = {};

  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (name.length < 2) {
      err.details.push('name en az 2 karakter olmalı');
    } else {
      payload.name = name;
    }
  }

  if (data.city !== undefined) {
    payload.city = String(data.city).trim();
  }

  if (data.businessType !== undefined) {
    const businessType = String(data.businessType).trim();
    if (!VALID_BUSINESS_TYPES.includes(businessType)) {
      err.details.push(`businessType şunlardan biri olmalı: ${VALID_BUSINESS_TYPES.join(', ')}`);
    } else {
      payload.businessType = businessType;
    }
  }

  if (Object.keys(payload).length === 0) {
    err.details.push('En az bir alan gerekli (name, city, businessType)');
  }

  if (err.details.length) throw err;
  return payload;
}

async function getMyBusiness(businessId) {
  const id = requireBusinessId(businessId);
  const business = await authService.getBusinessSummary(id);
  if (!business) {
    const err = new Error('İşletme bulunamadı');
    err.status = 404;
    throw err;
  }
  return business;
}

async function updateMyBusiness(businessId, userId, data) {
  const id = requireBusinessId(businessId);
  const payload = validateUpdateInput(data);

  const existing = await Business.findOne({ id });
  if (!existing) {
    const err = new Error('İşletme bulunamadı');
    err.status = 404;
    throw err;
  }

  await Business.findOneAndUpdate(
    { id },
    { $set: { ...payload, updatedAt: new Date() } }
  );

  if (payload.name && userId) {
    await User.findOneAndUpdate(
      { id: userId, businessId: id },
      { $set: { businessName: payload.name, updatedAt: new Date() } }
    );
  }

  return getMyBusiness(id);
}

module.exports = {
  getMyBusiness,
  updateMyBusiness,
  validateUpdateInput,
  VALID_BUSINESS_TYPES,
};
