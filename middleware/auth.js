const { verifyToken } = require('../services/authService');

/**
 * Tüm isteklerde JWT kontrol eder.
 * req.user'a decode edilmiş payload yazar.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token gerekli' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
}

/**
 * Sadece berberler erişebilir.
 * authenticate'den sonra kullanılır.
 */
function requireBarber(req, res, next) {
  if (req.user?.role !== 'barber') {
    return res.status(403).json({ error: 'Bu işlem için berber yetkisi gerekli' });
  }
  next();
}

/**
 * Sadece kendi verisine erişim.
 * param: req.params içindeki id alanı adı (default: 'id')
 */
function requireOwnerOrBarber(paramKey = 'id') {
  return (req, res, next) => {
    const targetId = req.params[paramKey];
    if (req.user.role === 'barber' || req.user.id === targetId) {
      return next();
    }
    return res.status(403).json({ error: 'Bu veriye erişim yetkiniz yok' });
  };
}

module.exports = { authenticate, requireBarber, requireOwnerOrBarber };
