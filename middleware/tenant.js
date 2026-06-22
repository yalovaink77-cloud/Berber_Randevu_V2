const { requireBusinessId } = require('../utils/tenant');

/**
 * JWT'deki businessId'yi req.businessId olarak atar (varsa).
 */
function attachTenantFromToken(req, _res, next) {
  if (req.user?.businessId) {
    req.businessId = String(req.user.businessId);
  }
  next();
}

/**
 * Berber isteklerinde tenant zorunlu.
 * authenticate → requireTenant sırasıyla kullanılır.
 */
function requireTenant(req, res, next) {
  if (req.user?.role !== 'barber') {
    return next();
  }
  try {
    req.businessId = requireBusinessId(req.user.businessId);
    next();
  } catch (err) {
    return res.status(err.status || 403).json({
      error: 'İşletme bağlamı bulunamadı. Lütfen tekrar giriş yapın.',
    });
  }
}

module.exports = { attachTenantFromToken, requireTenant };
