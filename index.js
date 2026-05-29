require('dotenv').config();
const express = require('express');
const cors = require('cors');
const appointmentRoutes = require('./dashboard/routes');
const authRoutes = require('./dashboard/authRoutes');
const assistantRoutes = require('./dashboard/assistantRoutes');
const path = require('path');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dashboard/public")));

app.use('/api/auth', authRoutes);
app.use('/api/services', authenticate, appointmentRoutes);
app.use('/api/appointments', authenticate, appointmentRoutes);
app.use('/api/assistant', authenticate, assistantRoutes);
// WhatsApp Webhook
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

// Gelen mesajları karşıla
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    res.status(200).send('OK');
    const message = whatsappService.parseIncomingMessage(req.body);
    if (!message || message.type !== 'text') return;
    await conversationService.handleMessage(message.from, message.text);
  } catch (error) {
    console.error('❌ Webhook hatası:', error.message);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Berber Randevu Sistemi çalışıyor' });
});

app.use((err, req, res, next) => {
  console.error('Hata:', err);
  res.status(err.status || 500).json({
    error: err.message || 'İç sunucu hatası',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
  console.log(`📍 http://localhost:${PORT}`);
});

module.exports = app;
