const { verifyToken } = require('../services/authService');

/**
 * Mobil uygulama: X-Device-Api-Key + X-Barber-Id
 * Panel: Bearer JWT (mevcut akış)
 */
function authenticateDeviceOrBarber(req, res, next) {
  const deviceKey = req.headers['x-device-api-key'];
  const expected = process.env.DEVICE_API_KEY;

  if (deviceKey && expected && deviceKey === expected) {
    const barberId = req.headers['x-barber-id'] || req.body?.barberId;
    if (!barberId) {
      return res.status(400).json({ error: 'X-Barber-Id veya barberId gerekli' });
    }
    req.user = { id: String(barberId), role: 'barber' };
    req.authSource = 'device';
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token veya geçerli cihaz anahtarı gerekli' });
  }

  try {
    req.user = verifyToken(header.split(' ')[1]);
    req.authSource = 'jwt';
    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
}

module.exports = { authenticateDeviceOrBarber };
