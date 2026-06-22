#!/usr/bin/env node
/**
 * Customer API route testleri.
 *
 * Kullanım: node scripts/test-customer-routes.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const PREFIX = `cust-route-${Date.now()}`;
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
  app.use('/api/auth', require('../dashboard/authRoutes'));
  return app;
}

async function registerBusiness(app, suffixNum) {
  const phone = `+9055${String(Date.now() + suffixNum).slice(-8)}`;
  const password = 'CustRoute123!';
  const res = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: `Owner ${suffixNum}`,
    ownerPhone: phone,
    ownerEmail: `${PREFIX}-${suffixNum}@example.com`,
    password,
    businessName: `${PREFIX} Biz ${suffixNum}`,
    businessType: 'berber',
    city: 'Antalya',
  });
  assert(res.status === 201, `register expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  return {
    token: res.body.token,
    businessId: res.body.business.id,
    barberId: res.body.user.id,
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
        passwordHash: bcrypt.hashSync('CustRoute123!', 10),
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

async function cleanup(ids) {
  const User = require('../models/User');
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const Service = require('../models/Service');
  const Customer = require('../models/Customer');

  const businessIds = [ids.businessId, OTHER_BUSINESS_ID].filter(Boolean);
  if (businessIds.length) {
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

  const customerPhone = `0555${String(Date.now()).slice(-7)}`;
  const customerPhoneNorm = require('../services/authService').normalizePhoneNumber(customerPhone);

  // Create
  const createRes = await request(app, 'POST', '/api/customers', bizA.token, {
    name: 'Route Müşteri',
    phone: customerPhone,
    email: 'musteri@example.com',
    notes: 'Test notu',
  });
  assert(createRes.status === 201, `create expected 201, got ${createRes.status}`);
  assert(createRes.body.customer?.id, 'customer id returned');
  assert(createRes.body.customer?.phone === customerPhoneNorm, 'phone normalized on create');
  assert(createRes.body.customer?.businessId === bizA.businessId, 'businessId from tenant');

  const customerId = createRes.body.customer.id;

  // List
  const listRes = await request(app, 'GET', '/api/customers?q=Route', bizA.token);
  assert(listRes.status === 200, `list expected 200, got ${listRes.status}`);
  assert(Array.isArray(listRes.body.customers), 'customers array');
  assert(
    listRes.body.customers.some((c) => c.id === customerId),
    'created customer appears in list'
  );

  // Get by id
  const getRes = await request(app, 'GET', `/api/customers/${customerId}`, bizA.token);
  assert(getRes.status === 200, `get expected 200, got ${getRes.status}`);
  assert(getRes.body.customer?.id === customerId, 'get by id');

  // Duplicate phone
  const dupRes = await request(app, 'POST', '/api/customers', bizA.token, {
    name: 'Başka İsim',
    phone: customerPhone.replace(/^0/, ''),
  });
  assert(dupRes.status === 409, `duplicate expected 409, got ${dupRes.status}`);

  // Cross tenant — B cannot read A customer
  const crossGet = await request(app, 'GET', `/api/customers/${customerId}`, bizB.token);
  assert(crossGet.status === 404, `cross tenant GET expected 404, got ${crossGet.status}`);

  // Update (+ body businessId ignored)
  const updateRes = await request(app, 'PUT', `/api/customers/${customerId}`, bizA.token, {
    name: 'Güncel Müşteri',
    notes: 'Güncellendi',
    businessId: OTHER_BUSINESS_ID,
    id: 'hijack-id',
  });
  assert(updateRes.status === 200, `update expected 200, got ${updateRes.status}`);
  assert(updateRes.body.customer?.name === 'Güncel Müşteri', 'name updated');
  assert(updateRes.body.customer?.businessId === bizA.businessId, 'businessId unchanged');

  const Customer = require('../models/Customer');
  const dbRow = await Customer.findOne({ id: customerId });
  assert(dbRow?.businessId === bizA.businessId, 'DB businessId not hijacked');
  assert(dbRow?.businessId !== OTHER_BUSINESS_ID, 'body businessId ignored on update');

  // Same phone different business → different customer
  const otherCreate = await request(app, 'POST', '/api/customers', bizB.token, {
    name: 'Other Tenant Müşteri',
    phone: customerPhone,
  });
  assert(otherCreate.status === 201, `other tenant create expected 201, got ${otherCreate.status}`);
  assert(
    otherCreate.body.customer?.id !== customerId,
    'same phone different business = different customer'
  );

  await cleanup({ businessId: bizA.businessId, userId: bizA.barberId });

  console.log('✅ customer routes tests passed');
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
