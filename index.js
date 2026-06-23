require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const appointmentRoutes = require('./dashboard/routes');
const serviceRoutes = require('./dashboard/serviceRoutes');
const authRoutes = require('./dashboard/authRoutes');
const assistantRoutes = require('./dashboard/assistantRoutes');
const businessRoutes = require('./dashboard/businessRoutes');
const customerRoutes = require('./dashboard/customerRoutes');
const dashboardRoutes = require('./dashboard/dashboardRoutes');
const deviceRoutes = require('./dashboard/deviceRoutes');
const path = require('path');
const { authenticate } = require('./middleware/auth');

// Production ortam kontrolleri
if (process.env.NODE_ENV === 'production') {
  if (!process.env.META_APP_SECRET) {
    throw new Error('META_APP_SECRET tanımlı değil. Production ortamında webhook imza doğrulaması zorunludur.');
  }
  if (!process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS.includes('localhost')) {
    throw new Error('Production\'da ALLOWED_ORIGINS gerçek domain olmalı (localhost içermemeli).');
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Güvenlik başlıkları ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Dashboard inline script kullanıyor, gerekirse açılabilir
}));

// ─── CORS ─────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // curl / Postman gibi origin'siz isteklere sadece geliştirmede izin ver
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} adresine izin verilmiyor`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'dashboard/public')));

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 20,                   // maks 20 istek
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi, lütfen 15 dakika sonra tekrar deneyin.' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

app.get('/api/public/config', (req, res) => {
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  res.json({
    productName: process.env.APP_NAME || 'Akıllı Berber',
    referralUrl: process.env.REFERRAL_URL || `${proto}://${host}`,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/appointments', authenticate, appointmentRoutes);
app.use('/api/services', authenticate, serviceRoutes);
app.use('/api/assistant', authenticate, assistantRoutes);
app.use('/api/business', authenticate, businessRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/device', deviceRoutes);

// ─── WhatsApp Webhook ─────────────────────────────────────────────────────
const whatsappService = require('./services/whatsappService');
const conversationService = require('./services/conversationService');

// Webhook doğrulama (Meta ilk bağlantıda kontrol eder)
app.get('/webhook/whatsapp', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const result = whatsappService.verifyWebhook(mode, token, challenge);
    res.status(200).send(result);
  } catch (error) {
    res.status(403).send('Forbidden');
  }
});

// Gelen mesajları karşıla — imza doğrulamalı
app.post('/webhook/whatsapp', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Meta webhook imza doğrulaması (X-Hub-Signature-256)
    const signature = req.headers['x-hub-signature-256'];
    if (process.env.META_APP_SECRET && signature) {
      const crypto = require('crypto');
      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(req.body)
        .digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(403).send('Invalid signature');
      }
    } else if (process.env.META_APP_SECRET && !signature) {
      return res.status(403).send('Missing signature');
    }

    res.status(200).send('OK');

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message = whatsappService.parseIncomingMessage(body);
    if (!message || message.type !== 'text') return;
    await conversationService.handleMessage(message.from, message.text);
  } catch (error) {
    console.error('❌ Webhook hatası:', error.message);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── Global hata yakalayıcı ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} →`, err.message);

  // CORS hatasını kullanıcıya göster ama iç detayları gizle
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Bu kaynaktan erişim yasak' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Sunucu hatası'
      : (err.message || 'İç sunucu hatası'),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
  console.log(`📍 http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔓 CORS izinli origin'ler: ${allowedOrigins.join(', ')}`);
  }
});

module.exports = app;
