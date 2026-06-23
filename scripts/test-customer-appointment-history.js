#!/usr/bin/env node
/**
 * GET /api/customers/:id/appointments — müşteri randevu geçmişi testleri.
 *
 * Kullanım: node scripts/test-customer-appointment-history.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const PREFIX = `cust-appt-${Date.now()}`;
const OTHER_BUSINESS_ID = `${PREFIX}-biz-b`;

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
  app.use('/api/customers', authenticate, require('../dashboard/customerRoutes'));
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
  const password = 'CustAppt123!';
  const res = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: `Owner ${suffixNum}`,
    ownerPhone: phone,
    ownerEmail: `${PREFIX}-${suffixNum}@example.com`,
    password,
    businessName: `${PREFIX} Biz ${suffixNum}`,
    businessType: 'berber',
    city: 'Bursa',
  });
  assert(res.status === 201, `register expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  return {
    token: res.body.token,
    businessId: res.body.business.id,
    barberId: res.body.user.id,
    barberName: res.body.user.name,
  };
}

async function seedOtherBusiness() {
  const Business = require('../models/Business');
  const User = require('../models/User');
  const Subscription = require('../models/Subscription');
  const subscriptionService = require('../services/subscriptionService');
  const bcrypt = require('bcryptjs');

  await subscriptionService.ensureLaunchPlan();

  await Business.findOneAndUpdate(
    { id: OTHER_BUSINESS_ID },
    {
      $set: {
        id: OTHER_BUSINESS_ID,
        name: 'Other Tenant Biz',
        slug: OTHER_BUSINESS_ID,
        businessType: 'berber',
        status: 'active',
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );

  const otherBarberId = `${PREFIX}-barber-b`;
  const otherPhone = `+9055${String(Date.now() + 99).slice(-8)}`;

  await User.findOneAndUpdate(
    { id: otherBarberId },
    {
      $set: {
        id: otherBarberId,
        businessId: OTHER_BUSINESS_ID,
        name: 'Other Berber',
        phone: otherPhone,
        role: 'barber',
        passwordHash: bcrypt.hashSync('CustAppt123!', 10),
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );

  await Subscription.deleteMany({ businessId: OTHER_BUSINESS_ID });
  await subscriptionService.createTrialSubscription(OTHER_BUSINESS_ID);

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    {
      id: otherBarberId,
      role: 'barber',
      phone: otherPhone,
      businessId: OTHER_BUSINESS_ID,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { token, businessId: OTHER_BUSINESS_ID, barberId: otherBarberId };
}

async function createLegacyDemoAppointment(businessId, barber, customerPhone, customerName) {
  const Appointment = require('../models/Appointment');
  const authService = require('../services/authService');
  const normPhone = authService.normalizePhoneNumber(customerPhone);

  return Appointment.create({
    id: uuidv4(),
    businessId,
    customerId: `demo-${normPhone}`,
    customerName,
    customerPhone: normPhone,
    barberId: barber.barberId,
    barberName: barber.barberName,
    serviceType: 'haircut',
    appointmentDate: new Date(futureSlot(72)),
    duration: 30,
    status: 'confirmed',
    price: 200,
  });
}

async function cleanup(ids) {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const Service = require('../models/Service');
  const Customer = require('../models/Customer');
  const Appointment = require('../models/Appointment');

  const businessIds = [ids.businessId, OTHER_BUSINESS_ID].filter(Boolean);
  if (businessIds.length) {
    await Appointment.deleteMany({ businessId: { $in: businessIds } });
    await Customer.deleteMany({ businessId: { $in: businessIds } });
    await Service.deleteMany({ businessId: { $in: businessIds } });
    await Subscription.deleteMany({ businessId: { $in: businessIds } });
    await Business.deleteMany({ id: { $in: businessIds } });
  }
  if (ids.userId) {
    await User.deleteMany({ id: { $in: [ids.userId, `${PREFIX}-barber-b`] } });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../dashboard/customerRoutes')];
  delete require.cache[require.resolve('../services/customerService')];
  delete require.cache[require.resolve('../middleware/auth')];

  const app = buildApp();
  const bizA = await registerBusiness(app, 1);
  const bizB = await seedOtherBusiness();
  const authService = require('../services/authService');

  const customerPhoneRaw = `0555${String(Date.now()).slice(-7)}`;
  const customerPhoneNorm = authService.normalizePhoneNumber(customerPhoneRaw);

  const createRes = await request(app, 'POST', '/api/customers', bizA.token, {
    name: 'Geçmiş Müşteri',
    phone: customerPhoneRaw,
  });
  assert(createRes.status === 201, `create customer expected 201, got ${createRes.status}`);
  const customerId = createRes.body.customer.id;

  // customerId match — POST /api/appointments
  const apptRes = await request(app, 'POST', '/api/appointments', bizA.token, {
    customerName: 'Geçmiş Müşteri',
    customerPhone: customerPhoneRaw,
    barberId: bizA.barberId,
    barberName: bizA.barberName,
    serviceType: 'haircut',
    appointmentDate: futureSlot(24),
    duration: 30,
    price: 250,
  });
  assert(apptRes.status === 201, `create appointment expected 201, got ${apptRes.status}`);
  assert(
    apptRes.body.appointment?.customerId === customerId,
    'appointment uses real customerId'
  );

  const historyRes = await request(
    app,
    'GET',
    `/api/customers/${customerId}/appointments`,
    bizA.token
  );
  assert(historyRes.status === 200, `history expected 200, got ${historyRes.status}`);
  assert(historyRes.body.success === true, 'success flag');
  assert(Array.isArray(historyRes.body.appointments), 'appointments array');
  assert(
    historyRes.body.appointments.some((a) => a.id === apptRes.body.appointment.id),
    'customerId match appointment included'
  );

  // phone fallback — legacy demo customerId, matching phone
  const legacyAppt = await createLegacyDemoAppointment(
    bizA.businessId,
    bizA,
    customerPhoneRaw,
    'Geçmiş Müşteri'
  );
  assert(
    legacyAppt.customerId === `demo-${customerPhoneNorm}`,
    'legacy demo customerId format'
  );
  assert(
    legacyAppt.customerId !== customerId,
    'legacy customerId differs from Customer.id'
  );

  const historyLegacyRes = await request(
    app,
    'GET',
    `/api/customers/${customerId}/appointments`,
    bizA.token
  );
  assert(historyLegacyRes.status === 200, `legacy history expected 200, got ${historyLegacyRes.status}`);
  assert(
    historyLegacyRes.body.appointments.some((a) => a.id === legacyAppt.id),
    'legacy demo-phone appointment visible via phone fallback'
  );
  assert(
    historyLegacyRes.body.appointments.length <= 10,
    'history limited to 10'
  );

  // cross-tenant access
  const crossRes = await request(
    app,
    'GET',
    `/api/customers/${customerId}/appointments`,
    bizB.token
  );
  assert(crossRes.status === 404, `cross-tenant expected 404, got ${crossRes.status}`);

  // customer not found
  const missingRes = await request(
    app,
    'GET',
    `/api/customers/${uuidv4()}/appointments`,
    bizA.token
  );
  assert(missingRes.status === 404, `missing customer expected 404, got ${missingRes.status}`);
  assert(missingRes.body.error, 'missing customer error message');

  console.log('✅ test-customer-appointment-history.js — tüm senaryolar geçti');
  await cleanup({ businessId: bizA.businessId, userId: bizA.barberId });
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
