const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { requireBusinessId } = require('../utils/tenant');

const LAUNCH_PLAN_CODE = process.env.DEFAULT_PLAN_CODE || 'launch_299';
const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';
const DEFAULT_TRIAL_DAYS = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS || '14', 10);

const LAUNCH_PLAN_DEFAULTS = {
  code: LAUNCH_PLAN_CODE,
  name: 'Launch Paketi',
  priceAmount: 299,
  currency: 'TRY',
  billingInterval: 'monthly',
  features: ['randevu_yonetimi', 'whatsapp_asistan'],
  isActive: true,
};

const ACTIVE_STATUSES = new Set(['trialing', 'active']);

/**
 * Aktif plan kataloğundan code ile plan getirir.
 */
async function getPlanByCode(code) {
  if (!code) return null;
  return Plan.findOne({ code: String(code), isActive: true });
}

/**
 * launch_299 planını yoksa oluşturur; varsa mevcut kaydı döner.
 */
async function ensureLaunchPlan() {
  let plan = await Plan.findOne({ code: LAUNCH_PLAN_CODE });
  if (plan) return plan;

  return Plan.create({
    ...LAUNCH_PLAN_DEFAULTS,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Yeni işletme için trial abonelik oluşturur.
 */
async function createTrialSubscription(businessId) {
  const tenantId = requireBusinessId(businessId);
  const existing = await getBusinessSubscription(tenantId);
  if (existing) {
    const err = new Error('Bu işletme için abonelik zaten mevcut');
    err.status = 409;
    throw err;
  }

  const plan = await ensureLaunchPlan();
  const trialDays = Number.isFinite(DEFAULT_TRIAL_DAYS) && DEFAULT_TRIAL_DAYS > 0
    ? DEFAULT_TRIAL_DAYS
    : 14;

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  return Subscription.create({
    businessId: tenantId,
    planCode: plan.code,
    status: 'trialing',
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    trialEndsAt,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Demo işletme için aktif abonelik oluşturur veya mevcut kaydı active yapar.
 */
async function ensureDemoActiveSubscription(businessId = DEMO_BUSINESS_ID) {
  const tenantId = requireBusinessId(businessId);
  const plan = await ensureLaunchPlan();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const payload = {
    businessId: tenantId,
    planCode: plan.code,
    status: 'active',
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    updatedAt: now,
  };

  const existing = await getBusinessSubscription(tenantId);
  if (existing) {
    if (existing.status === 'active' && isSubscriptionActive(existing)) {
      return existing;
    }
    return Subscription.findOneAndUpdate(
      { businessId: tenantId },
      { $set: payload },
      { new: true }
    );
  }

  return Subscription.create({
    ...payload,
    createdAt: now,
  });
}

/**
 * İşletmenin güncel abonelik kaydını döner (en son güncellenen).
 */
async function getBusinessSubscription(businessId) {
  if (!businessId) return null;
  return Subscription.findOne({ businessId: String(businessId) }).sort({ updatedAt: -1 });
}

/**
 * Abonelik erişim gate'i için durum kontrolü.
 */
function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  return ACTIVE_STATUSES.has(subscription.status);
}

function computeTrialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Auth / panel için sanitize edilmiş abonelik özeti.
 * Kayıt yoksa null döner; hata fırlatmaz.
 */
async function getSubscriptionSummary(businessId) {
  if (!businessId) return null;

  const subscription = await getBusinessSubscription(businessId);
  if (!subscription) return null;

  const obj = subscription.toObject ? subscription.toObject() : { ...subscription };
  const effectiveIsActive = isSubscriptionActive(subscription);
  const daysRemaining =
    obj.status === 'trialing' ? computeTrialDaysRemaining(obj.trialEndsAt) : null;

  return {
    planCode: obj.planCode,
    status: obj.status,
    priceAmount: obj.priceAmount,
    currency: obj.currency,
    billingInterval: obj.billingInterval,
    trialEndsAt: obj.trialEndsAt || null,
    currentPeriodStart: obj.currentPeriodStart || null,
    currentPeriodEnd: obj.currentPeriodEnd || null,
    isActive: effectiveIsActive,
    effectiveIsActive,
    daysRemaining,
  };
}

module.exports = {
  getPlanByCode,
  ensureLaunchPlan,
  ensureDemoActiveSubscription,
  createTrialSubscription,
  getBusinessSubscription,
  getSubscriptionSummary,
  isSubscriptionActive,
  computeTrialDaysRemaining,
  LAUNCH_PLAN_CODE,
  DEMO_BUSINESS_ID,
};
