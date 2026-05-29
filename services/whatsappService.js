const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.token = process.env.META_ACCESS_TOKEN;
    this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    this.verifyToken = process.env.META_VERIFY_TOKEN;
    this.baseUrl = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
  }

  async sendMessage(to, text) {
    // Save to our in-memory simulated message store
    if (!global.simulatedChats) {
      global.simulatedChats = {};
    }
    if (!global.simulatedChats[to]) {
      global.simulatedChats[to] = [];
    }
    global.simulatedChats[to].push({
      role: 'assistant',
      content: text,
      timestamp: new Date()
    });

    try {
      if (!this.token || !this.phoneNumberId) {
        console.log(`ℹ️ [Simulation] Meta API credentials missing. Simulating sending of message to ${to}: ${text}`);
        return;
      }
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ Mesaj gönderildi: ${to}`);
    } catch (error) {
      console.warn('⚠️ Mesaj hatası (simülasyon sürdürülüyor):', error.response?.data || error.message);
      // Suppress throwing error when using simulation so it doesn't break the frontend experience
      if (!this.token) {
        return;
      }
      throw new Error('Mesaj gönderilemedi: ' + error.message);
    }
  }

  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('✅ Webhook doğrulandı');
      return challenge;
    }
    throw new Error('Webhook doğrulama başarısız');
  }

  parseIncomingMessage(body) {
    try {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return null;
      return {
        from: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body || '',
        timestamp: message.timestamp,
      };
    } catch (error) {
      console.error('❌ Parse hatası:', error.message);
      return null;
    }
  }
}

module.exports = new WhatsAppService();