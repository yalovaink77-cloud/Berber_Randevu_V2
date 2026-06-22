#!/usr/bin/env node
/**
 * Auth response format tutarlılık testleri (buildAuthResponse).
 *
 * Kullanım: node scripts/test-auth-response-format.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEMO_PHONE = process.env.DEMO_BARBER_PHONE || '+905551112233';
const DEMO_PASSWORD = process.env.DEMO_BARBER_PASSWORD;
const PREFIX = `fmt-${Date.now()}`;

const AUTH_CONTEXT_KEYS = ['user', 'business', 'subscription', 'tenant'];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertAuthContextShape(body, { requireToken = false, requireBusiness = false } = {}) {
  for (const key of AUTH_CONTEXT_KEYS) {
    assert(Object.prototype.hasOwnProperty.call(body, key), `missing key: ${key}`);
  }

  assert(body.user && typeof body.user === 'object', 'user object required');

  if (requireBusiness) {
    assert(body.business && body.business.id, 'business.id required');
    assert(body.subscription && typeof body.subscription === 'object', 'subscription required');
    assert(body.tenant?.businessId === body.business.id, 'tenant.businessId must match business.id');
  } else {
    assert(body.business === null, 'business should be null');
    assert(body.subscription === null, 'subscription should be null');
    assert(body.tenant === null, 'tenant should be null');
  }

  if (requireToken) {
    assert(typeof body.token === 'string' && body.token.length > 0, 'token required');
  } else {
    assert(!Object.prototype.hasOwnProperty.call(body, 'token'), 'token should not be present');
  }

  if (body.business) {
    for (const field of ['id', 'name', 'slug', 'businessType', 'city', 'status']) {
      assert(Object.prototype.hasOwnProperty.call(body.business, field), `business.${field} missing`);
    }
  }

  if (body.subscription) {
    for (const field of [
      'planCode', 'status', 'priceAmount', 'currency', 'billingInterval',
      'trialEndsAt', 'currentPeriodStart', 'currentPeriodEnd', 'isActive',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(body.subscription, field), `subscription.${field} missing`);
    }
  }
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

async function cleanup(ids) {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const Service = require('../models/Service');

  if (ids.businessId) {
    await Service.deleteMany({ businessId: ids.businessId });
    await Subscription.deleteMany({ businessId: ids.businessId });
    await Business.deleteOne({ id: ids.businessId });
  }
  if (ids.userId) {
    await User.deleteOne({ id: ids.userId });
  }
  if (ids.phone) {
    await User.deleteOne({ phone: ids.phone });
  }
}

async function main() {
  if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
    throw new Error('DEMO_BARBER_PASSWORD .env içinde tanımlı olmalı');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../dashboard/authRoutes')];
  delete require.cache[require.resolve('../services/authService')];
  delete require.cache[require.resolve('../services/onboardingService')];

  const app = buildApp();
  const authService = require('../services/authService');

  // Demo login — barber context + token
  const login = await request(app, 'POST', '/api/auth/login', null, {
    phone: DEMO_PHONE,
    password: DEMO_PASSWORD,
  });
  assert(login.status === 200, `login status ${login.status}`);
  assert(login.body.success === true, 'login success flag');
  assertAuthContextShape(login.body, { requireToken: true, requireBusiness: true });

  // /me — same context shape, no token
  const me = await request(app, 'GET', '/api/auth/me', login.body.token);
  assert(me.status === 200, `me status ${me.status}`);
  assert(me.body.success === true, 'me success flag');
  assertAuthContextShape(me.body, { requireToken: false, requireBusiness: true });
  assert(me.body.user.id === login.body.user.id, 'me user matches login user');
  assert(me.body.business.id === login.body.business.id, 'me business matches login business');
  assert(me.body.subscription.status === login.body.subscription.status, 'me subscription matches login');

  // register/business — aligned with login
  const bizPhone = `+90555${String(Date.now()).slice(-7)}`;
  const regBiz = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: 'Format Owner',
    ownerPhone: bizPhone,
    password: 'FormatTest1!',
    businessName: `${PREFIX} Salon`,
    businessType: 'berber',
    city: 'Izmir',
  });
  assert(regBiz.status === 201, `register/business status ${regBiz.status}`);
  assert(regBiz.body.success === true, 'register/business success flag');
  assertAuthContextShape(regBiz.body, { requireToken: true, requireBusiness: true });
  assert(regBiz.body.subscription.status === 'trialing', 'new business trialing');
  assert(regBiz.body.tenant.businessId === regBiz.body.business.id, 'tenant on register/business');

  // customer register — null tenant context
  const custPhone = `+90566${String(Date.now()).slice(-7)}`;
  const regCust = await request(app, 'POST', '/api/auth/register', null, {
    name: 'Format Customer',
    phone: custPhone,
    password: 'FormatTest1!',
    role: 'customer',
  });
  assert(regCust.status === 201, `customer register status ${regCust.status}`);
  assert(regCust.body.success === true, 'customer register success flag');
  assertAuthContextShape(regCust.body, { requireToken: true, requireBusiness: false });

  // buildAuthResponse unit parity
  const User = require('../models/User');
  const demoUser = await User.findOne({ phone: DEMO_PHONE });
  const built = await authService.buildAuthResponse(demoUser, { includeToken: true });
  assertAuthContextShape(built, { requireToken: true, requireBusiness: true });
  assert(built.business.id === login.body.business.id, 'buildAuthResponse business parity');

  await cleanup({
    businessId: regBiz.body.business.id,
    userId: regBiz.body.user.id,
    phone: custPhone,
  });

  console.log('✅ auth response format tests passed');
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
