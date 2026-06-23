#!/usr/bin/env node
/**
 * GET /api/dashboard/stats — KPI testleri.
 *
 * Kullanım: node scripts/test-dashboard-stats.js
 */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const PREFIX = `dash-stats-${Date.now()}`;
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
  app.use('/api/dashboard', authenticate, require('../dashboard/dashboardRoutes'));
  app.use('/api/customers', authenticate, require('../dashboard/customerRoutes'));
  app.use('/api/auth', require('../dashboard/authRoutes'));
  return app;
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function registerBusiness(app, suffixNum) {
  const phone = `+9055${String(Date.now() + suffixNum).slice(-8)}`;
  const password = 'DashStats123!';
  const res = await request(app, 'POST', '/api/auth/register/business', null, {
    ownerName: `Owner ${suffixNum}`,
    ownerPhone: phone,
    ownerEmail: `${PREFIX}-${suffixNum}@example.com`,
    password,
    businessName: `${PREFIX} Biz ${suffixNum}`,
    businessType: 'berber',
    city: 'Ankara',
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
        passwordHash: bcrypt.hashSync('DashStats123!', 10),
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

  delete require.cache[require.resolve('../dashboard/dashboardRoutes')];
  delete require.cache[require.resolve('../services/dashboardStatsService')];
  delete require.cache[require.resolve('../middleware/auth')];

  const app = buildApp();
  const bizA = await registerBusiness(app, 1);
  const bizB = await seedOtherBusiness();
  const Appointment = require('../models/Appointment');
  const authService = require('../services/authService');
  const { start: todayStart, end: todayEnd } = getTodayRange();

  // empty tenant stats
  const emptyRes = await request(app, 'GET', '/api/dashboard/stats', bizA.token);
  assert(emptyRes.status === 200, `empty stats expected 200, got ${emptyRes.status}`);
  assert(emptyRes.body.success === true, 'success flag');
  assert(emptyRes.body.stats.todayAppointments === 0, 'empty todayAppointments');
  assert(emptyRes.body.stats.totalCustomers === 0, 'empty totalCustomers');
  assert(emptyRes.body.stats.upcomingAppointments === 0, 'empty upcomingAppointments');

  const customerPhone = `0555${String(Date.now()).slice(-7)}`;
  const customerPhoneNorm = authService.normalizePhoneNumber(customerPhone);

  const createCustomer = await request(app, 'POST', '/api/customers', bizA.token, {
    name: 'KPI Müşteri',
    phone: customerPhone,
  });
  assert(createCustomer.status === 201, 'customer create');

  const tomorrow = new Date(todayEnd.getTime() + 2 * 60 * 60 * 1000);
  tomorrow.setMinutes(0, 0, 0);

  await Appointment.create({
    id: uuidv4(),
    businessId: bizA.businessId,
    customerId: createCustomer.body.customer.id,
    customerName: 'KPI Müşteri',
    customerPhone: customerPhoneNorm,
    barberId: bizA.barberId,
    barberName: bizA.barberName,
    serviceType: 'haircut',
    appointmentDate: new Date(todayStart.getTime() + 10 * 60 * 60 * 1000),
    duration: 30,
    status: 'completed',
    price: 300,
  });

  await Appointment.create({
    id: uuidv4(),
    businessId: bizA.businessId,
    customerId: createCustomer.body.customer.id,
    customerName: 'KPI Müşteri',
    customerPhone: customerPhoneNorm,
    barberId: bizA.barberId,
    barberName: bizA.barberName,
    serviceType: 'haircut',
    appointmentDate: new Date(todayStart.getTime() + 12 * 60 * 60 * 1000),
    duration: 30,
    status: 'confirmed',
    price: 200,
  });

  await Appointment.create({
    id: uuidv4(),
    businessId: bizA.businessId,
    customerId: createCustomer.body.customer.id,
    customerName: 'KPI Müşteri',
    customerPhone: customerPhoneNorm,
    barberId: bizA.barberId,
    barberName: bizA.barberName,
    serviceType: 'haircut',
    appointmentDate: tomorrow,
    duration: 30,
    status: 'pending',
    price: 150,
  });

  // tenant B appointment — must not appear in tenant A stats
  await Appointment.create({
    id: uuidv4(),
    businessId: bizB.businessId,
    customerId: uuidv4(),
    customerName: 'Other Tenant',
    customerPhone: '+905009999999',
    barberId: bizB.barberId,
    barberName: 'Other Berber',
    serviceType: 'haircut',
    appointmentDate: new Date(todayStart.getTime() + 11 * 60 * 60 * 1000),
    duration: 30,
    status: 'completed',
    price: 9999,
  });

  const statsRes = await request(app, 'GET', '/api/dashboard/stats', bizA.token);
  assert(statsRes.status === 200, `stats expected 200, got ${statsRes.status}`);
  const stats = statsRes.body.stats;
  assert(stats.todayAppointments === 2, `todayAppointments expected 2, got ${stats.todayAppointments}`);
  assert(stats.todayCompletedAppointments === 1, `todayCompleted expected 1, got ${stats.todayCompletedAppointments}`);
  assert(stats.todayUpcomingAppointments === 1, `todayUpcoming expected 1, got ${stats.todayUpcomingAppointments}`);
  assert(stats.todayEstimatedRevenue === 500, `estimated expected 500, got ${stats.todayEstimatedRevenue}`);
  assert(stats.todayActualRevenue === 300, `actual expected 300, got ${stats.todayActualRevenue}`);
  assert(stats.totalCustomers === 1, `totalCustomers expected 1, got ${stats.totalCustomers}`);
  assert(stats.upcomingAppointments === 2, `upcoming expected 2, got ${stats.upcomingAppointments}`);

  const otherStats = await request(app, 'GET', '/api/dashboard/stats', bizB.token);
  assert(otherStats.status === 200, 'tenant B stats');
  assert(otherStats.body.stats.todayActualRevenue === 9999, 'tenant B own revenue');
  assert(otherStats.body.stats.totalCustomers === 0, 'tenant B no customers');

  console.log('✅ test-dashboard-stats.js — tüm senaryolar geçti');
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
