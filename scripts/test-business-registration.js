#!/usr/bin/env node
/**
 * Business onboarding (registerBusiness) testleri.
 *
 * Kullanım: node scripts/test-business-registration.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PREFIX = `reg-test-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  delete require.cache[require.resolve('../services/onboardingService')];
  delete require.cache[require.resolve('../services/authService')];
  const onboardingService = require('../services/onboardingService');
  const authService = require('../services/authService');
  const DatabaseService = require('../services/databaseService');
  const Business = require('../models/Business');
  const User = require('../models/User');
  const Subscription = require('../models/Subscription');

  const phone = `+90533${String(Date.now()).slice(-7)}`;
  const password = 'RegTest123!';

  const { user: ownerDoc } = await onboardingService.registerBusiness({
    ownerName: 'Test Owner',
    ownerPhone: phone,
    ownerEmail: `${PREFIX}@example.com`,
    password,
    businessName: `${PREFIX} Kuaför`,
    businessType: 'berber',
    city: 'Yalova',
  });

  const result = await authService.buildAuthResponse(ownerDoc, { includeToken: true });

  assert(result.user?.id, 'user created');
  assert(result.business?.id, 'business created');
  assert(result.subscription?.status === 'trialing', 'subscription trialing');
  assert(result.subscription?.planCode === 'launch_299', 'planCode launch_299');
  assert(result.user.businessId === result.business.id, 'owner businessId linked');

  const dbUser = await User.findOne({ id: result.user.id });
  assert(dbUser?.businessId === result.business.id, 'owner businessId in DB');

  const dbBusiness = await Business.findOne({ id: result.business.id });
  assert(dbBusiness?.name.includes(PREFIX), 'business persisted');
  assert(dbBusiness?.city === 'Yalova', 'business city saved');

  const dbSub = await Subscription.findOne({ businessId: result.business.id });
  assert(dbSub?.status === 'trialing', 'DB subscription trialing');

  const services = await DatabaseService.getServicesByBusiness(result.business.id);
  assert(services.length > 0, 'default services created');
  assert(
    services.every((s) => String(s.businessId) === result.business.id),
    'all services scoped to businessId'
  );
  assert(
    services.every((s) => s.businessType === 'berber'),
    'services filtered by businessType'
  );

  let duplicateBlocked = false;
  try {
    await onboardingService.registerBusiness({
      ownerName: 'Duplicate Owner',
      ownerPhone: phone,
      password: 'AnotherPass1!',
      businessName: 'Another Business',
      businessType: 'kuafor',
      city: 'Istanbul',
    });
  } catch (err) {
    duplicateBlocked = err.status === 409;
  }
  assert(duplicateBlocked, 'duplicate phone blocked with 409');

  await cleanup({
    businessId: result.business.id,
    userId: result.user.id,
    phone,
  });

  console.log('✅ business registration tests passed');
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
