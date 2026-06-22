#!/usr/bin/env node
/**
 * POST /api/appointments — Customer entegrasyon testleri.
 *
 * Kullanım: node scripts/test-appointment-customer.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const PREFIX = `appt-cust-${Date.now()}`;
const SHARED_PHONE_RAW = `0555${String(Date.now()).slice(-7)}`;
const NEW_PHONE_RAW = `0556${String(Date.now()).slice(-7)}`;
const FAKE_CUSTOMER_ID = 'fake-customer-id-should-be-ignored';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function request(app, method, path, token, body) {
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp() {
  const app = express();
  app.use(express.json());
  const { authenticate } = require('../middleware/auth');
  app.use('/api/appointments', authenticate, require('../dashboard/routes'));
  app.use('/api/auth', require('../dashboard/authRoutes'));
  return app;
}

function futureSlot(hoursOffset = 48) {
  const d = new Date(Date.now() + hoursOffset * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

async function registerBusiness(app, suffixNum) {
  const phone = `+9055${String(Date.now() + suffixNum).slice(-8)}`;
  const password = 'ApptCust123!';
  const res = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: `Owner ${suffixNum}`,
    ownerPhone: phone,
    ownerEmail: `${PREFIX}-${suffixNum}@example.com`,
    password,
    businessName: `${PREFIX} Biz ${suffixNum}`,
    businessType: 'berber',
    city: 'İzmir',
  });
  assert(res.status === 201, `register business ${suffixNum} expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  return {
    token: res.body.token,
    businessId: res.body.business.id,
    barberId: res.body.user.id,
    barberName: res.body.user.name,
    ownerPhone: phone,
  };
}

async function createAppointment(app, token, barber, payload) {
  return request(app, 'POST', '/api/appointments', token, {
    barberId: barber.barberId,
    barberName: barber.barberName,
    serviceType: 'haircut',
    duration: 30,
    ...payload,
  });
}

async function cleanup(ids) {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const Service = require('../models/Service');
  const Appointment = require('../models/Appointment');
  const Customer = require('../models/Customer');

  const businessIds = ids.businessIds || [];
  if (businessIds.length) {
    await Appointment.deleteMany({ businessId: { $in: businessIds } });
    await Customer.deleteMany({ businessId: { $in: businessIds } });
    await Service.deleteMany({ businessId: { $in: businessIds } });
    await Subscription.deleteMany({ businessId: { $in: businessIds } });
    await Business.deleteMany({ id: { $in: businessIds } });
  }
  if (ids.userIds?.length) {
    await User.deleteMany({ id: { $in: ids.userIds } });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../dashboard/routes')];
  delete require.cache[require.resolve('../services/customerService')];
  delete require.cache[require.resolve('../services/databaseService')];
  delete require.cache[require.resolve('../middleware/auth')];

  const app = buildApp();
  const bizA = await registerBusiness(app, 1);
  await new Promise((r) => setTimeout(r, 10));
  const bizB = await registerBusiness(app, 2);

  const customerName = 'Müşteri Test';

  // Aynı business — farklı telefon formatı → aynı customerId
  const appt1 = await createAppointment(app, bizA.token, bizA, {
    customerName,
    customerPhone: SHARED_PHONE_RAW,
    appointmentDate: futureSlot(72),
  });
  assert(appt1.status === 201, `appt1 expected 201, got ${appt1.status}: ${JSON.stringify(appt1.body)}`);
  const customerIdA = appt1.body.appointment?.customerId;
  assert(customerIdA, 'appt1 customerId required');
  assert(customerIdA !== FAKE_CUSTOMER_ID, 'customerId should be real Customer.id');

  const appt2 = await createAppointment(app, bizA.token, bizA, {
    customerName: 'Müşteri Test 2',
    customerPhone: SHARED_PHONE_RAW.replace(/^0/, ''),
    appointmentDate: futureSlot(96),
  });
  assert(appt2.status === 201, `appt2 expected 201, got ${appt2.status}`);
  assert(
    appt2.body.appointment?.customerId === customerIdA,
    'same business same phone = same customerId'
  );

  // Body'den sahte customerId → yok sayılmalı
  const apptFake = await createAppointment(app, bizA.token, bizA, {
    customerId: FAKE_CUSTOMER_ID,
    customerName: 'Sahte ID Test',
    customerPhone: SHARED_PHONE_RAW,
    appointmentDate: futureSlot(120),
  });
  assert(apptFake.status === 201, `apptFake expected 201, got ${apptFake.status}`);
  assert(
    apptFake.body.appointment?.customerId === customerIdA,
    'fake body customerId must be ignored'
  );
  assert(
    apptFake.body.appointment?.customerId !== FAKE_CUSTOMER_ID,
    'appointment must not use fake customerId from body'
  );

  // Farklı business — aynı telefon → farklı customerId
  const apptB = await createAppointment(app, bizB.token, bizB, {
    customerName,
    customerPhone: SHARED_PHONE_RAW,
    appointmentDate: futureSlot(72),
  });
  assert(apptB.status === 201, `apptB expected 201, got ${apptB.status}`);
  const customerIdB = apptB.body.appointment?.customerId;
  assert(customerIdB, 'apptB customerId required');
  assert(customerIdB !== customerIdA, 'different business same phone = different customerId');

  // Yeni telefon → Customer otomatik oluşturulmalı
  const Customer = require('../models/Customer');
  const beforeCount = await Customer.countDocuments({ businessId: bizA.businessId });

  const apptNew = await createAppointment(app, bizA.token, bizA, {
    customerName: 'Yeni Müşteri',
    customerPhone: NEW_PHONE_RAW,
    appointmentDate: futureSlot(144),
  });
  assert(apptNew.status === 201, `apptNew expected 201, got ${apptNew.status}`);

  const afterCount = await Customer.countDocuments({ businessId: bizA.businessId });
  assert(afterCount === beforeCount + 1, 'new phone should create a Customer record');

  const newCustomer = await Customer.findOne({
    businessId: bizA.businessId,
    id: apptNew.body.appointment?.customerId,
  });
  assert(newCustomer, 'Customer record exists for new appointment');
  assert(
    apptNew.body.appointment?.customerId === newCustomer.id,
    'appointment.customerId matches Customer.id'
  );

  await cleanup({
    businessIds: [bizA.businessId, bizB.businessId],
    userIds: [bizA.barberId, bizB.barberId],
  });

  console.log('✅ appointment customer integration tests passed');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
