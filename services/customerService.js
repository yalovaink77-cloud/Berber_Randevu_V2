const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const Appointment = require('../models/Appointment');
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

async function listCustomers(businessId, { q, limit = 100 } = {}) {
  const tenantId = requireBusinessId(businessId);
  const filter = withBusinessId(tenantId, {});

  if (q) {
    const term = String(q).trim();
    if (term) {
      const normPhone = authService.normalizePhoneNumber(term);
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        ...(normPhone ? [{ phone: normPhone }] : []),
      ];
    }
  }

  const rows = await Customer.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 200));

  return rows.map((row) => sanitizeCustomer(row));
}

async function createCustomer(businessId, data = {}) {
  const tenantId = requireBusinessId(businessId);
  const name = assertValidName(data.name);
  const normPhone = authService.normalizePhoneNumber(data.phone);
  assertValidPhone(normPhone);

  const existing = await Customer.findOne(
    withBusinessId(tenantId, { phone: normPhone })
  );
  if (existing) {
    const err = new Error('Bu telefon numarası bu işletmede zaten kayıtlı');
    err.status = 409;
    throw err;
  }

  const customer = await Customer.create({
    id: uuidv4(),
    businessId: tenantId,
    name,
    phone: normPhone,
    email: data.email ? String(data.email).trim().toLowerCase() : undefined,
    notes: data.notes ? String(data.notes).trim() : undefined,
    source: data.source || 'manual',
  });

  return sanitizeCustomer(customer);
}

async function updateCustomer(businessId, customerId, data = {}) {
  const tenantId = requireBusinessId(businessId);
  if (!customerId) {
    const err = new Error('Müşteri bulunamadı');
    err.status = 404;
    throw err;
  }

  const existing = await Customer.findOne(
    withBusinessId(tenantId, { id: String(customerId) })
  );
  if (!existing) {
    const err = new Error('Müşteri bulunamadı');
    err.status = 404;
    throw err;
  }

  const err = new Error('Geçersiz istek verisi');
  err.status = 400;
  err.details = [];
  const payload = {};

  if (data.name !== undefined) {
    payload.name = assertValidName(data.name);
  }

  if (data.phone !== undefined) {
    const normPhone = authService.normalizePhoneNumber(data.phone);
    assertValidPhone(normPhone);
    if (normPhone !== existing.phone) {
      const duplicate = await Customer.findOne(
        withBusinessId(tenantId, { phone: normPhone })
      );
      if (duplicate && duplicate.id !== existing.id) {
        const dupErr = new Error('Bu telefon numarası bu işletmede zaten kayıtlı');
        dupErr.status = 409;
        throw dupErr;
      }
    }
    payload.phone = normPhone;
  }

  if (data.email !== undefined) {
    payload.email = data.email ? String(data.email).trim().toLowerCase() : null;
  }

  if (data.notes !== undefined) {
    payload.notes = String(data.notes).trim();
  }

  if (Object.keys(payload).length === 0) {
    err.details.push('En az bir alan gerekli (name, phone, email, notes)');
    throw err;
  }

  payload.updatedAt = new Date();

  await Customer.findOneAndUpdate(
    withBusinessId(tenantId, { id: String(customerId) }),
    { $set: payload }
  );

  return getCustomerById(tenantId, customerId);
}

function sanitizeAppointment(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
}

const APPOINTMENT_HISTORY_LIMIT = 10;

/**
 * Müşterinin son randevularını getirir (customerId veya telefon eşleşmesi).
 */
async function getCustomerAppointmentHistory(businessId, customerId) {
  const tenantId = requireBusinessId(businessId);
  const customer = await getCustomerById(tenantId, customerId);
  if (!customer) {
    const err = new Error('Müşteri bulunamadı');
    err.status = 404;
    throw err;
  }

  const rows = await Appointment.find(
    withBusinessId(tenantId, {
      $or: [{ customerId: customer.id }, { customerPhone: customer.phone }],
    })
  )
    .sort({ appointmentDate: -1 })
    .limit(APPOINTMENT_HISTORY_LIMIT);

  return rows.map((row) => sanitizeAppointment(row));
}

module.exports = {
  findOrCreateCustomer,
  createCustomer,
  getCustomerById,
  getCustomerByPhone,
  getCustomerAppointmentHistory,
  listCustomers,
  updateCustomer,
  sanitizeCustomer,
};
