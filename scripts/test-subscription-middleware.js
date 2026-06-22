#!/usr/bin/env node
/**
 * requireActiveSubscription middleware testleri.
 *
 * Kullanım: node scripts/test-subscription-middleware.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runMiddleware(middleware, req) {
  const res = mockRes();
  let nextErr = null;
  let nextCalled = false;

  await middleware(req, res, (err) => {
    nextCalled = true;
    nextErr = err || null;
  });

  return { res, nextCalled, nextErr };
}

async function seedSubscription(Subscription, businessId, status) {
  await Subscription.deleteMany({ businessId });
  return Subscription.create({
    businessId,
    planCode: 'launch_299',
    status,
    priceAmount: 299,
    currency: 'TRY',
    billingInterval: 'monthly',
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../middleware/subscription')];
  const { requireActiveSubscription } = require('../middleware/subscription');
  const Subscription = require('../models/Subscription');
  const subscriptionService = require('../services/subscriptionService');

  await subscriptionService.ensureLaunchPlan();

  const prefix = `mw-test-${Date.now()}`;

  // Non-barber bypass
  {
    const { res, nextCalled } = await runMiddleware(requireActiveSubscription, {
      user: { role: 'customer', id: 'cust-1' },
    });
    assert(nextCalled, 'customer should bypass middleware');
    assert(res.statusCode === 200, 'customer should not set error status');
  }

  // Barber without businessId
  {
    const { res, nextCalled } = await runMiddleware(requireActiveSubscription, {
      user: { role: 'barber', id: 'barber-1' },
    });
    assert(!nextCalled, 'barber without businessId should not pass');
    assert(res.statusCode === 403, 'missing businessId -> 403');
    assert(res.body?.error, 'error payload expected');
  }

  // Barber without subscription
  {
    const businessId = `${prefix}-no-sub`;
    const { res, nextCalled } = await runMiddleware(requireActiveSubscription, {
      user: { role: 'barber', id: 'barber-2', businessId },
      businessId,
    });
    assert(!nextCalled, 'missing subscription should not pass');
    assert(res.statusCode === 403, 'missing subscription -> 403');
    assert(typeof res.body?.error === 'string', 'json error message');
  }

  const allowed = ['trialing', 'active'];
  for (const status of allowed) {
    const businessId = `${prefix}-${status}`;
    await seedSubscription(Subscription, businessId, status);
    const req = {
      user: { role: 'barber', id: 'barber-3', businessId },
      businessId,
    };
    const { res, nextCalled } = await runMiddleware(requireActiveSubscription, req);
    assert(nextCalled, `${status} should pass`);
    assert(res.statusCode === 200, `${status} should not error`);
    assert(req.subscription?.status === status, 'req.subscription attached');
  }

  const blocked = ['past_due', 'cancelled', 'expired'];
  for (const status of blocked) {
    const businessId = `${prefix}-${status}`;
    await seedSubscription(Subscription, businessId, status);
    const { res, nextCalled } = await runMiddleware(requireActiveSubscription, {
      user: { role: 'barber', id: 'barber-4', businessId },
      businessId,
    });
    assert(!nextCalled, `${status} should be blocked`);
    assert(res.statusCode === 403, `${status} -> 403`);
    assert(typeof res.body?.error === 'string', `${status} json error`);
  }

  // cleanup
  await Subscription.deleteMany({ businessId: new RegExp(`^${prefix}`) });

  console.log('✅ requireActiveSubscription middleware tests passed');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
