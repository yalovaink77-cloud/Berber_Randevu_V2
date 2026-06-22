#!/usr/bin/env node
/**
 * customerService birim / entegrasyon testleri.
 *
 * Kullanım: node scripts/test-customer-service.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PREFIX = `cust-${Date.now()}`;
const BUSINESS_A = `${PREFIX}-biz-a`;
const BUSINESS_B = `${PREFIX}-biz-b`;
const PHONE_RAW = '05351112233';
const PHONE_NORM = '+905351112233';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  const Customer = require('../models/Customer');
  await Customer.deleteMany({
    businessId: { $in: [BUSINESS_A, BUSINESS_B] },
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../services/customerService')];
  delete require.cache[require.resolve('../services/authService')];
  delete require.cache[require.resolve('../models/Customer')];

  const customerService = require('../services/customerService');

  await cleanup();

  // Aynı business, farklı telefon formatı → aynı customer
  const first = await customerService.findOrCreateCustomer(BUSINESS_A, {
    name: 'Ahmet Yılmaz',
    phone: PHONE_RAW,
  });
  assert(first.created === true, 'first create should be created=true');
  assert(first.customer.businessId === BUSINESS_A, 'businessId set');
  assert(first.customer.phone === PHONE_NORM, 'phone normalized');

  const second = await customerService.findOrCreateCustomer(BUSINESS_A, {
    name: 'Ahmet Y.',
    phone: '+905351112233',
  });
  assert(second.created === false, 'second call should reuse existing');
  assert(second.customer.id === first.customer.id, 'same business same phone = same customer');
  assert(second.customer.phone === PHONE_NORM, 'normalized phone on reuse');

  // Farklı business, aynı telefon → farklı customer
  const otherBiz = await customerService.findOrCreateCustomer(BUSINESS_B, {
    name: 'Ahmet Yılmaz',
    phone: '5351112233',
  });
  assert(otherBiz.created === true, 'other business should create new customer');
  assert(otherBiz.customer.id !== first.customer.id, 'different business = different customer');
  assert(otherBiz.customer.businessId === BUSINESS_B, 'other businessId');
  assert(otherBiz.customer.phone === PHONE_NORM, 'other business phone normalized');

  // businessId yok → hata
  let missingBizErr = null;
  try {
    await customerService.findOrCreateCustomer(null, {
      name: 'Test',
      phone: PHONE_RAW,
    });
  } catch (err) {
    missingBizErr = err;
  }
  assert(missingBizErr && missingBizErr.status === 403, 'missing businessId should throw 403');

  let emptyBizErr = null;
  try {
    await customerService.getCustomerById('', first.customer.id);
  } catch (err) {
    emptyBizErr = err;
  }
  assert(emptyBizErr && emptyBizErr.status === 403, 'empty businessId on get should throw 403');

  // Geçersiz telefon
  let invalidPhoneErr = null;
  try {
    await customerService.findOrCreateCustomer(BUSINESS_A, {
      name: 'Test',
      phone: '123',
    });
  } catch (err) {
    invalidPhoneErr = err;
  }
  assert(invalidPhoneErr && invalidPhoneErr.status === 400, 'invalid phone should throw 400');

  // Tenant izolasyonu — BUSINESS_B, BUSINESS_A müşterisini göremez
  const crossTenant = await customerService.getCustomerById(
    BUSINESS_B,
    first.customer.id
  );
  assert(crossTenant === null, 'tenant isolation: wrong business returns null');

  const ownTenant = await customerService.getCustomerById(
    BUSINESS_A,
    first.customer.id
  );
  assert(ownTenant?.id === first.customer.id, 'own tenant can read customer');

  const byPhoneA = await customerService.getCustomerByPhone(BUSINESS_A, '905351112233');
  assert(byPhoneA?.id === first.customer.id, 'getCustomerByPhone tenant scoped');

  const byPhoneWrongBiz = await customerService.getCustomerByPhone(BUSINESS_B, PHONE_RAW);
  assert(byPhoneWrongBiz?.id === otherBiz.customer.id, 'phone lookup respects businessId');
  assert(byPhoneWrongBiz?.id !== first.customer.id, 'phone lookup not leaking tenant A');

  await cleanup();
  console.log('✅ customerService tests passed');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err.message);
  try {
    await cleanup();
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
