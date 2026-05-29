const DatabaseService = require('./databaseService');
const WhatsAppService = require('./whatsappService');

const CUSTOMER_REPLY =
  'Merhaba, şu an müşterimle ilgileniyorum. Randevu almak için WhatsApp üzerinden gün ve işlem bilgisini yazabilirsiniz; uygun saatleri hemen paylaşacağım.';

const UNKNOWN_REPLY =
  'Merhaba, şu an çalışıyorum. Randevu almak veya not bırakmak için WhatsApp üzerinden yazabilirsiniz; müsait olunca dönüş yapacağım.';

const PRIVATE_REPLY =
  'Şu an çalışıyorum, müsait olunca seni arayacağım.';

class CallAssistantService {
  static normalizeStatus(status) {
    if (['available', 'working', 'break', 'closed'].includes(status)) {
      return status;
    }
    return 'working';
  }

  static decideReply({ contact, hasAppointmentHistory, barberStatus, assistantSettings = {} }) {
    const status = this.normalizeStatus(barberStatus);

    if (status === 'available') {
      return {
        action: 'none',
        message: '',
        reason: 'Berber müsait görünüyor; otomatik mesaj gerekmedi.',
      };
    }

    if (contact?.category === 'blocked' || contact?.autoReplyEnabled === false) {
      return {
        action: 'none',
        message: '',
        reason: 'Bu kişi için otomatik mesaj kapalı.',
      };
    }

    // Rehberde kayıtlı bir yakın veya tanıdık/müşteri ise
    if (contact) {
      return {
        action: 'send',
        message: '', // AI tarafından dinamik üretilecek
        reason: 'Rehberde kayıtlı tanıdık kişi olduğu tespit edildi.',
      };
    }

    // Randevu geçmişi olan müşteri ise
    if (hasAppointmentHistory) {
      return {
        action: 'send',
        message: '', // AI tarafından dinamik üretilecek
        reason: 'Daha önce randevu almış tanıdık müşteri.',
      };
    }

    // Bilinmeyen / kayıtsız numara ise
    return {
      action: assistantSettings.unknownCallerAutoReply !== false ? 'send' : 'manual_review',
      message: '', // AI tarafından dinamik üretilecek
      reason: 'Kayıtsız/Bilinmeyen numara.',
    };
  }

  static async handleMissedCall({
    barberId,
    fromPhone,
    fromName,
    barberStatus = 'working',
    sendAutoReply = false,
    assistantSettings = {},
    callAt,
  }) {
    const AIService = require('./aiService');
    const contact = await DatabaseService.getContactByPhone(barberId, fromPhone);
    const hasAppointmentHistory = await DatabaseService.hasAppointmentHistoryWithPhone(
      barberId,
      fromPhone
    );
    const decision = this.decideReply({
      contact,
      hasAppointmentHistory,
      barberStatus,
      assistantSettings,
    });

    // Berber ismini alalım
    const profile = await DatabaseService.getUserById(barberId);
    const barberName = profile?.name || 'Umut Berber';

    // Karara göre AI ile kişiye özel, samimi yanıt hazırlıyoruz
    if (decision.action !== 'none') {
      const dynamicMessage = await AIService.generateMissedCallResponse({
        contact,
        fromPhone,
        barberName,
        barberStatus,
      });
      decision.message = dynamicMessage;
    }

    let autoReplySent = false;
    if (sendAutoReply && decision.action === 'send' && decision.message) {
      await WhatsAppService.sendMessage(fromPhone, decision.message);
      autoReplySent = true;
    }

    const missedCall = await DatabaseService.createMissedCall({
      barberId,
      fromPhone,
      fromName: fromName || contact?.name || 'Değerli Müşterimiz',
      contactCategory: contact?.category || (hasAppointmentHistory ? 'customer' : 'unknown'),
      barberStatus: this.normalizeStatus(barberStatus),
      autoReplyMessage: decision.message,
      autoReplyAction: decision.action,
      autoReplySent,
      callAt,
    });

    return {
      missedCall,
      decision: {
        ...decision,
        autoReplySent,
      },
      contact,
      hasAppointmentHistory,
    };
  }
}

module.exports = CallAssistantService;
