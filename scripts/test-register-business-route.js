#!/usr/bin/env node
/**
 * POST /api/auth/register/business route testleri.
 *
 * Kullanım: node scripts/test-register-business-route.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const PREFIX = `route-reg-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function request(app, path, body) {
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../dashboard/authRoutes')];
  delete require.cache[require.resolve('../services/onboardingService')];
  delete require.cache[require.resolve('../services/authService')];

  const app = buildApp();
  const phone = `+90544${String(Date.now()).slice(-7)}`;
  const password = 'RouteReg123!';

  const created = await request(app, '/api/auth/register/business', {
    ownerName: 'Route Owner',
    ownerPhone: phone,
    ownerEmail: `${PREFIX}@example.com`,
    password,
    businessName: `${PREFIX} Berber`,
    businessType: 'berber',
    city: 'Bursa',
  });

  assert(created.status === 201, `expected 201, got ${created.status}`);
  assert(created.body.success === true, 'success flag');
  assert(created.body.user?.id, 'user returned');
  assert(created.body.business?.id, 'business returned');
  assert(created.body.subscription?.status === 'trialing', 'subscription trialing');
  assert(created.body.token, 'token returned');

  const decoded = jwt.verify(created.body.token, process.env.JWT_SECRET);
  assert(decoded.businessId === created.body.business.id, 'businessId in token');
  assert(decoded.id === created.body.user.id, 'user id in token');
  assert(decoded.role === 'barber', 'owner role in token');

  const duplicate = await request(app, '/api/auth/register/business', {
    ownerName: 'Duplicate Owner',
    ownerPhone: phone,
    password: 'AnotherPass1!',
    businessName: 'Another Biz',
    businessType: 'kuafor',
    city: 'Ankara',
  });
  assert(duplicate.status === 409, `duplicate expected 409, got ${duplicate.status}`);
  assert(duplicate.body.error, 'duplicate error message');

  const invalid = await request(app, '/api/auth/register/business', {
    ownerPhone: phone,
    password: 'short',
  });
  assert(invalid.status === 400, `validation expected 400, got ${invalid.status}`);

  await cleanup({
    businessId: created.body.business.id,
    userId: created.body.user.id,
  });

  console.log('✅ register/business route tests passed');
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
