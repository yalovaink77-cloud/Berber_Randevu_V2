const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const authService = require('./authService');
const { requireBusinessId, withBusinessId } = require('../utils/tenant');

function sanitizeCustomer(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.__v;
  return {
    id: obj.id,
    businessId: obj.businessId,
    name: obj.name,
    phone: obj.phone,
    email: obj.email || null,
    notes: obj.notes || null,
    linkedUserId: obj.linkedUserId || null,
    source: obj.source || 'manual',
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function assertValidPhone(normPhone) {
  if (!normPhone) {
    const err = new Error('Geçerli bir telefon numarası gerekli');
    err.status = 400;
    throw err;
  }
}

function assertValidName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) {
    const err = new Error('Müşteri adı en az 2 karakter olmalı');
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Tenant scope içinde telefona göre müşteri bulur; yoksa oluşturur.
 * Telefon authService.normalizePhoneNumber ile normalize edilir.
 */
async function findOrCreateCustomer(businessId, data = {}) {
  const tenantId = requireBusinessId(businessId);
  const name = assertValidName(data.name);
  const normPhone = authService.normalizePhoneNumber(data.phone);
  assertValidPhone(normPhone);

  let customer = await Customer.findOne(
    withBusinessId(tenantId, { phone: normPhone })
  );

  if (customer) {
    return { customer: sanitizeCustomer(customer), created: false };
  }

  customer = await Customer.create({
    id: uuidv4(),
    businessId: tenantId,
    name,
    phone: normPhone,
    email: data.email ? String(data.email).trim().toLowerCase() : undefined,
    notes: data.notes ? String(data.notes).trim() : undefined,
    linkedUserId: data.linkedUserId ? String(data.linkedUserId) : undefined,
    source: data.source || 'manual',
  });

  return { customer: sanitizeCustomer(customer), created: true };
}

async function getCustomerById(businessId, customerId) {
  const tenantId = requireBusinessId(businessId);
  if (!customerId) return null;

  const customer = await Customer.findOne(
    withBusinessId(tenantId, { id: String(customerId) })
  );
  return sanitizeCustomer(customer);
}

async function getCustomerByPhone(businessId, phone) {
  const tenantId = requireBusinessId(businessId);
  const normPhone = authService.normalizePhoneNumber(phone);
  if (!normPhone) return null;

  const customer = await Customer.findOne(
    withBusinessId(tenantId, { phone: normPhone })
  );
  return sanitizeCustomer(customer);
}

module.exports = {
  findOrCreateCustomer,
  getCustomerById,
  getCustomerByPhone,
  sanitizeCustomer,
};
