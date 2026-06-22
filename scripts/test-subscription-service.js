#!/usr/bin/env node
/**
 * subscriptionService birim / entegrasyon testleri.
 *
 * Kullanım: node scripts/test-subscription-service.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const TEST_BUSINESS_ID = `test-sub-svc-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  const subscriptionService = require('../services/subscriptionService');
  const Subscription = require('../models/Subscription');

  // ensureLaunchPlan — idempotent
  const plan1 = await subscriptionService.ensureLaunchPlan();
  const plan2 = await subscriptionService.ensureLaunchPlan();
  assert(plan1.code === 'launch_299', 'launch plan code');
  assert(plan1.priceAmount === 299, 'price from plan record');
  assert(String(plan1._id) === String(plan2._id), 'ensureLaunchPlan should not duplicate');

  // getPlanByCode — active only
  const activePlan = await subscriptionService.getPlanByCode('launch_299');
  assert(activePlan && activePlan.isActive, 'getPlanByCode returns active plan');
  assert(activePlan.priceAmount === 299, 'getPlanByCode priceAmount');

  const missing = await subscriptionService.getPlanByCode('nonexistent_plan');
  assert(missing === null, 'missing plan returns null');

  // isSubscriptionActive — status matrix
  assert(subscriptionService.isSubscriptionActive({ status: 'trialing' }) === true);
  assert(subscriptionService.isSubscriptionActive({ status: 'active' }) === true);
  assert(subscriptionService.isSubscriptionActive({ status: 'past_due' }) === false);
  assert(subscriptionService.isSubscriptionActive({ status: 'cancelled' }) === false);
  assert(subscriptionService.isSubscriptionActive({ status: 'expired' }) === false);
  assert(subscriptionService.isSubscriptionActive(null) === false);

  // createTrialSubscription
  const trial = await subscriptionService.createTrialSubscription(TEST_BUSINESS_ID);
  assert(trial.status === 'trialing', 'trial status');
  assert(trial.planCode === 'launch_299', 'trial planCode');
  assert(trial.priceAmount === plan1.priceAmount, 'trial price from plan');
  assert(trial.trialEndsAt instanceof Date, 'trialEndsAt set');

  const expectedDays = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS || '14', 10) || 14;
  const diffMs = trial.trialEndsAt.getTime() - trial.createdAt.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  assert(diffDays === expectedDays, `trialEndsAt should be ~${expectedDays} days ahead, got ${diffDays}`);

  // duplicate trial — 409
  let duplicateFailed = false;
  try {
    await subscriptionService.createTrialSubscription(TEST_BUSINESS_ID);
  } catch (err) {
    duplicateFailed = err.status === 409;
  }
  assert(duplicateFailed, 'duplicate createTrialSubscription should throw 409');

  // getBusinessSubscription
  const fetched = await subscriptionService.getBusinessSubscription(TEST_BUSINESS_ID);
  assert(fetched && fetched.businessId === TEST_BUSINESS_ID, 'getBusinessSubscription');

  // cleanup
  await Subscription.deleteOne({ businessId: TEST_BUSINESS_ID });

  console.log('✅ subscriptionService tests passed');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
