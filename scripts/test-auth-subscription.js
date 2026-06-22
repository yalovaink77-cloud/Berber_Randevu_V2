#!/usr/bin/env node
/**
 * Auth login /me subscription summary testleri.
 *
 * Kullanım: node scripts/test-auth-subscription.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';
const DEMO_PHONE = process.env.DEMO_BARBER_PHONE || '+905551112233';
const DEMO_PASSWORD = process.env.DEMO_BARBER_PASSWORD;

const EXPIRED_BUSINESS_ID = `auth-expired-${Date.now()}`;
const NOSUB_BUSINESS_ID = `auth-nosub-${Date.now()}`;
const EXPIRED_BARBER_ID = `auth-expired-barber-${Date.now()}`;
const NOSUB_BARBER_ID = `auth-nosub-barber-${Date.now()}`;

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
  app.use('/api/auth', require('../dashboard/authRoutes'));
  return app;
}

async function cleanup() {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');

  await Subscription.deleteMany({ businessId: { $in: [EXPIRED_BUSINESS_ID, NOSUB_BUSINESS_ID] } });
  await User.deleteMany({ id: { $in: [EXPIRED_BARBER_ID, NOSUB_BARBER_ID] } });
  await Business.deleteMany({ id: { $in: [EXPIRED_BUSINESS_ID, NOSUB_BUSINESS_ID] } });
}

async function main() {
  if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
    throw new Error('DEMO_BARBER_PASSWORD .env içinde tanımlı olmalı (min 8 karakter)');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const subscriptionService = require('../services/subscriptionService');
  const plan = await subscriptionService.ensureLaunchPlan();
  const now = new Date();

  await subscriptionService.ensureDemoActiveSubscription(DEMO_BUSINESS_ID);

  const expiredPhone = `+90511${String(Date.now()).slice(-7)}`;
  const nosubPhone = `+90522${String(Date.now() + 1).slice(-7)}`;
  const expiredPassword = 'ExpiredPass1!';
  const nosubPassword = 'NoSubPass1!';

  await Business.findOneAndUpdate(
    { id: EXPIRED_BUSINESS_ID },
    {
      $set: {
        id: EXPIRED_BUSINESS_ID,
        name: 'Expired Biz',
        slug: EXPIRED_BUSINESS_ID,
        businessType: 'berber',
        status: 'active',
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  await Business.findOneAndUpdate(
    { id: NOSUB_BUSINESS_ID },
    {
      $set: {
        id: NOSUB_BUSINESS_ID,
        name: 'NoSub Biz',
        slug: NOSUB_BUSINESS_ID,
        businessType: 'berber',
        status: 'active',
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await User.findOneAndUpdate(
    { id: EXPIRED_BARBER_ID },
    {
      $set: {
        id: EXPIRED_BARBER_ID,
        businessId: EXPIRED_BUSINESS_ID,
        name: 'Expired Berber',
        phone: expiredPhone,
        role: 'barber',
        passwordHash: bcrypt.hashSync(expiredPassword, 12),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { id: NOSUB_BARBER_ID },
    {
      $set: {
        id: NOSUB_BARBER_ID,
        businessId: NOSUB_BUSINESS_ID,
        name: 'NoSub Berber',
        phone: nosubPhone,
        role: 'barber',
        passwordHash: bcrypt.hashSync(nosubPassword, 12),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await Subscription.deleteMany({ businessId: { $in: [EXPIRED_BUSINESS_ID, NOSUB_BUSINESS_ID] } });
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

  delete require.cache[require.resolve('../dashboard/authRoutes')];
  delete require.cache[require.resolve('../services/authService')];
  delete require.cache[require.resolve('../services/subscriptionService')];

  const app = buildApp();

  // Demo login
  const demoLogin = await request(app, 'POST', '/api/auth/login', null, {
    phone: DEMO_PHONE,
    password: DEMO_PASSWORD,
  });
  assert(demoLogin.status === 200, `demo login status ${demoLogin.status}`);
  assert(demoLogin.body.success === true, 'demo login success flag');
  assert(demoLogin.body.user, 'demo login user');
  assert(demoLogin.body.business?.id === DEMO_BUSINESS_ID, 'demo login business');
  assert(demoLogin.body.subscription?.status === 'active', 'demo subscription.status active');
  assert(demoLogin.body.subscription?.isActive === true, 'demo subscription.isActive true');
  assert(demoLogin.body.token, 'demo login token preserved');

  const demoMe = await request(app, 'GET', '/api/auth/me', demoLogin.body.token);
  assert(demoMe.status === 200, 'demo /me status');
  assert(demoMe.body.subscription?.status === 'active', 'demo /me subscription active');
  assert(demoMe.body.success === true, 'demo /me success flag');
  assert(demoMe.body.tenant?.businessId === DEMO_BUSINESS_ID, 'demo /me tenant preserved');

  // Expired business login
  const expiredLogin = await request(app, 'POST', '/api/auth/login', null, {
    phone: expiredPhone,
    password: expiredPassword,
  });
  assert(expiredLogin.status === 200, 'expired login should succeed');
  assert(expiredLogin.body.subscription?.status === 'expired', 'expired subscription.status');
  assert(expiredLogin.body.subscription?.isActive === false, 'expired subscription.isActive false');

  // No subscription business
  const nosubLogin = await request(app, 'POST', '/api/auth/login', null, {
    phone: nosubPhone,
    password: nosubPassword,
  });
  assert(nosubLogin.status === 200, 'nosub login should succeed');
  assert(nosubLogin.body.business?.id === NOSUB_BUSINESS_ID, 'nosub business present');
  assert(nosubLogin.body.subscription === null, 'nosub subscription null');

  const nosubMe = await request(app, 'GET', '/api/auth/me', nosubLogin.body.token);
  assert(nosubMe.status === 200, 'nosub /me status');
  assert(nosubMe.body.subscription === null, 'nosub /me subscription null');
  assert(nosubMe.body.success === true, 'nosub /me success flag');
  assert(nosubMe.body.tenant?.businessId === NOSUB_BUSINESS_ID, 'nosub /me tenant preserved');

  await cleanup();
  console.log('✅ auth subscription summary tests passed');
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
