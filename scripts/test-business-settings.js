#!/usr/bin/env node
/**
 * GET/PUT /api/business/me route testleri.
 *
 * Kullanım: node scripts/test-business-settings.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';
const DEMO_BARBER_ID = process.env.DEMO_BARBER_ID || 'test-barber-id';
const EXPIRED_BUSINESS_ID = `biz-exp-${Date.now()}`;
const EXPIRED_BARBER_ID = `barber-exp-${Date.now()}`;
const OTHER_BUSINESS_ID = `biz-other-${Date.now()}`;
const OTHER_BARBER_ID = `barber-other-${Date.now()}`;
const PREFIX = `biz-set-${Date.now()}`;

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
  app.use('/api/business', authenticate, require('../dashboard/businessRoutes'));
  app.use('/api/auth', require('../dashboard/authRoutes'));
  return app;
}

async function seedFixtures() {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const subscriptionService = require('../services/subscriptionService');

  await subscriptionService.ensureLaunchPlan();
  await subscriptionService.ensureDemoActiveSubscription(DEMO_BUSINESS_ID);

  for (const row of [
    { id: EXPIRED_BUSINESS_ID, barberId: EXPIRED_BARBER_ID, phone: `+90501${String(Date.now()).slice(-7)}` },
    { id: OTHER_BUSINESS_ID, barberId: OTHER_BARBER_ID, phone: `+90502${String(Date.now()).slice(-7)}` },
  ]) {
    await Business.findOneAndUpdate(
      { id: row.id },
      {
        $set: {
          id: row.id,
          name: `Test ${row.id}`,
          slug: row.id,
          businessType: 'berber',
          city: 'Ankara',
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
          businessName: `Test ${row.id}`,
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

async function cleanup(ids = {}) {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const Service = require('../models/Service');

  const businessIds = [
    ids.businessId,
    EXPIRED_BUSINESS_ID,
    OTHER_BUSINESS_ID,
  ].filter(Boolean);

  if (businessIds.length) {
    await Service.deleteMany({ businessId: { $in: businessIds } });
    await Subscription.deleteMany({ businessId: { $in: businessIds } });
    await Business.deleteMany({ id: { $in: businessIds } });
  }

  const userIds = [
    ids.userId,
    EXPIRED_BARBER_ID,
    OTHER_BARBER_ID,
  ].filter(Boolean);

  if (userIds.length) {
    await User.deleteMany({ id: { $in: userIds } });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  await seedFixtures();

  delete require.cache[require.resolve('../dashboard/businessRoutes')];
  delete require.cache[require.resolve('../services/businessService')];
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
  const customerToken = signToken({
    id: 'customer-test-id',
    role: 'customer',
    phone: '+905559999000',
  });

  // Register fresh business for owner update tests
  const phone = `+90543${String(Date.now()).slice(-7)}`;
  const password = 'BizSet123!';
  const regRes = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: 'Settings Owner',
    ownerPhone: phone,
    ownerEmail: `${PREFIX}@example.com`,
    password,
    businessName: `${PREFIX} Berber`,
    businessType: 'berber',
    city: 'Bursa',
  });
  assert(regRes.status === 201, `register expected 201, got ${regRes.status}`);

  const ownerToken = regRes.body.token;
  const ownerBusinessId = regRes.body.business.id;
  const ownerUserId = regRes.body.user.id;

  // GET owner sees own business
  const ownerGet = await request(app, 'GET', '/api/business/me', ownerToken);
  assert(ownerGet.status === 200, `owner GET expected 200, got ${ownerGet.status}`);
  assert(ownerGet.body.business?.id === ownerBusinessId, 'owner GET business id');
  for (const field of ['id', 'name', 'slug', 'businessType', 'city', 'status']) {
    assert(Object.prototype.hasOwnProperty.call(ownerGet.body.business, field), `business.${field}`);
  }

  // Owner updates own business
  const ownerPut = await request(app, 'PUT', '/api/business/me', ownerToken, {
    name: `${PREFIX} Güncel`,
    city: 'İstanbul',
    businessType: 'kuafor',
  });
  assert(ownerPut.status === 200, `owner PUT expected 200, got ${ownerPut.status}`);
  assert(ownerPut.body.business.name === `${PREFIX} Güncel`, 'business name updated');
  assert(ownerPut.body.business.city === 'İstanbul', 'business city updated');
  assert(ownerPut.body.business.businessType === 'kuafor', 'businessType updated');

  const User = require('../models/User');
  const Business = require('../models/Business');
  const mirroredUser = await User.findOne({ id: ownerUserId });
  assert(mirroredUser?.businessName === `${PREFIX} Güncel`, 'User.businessName mirrored');

  const dbBusiness = await Business.findOne({ id: ownerBusinessId });
  assert(dbBusiness?.name === `${PREFIX} Güncel`, 'Business.name in DB');
  assert(dbBusiness?.city === 'İstanbul', 'Business.city in DB');

  // Body businessId ignored — cannot hijack other tenant
  const otherBefore = await Business.findOne({ id: OTHER_BUSINESS_ID });
  const hijackPut = await request(app, 'PUT', '/api/business/me', ownerToken, {
    name: 'Hijack Attempt',
    businessId: OTHER_BUSINESS_ID,
    id: OTHER_BUSINESS_ID,
    slug: 'hijacked-slug',
    status: 'suspended',
  });
  assert(hijackPut.status === 200, `hijack PUT expected 200 on own tenant, got ${hijackPut.status}`);
  assert(hijackPut.body.business.id === ownerBusinessId, 'still own business');
  assert(hijackPut.body.business.name === 'Hijack Attempt', 'own name updated');

  const otherAfter = await Business.findOne({ id: OTHER_BUSINESS_ID });
  assert(otherAfter?.name === otherBefore?.name, 'other tenant name unchanged');
  assert(otherAfter?.status === 'active', 'other tenant status unchanged');

  // Customer forbidden
  const customerGet = await request(app, 'GET', '/api/business/me', customerToken);
  assert(customerGet.status === 403, `customer GET expected 403, got ${customerGet.status}`);

  const customerPut = await request(app, 'PUT', '/api/business/me', customerToken, {
    name: 'Customer Biz',
  });
  assert(customerPut.status === 403, `customer PUT expected 403, got ${customerPut.status}`);

  // Expired subscription: GET ok, PUT blocked
  const expiredGet = await request(app, 'GET', '/api/business/me', expiredToken);
  assert(expiredGet.status === 200, `expired GET expected 200, got ${expiredGet.status}`);
  assert(expiredGet.body.business?.id === EXPIRED_BUSINESS_ID, 'expired GET own business');

  const expiredPut = await request(app, 'PUT', '/api/business/me', expiredToken, {
    name: 'Should Fail',
  });
  assert(expiredPut.status === 403, `expired PUT expected 403, got ${expiredPut.status}`);

  // Demo GET still works
  const demoGet = await request(app, 'GET', '/api/business/me', demoToken);
  assert(demoGet.status === 200, `demo GET expected 200, got ${demoGet.status}`);
  assert(demoGet.body.business?.id === DEMO_BUSINESS_ID, 'demo business id');

  // Invalid body
  const invalidPut = await request(app, 'PUT', '/api/business/me', ownerToken, {
    businessType: 'invalid_type',
  });
  assert(invalidPut.status === 400, `invalid PUT expected 400, got ${invalidPut.status}`);

  await cleanup({
    businessId: ownerBusinessId,
    userId: ownerUserId,
  });

  console.log('✅ business settings route tests passed');
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
