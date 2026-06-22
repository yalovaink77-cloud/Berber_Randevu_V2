#!/usr/bin/env node
/**
 * Sprint 2 — WRITE gate route entegrasyon testleri.
 *
 * Kullanım: node scripts/test-subscription-routes.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';
const DEMO_BARBER_ID = process.env.DEMO_BARBER_ID || 'test-barber-id';
const EXPIRED_BUSINESS_ID = `expired-biz-${Date.now()}`;
const OTHER_BUSINESS_ID = `other-biz-${Date.now()}`;
const EXPIRED_BARBER_ID = `expired-barber-${Date.now()}`;
const OTHER_BARBER_ID = `other-barber-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET gerekli (test için en az 32 karakter)');
  }
  return jwt.sign(user, secret, { expiresIn: '1h' });
}

async function request(app, method, path, token, body) {
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp() {
  const app = express();
  app.use(express.json());
  const { authenticate } = require('../middleware/auth');
  const appointmentRoutes = require('../dashboard/routes');
  const serviceRoutes = require('../dashboard/serviceRoutes');
  app.use('/api/appointments', authenticate, appointmentRoutes);
  app.use('/api/services', authenticate, serviceRoutes);
  return app;
}

async function seedFixtures() {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const subscriptionService = require('../services/subscriptionService');
  const bcrypt = require('bcryptjs');

  await subscriptionService.ensureLaunchPlan();
  await subscriptionService.ensureDemoActiveSubscription(DEMO_BUSINESS_ID);

  for (const row of [
    { id: EXPIRED_BUSINESS_ID, barberId: EXPIRED_BARBER_ID, phone: `+90500${Date.now()}1` },
    { id: OTHER_BUSINESS_ID, barberId: OTHER_BARBER_ID, phone: `+90500${Date.now()}2` },
  ]) {
    await Business.findOneAndUpdate(
      { id: row.id },
      {
        $set: {
          id: row.id,
          name: `Test ${row.id}`,
          slug: row.id,
          businessType: 'berber',
          status: 'active',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    await User.findOneAndUpdate(
      { id: row.barberId },
      {
        $set: {
          id: row.barberId,
          businessId: row.id,
          name: 'Test Berber',
          phone: row.phone,
          role: 'barber',
          passwordHash: bcrypt.hashSync('TestPass123!', 10),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
  }

  await Subscription.deleteMany({ businessId: { $in: [EXPIRED_BUSINESS_ID, OTHER_BUSINESS_ID] } });

  const plan = await subscriptionService.getPlanByCode('launch_299');
  const now = new Date();

  await Subscription.create({
    businessId: EXPIRED_BUSINESS_ID,
    planCode: plan.code,
    status: 'expired',
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    currentPeriodEnd: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  await Subscription.create({
    businessId: OTHER_BUSINESS_ID,
    planCode: plan.code,
    status: 'active',
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });
}

async function cleanup() {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');

  await Subscription.deleteMany({ businessId: { $in: [EXPIRED_BUSINESS_ID, OTHER_BUSINESS_ID] } });
  await User.deleteMany({ id: { $in: [EXPIRED_BARBER_ID, OTHER_BARBER_ID] } });
  await Business.deleteMany({ id: { $in: [EXPIRED_BUSINESS_ID, OTHER_BUSINESS_ID] } });
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  await seedFixtures();

  delete require.cache[require.resolve('../dashboard/routes')];
  delete require.cache[require.resolve('../dashboard/serviceRoutes')];
  delete require.cache[require.resolve('../middleware/auth')];
  delete require.cache[require.resolve('../middleware/subscription')];

  const app = buildApp();
  const demoToken = signToken({
    id: DEMO_BARBER_ID,
    role: 'barber',
    phone: process.env.DEMO_BARBER_PHONE || '+905551112233',
    businessId: DEMO_BUSINESS_ID,
  });
  const expiredToken = signToken({
    id: EXPIRED_BARBER_ID,
    role: 'barber',
    phone: `expired-${Date.now()}@test`,
    businessId: EXPIRED_BUSINESS_ID,
  });
  const otherNoSubToken = signToken({
    id: OTHER_BARBER_ID,
    role: 'barber',
    phone: `other-${Date.now()}@test`,
    businessId: OTHER_BUSINESS_ID,
  });

  // Demo: GET 200
  const demoGet = await request(app, 'GET', `/api/appointments/barber/${DEMO_BARBER_ID}`, demoToken);
  assert(demoGet.status === 200, `demo GET expected 200, got ${demoGet.status}`);

  // Demo: POST success (minimal valid body — may 201 or 400 if validation; must not be 403 subscription)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const demoPost = await request(app, 'POST', '/api/appointments/', demoToken, {
    customerId: 'test-customer-sub-gate',
    customerName: 'Sub Gate Test',
    customerPhone: '+905551234567',
    barberId: DEMO_BARBER_ID,
    barberName: 'Gökhan Berber',
    appointmentDate: tomorrow,
    serviceType: 'haircut',
  });
  assert(demoPost.status !== 403, `demo POST should not be subscription-blocked, got ${demoPost.status}`);
  assert([201, 400, 409].includes(demoPost.status), `demo POST unexpected ${demoPost.status}`);

  // Expired: GET 200
  const expiredGet = await request(
    app,
    'GET',
    `/api/appointments/barber/${EXPIRED_BARBER_ID}`,
    expiredToken
  );
  assert(expiredGet.status === 200, `expired GET expected 200, got ${expiredGet.status}`);

  // Expired: POST 403
  const expiredPost = await request(app, 'POST', '/api/appointments/', expiredToken, {
    customerId: 'exp-customer',
    customerName: 'Expired Test',
    customerPhone: '+905559999999',
    barberId: EXPIRED_BARBER_ID,
    barberName: 'Expired Berber',
    appointmentDate: tomorrow,
  });
  assert(expiredPost.status === 403, `expired POST expected 403, got ${expiredPost.status}`);
  assert(expiredPost.body?.error, 'expired POST should return error message');

  // Other tenant: active sub exists on OTHER business but barber has no own sub lookup issue...
  // OTHER has active sub — POST should succeed (not 403). Delete sub to test no-sub tenant.
  const Subscription = require('../models/Subscription');
  await Subscription.deleteOne({ businessId: OTHER_BUSINESS_ID });

  const otherGet = await request(
    app,
    'GET',
    `/api/appointments/barber/${OTHER_BARBER_ID}`,
    otherNoSubToken
  );
  assert(otherGet.status === 200, `other tenant GET expected 200, got ${otherGet.status}`);

  const otherPost = await request(app, 'POST', '/api/appointments/', otherNoSubToken, {
    customerId: 'other-customer',
    customerName: 'Other Tenant',
    customerPhone: '+905558888888',
    barberId: OTHER_BARBER_ID,
    barberName: 'Other Berber',
    appointmentDate: tomorrow,
  });
  assert(otherPost.status === 403, `other tenant without sub POST expected 403, got ${otherPost.status}`);

  // Cross-tenant: demo token cannot write as other barber id
  const crossPost = await request(app, 'POST', '/api/appointments/', demoToken, {
    customerId: 'cross-customer',
    customerName: 'Cross Tenant',
    customerPhone: '+905557777777',
    barberId: OTHER_BARBER_ID,
    barberName: 'Other Berber',
    appointmentDate: tomorrow,
  });
  assert(crossPost.status === 403, `cross-tenant POST expected 403, got ${crossPost.status}`);

  await cleanup();
  console.log('✅ subscription route integration tests passed');
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
