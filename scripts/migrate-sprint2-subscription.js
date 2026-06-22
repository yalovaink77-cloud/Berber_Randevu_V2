#!/usr/bin/env node
/**
 * Sprint 2 subscription migration — idempotent.
 *
 * Kullanım:
 *   node scripts/migrate-sprint2-subscription.js --dry-run
 *   node scripts/migrate-sprint2-subscription.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';

function log(msg) {
  console.log(DRY_RUN ? `[dry-run] ${msg}` : msg);
}

async function runStep(name, fn) {
  log(`\n── ${name} ──`);
  await fn();
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  const Business = require('../models/Business');
  const subscriptionService = require('../services/subscriptionService');

  await runStep('S1: launch_299 plan', async () => {
    if (DRY_RUN) {
      log('ensureLaunchPlan() çalıştırılacak');
      return;
    }
    const plan = await subscriptionService.ensureLaunchPlan();
    log(`Plan hazır: ${plan.code} (${plan.priceAmount} ${plan.currency})`);
  });

  await runStep('S2: Demo business aktif abonelik', async () => {
    const business = await Business.findOne({ id: DEMO_BUSINESS_ID });
    if (!business) {
      throw new Error(
        `Demo business bulunamadı (${DEMO_BUSINESS_ID}). Önce migrate-sprint1-tenant.js çalıştırın.`
      );
    }

    if (DRY_RUN) {
      log(`ensureDemoActiveSubscription(${DEMO_BUSINESS_ID}) çalıştırılacak`);
      return;
    }

    const sub = await subscriptionService.ensureDemoActiveSubscription(DEMO_BUSINESS_ID);
    log(`Demo subscription: businessId=${sub.businessId} planCode=${sub.planCode} status=${sub.status}`);
    if (sub.status !== 'active') {
      throw new Error('Demo subscription active olmalı');
    }
    if (sub.planCode !== 'launch_299') {
      throw new Error('Demo subscription planCode launch_299 olmalı');
    }
  });

  await runStep('S3: Doğrulama', async () => {
    const sub = await subscriptionService.getBusinessSubscription(DEMO_BUSINESS_ID);
    log(`getBusinessSubscription → status=${sub?.status || 'YOK'}`);
    if (!sub || sub.status !== 'active') {
      throw new Error('Demo aktif abonelik doğrulanamadı');
    }
    if (!subscriptionService.isSubscriptionActive(sub)) {
      throw new Error('Demo abonelik isSubscriptionActive=false');
    }
    log('✅ Sprint 2 subscription migration tamam');
  });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Migration hatası:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
