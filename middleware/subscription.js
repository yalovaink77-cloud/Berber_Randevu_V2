const { requireBusinessId } = require('../utils/tenant');
const {
  getBusinessSubscription,
  isSubscriptionActive,
} = require('../services/subscriptionService');

/**
 * Berber isteklerinde aktif abonelik zorunlu.
 * authenticate → requireTenant → requireActiveSubscription sırasıyla kullanılır.
 */
async function requireActiveSubscription(req, res, next) {
  if (req.user?.role !== 'barber') {
    return next();
  }

  let businessId;
  try {
    businessId = requireBusinessId(req.businessId || req.user?.businessId);
    req.businessId = businessId;
  } catch (err) {
    return res.status(err.status || 403).json({
      error: 'İşletme bağlamı bulunamadı. Lütfen tekrar giriş yapın.',
    });
  }

  try {
    const subscription = await getBusinessSubscription(businessId);
    if (!subscription) {
      return res.status(403).json({ error: 'Aktif abonelik bulunamadı.' });
    }

    if (!isSubscriptionActive(subscription)) {
      return res.status(403).json({ error: 'Abonelik aktif değil.' });
    }

    req.subscription = subscription;
    return next();
  } catch (err) {
    return next(err);
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Yalnızca yazma isteklerinde aktif abonelik zorunlu.
 * GET/HEAD okuma erişimini açık bırakır.
 */
function requireActiveSubscriptionOnWrite(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }
  return requireActiveSubscription(req, res, next);
}

module.exports = { requireActiveSubscription, requireActiveSubscriptionOnWrite };
