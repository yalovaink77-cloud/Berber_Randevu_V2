const AIService = require('./aiService');
const WhatsAppService = require('./whatsappService');
const DatabaseService = require('./databaseService');
const AppointmentLogic = require('../logic/appointmentLogic');

// Konuşma hafızası - her müşteri için ayrı
const sessions = {};

class ConversationService {
  static async handleMessage(from, text, barberId) {
    try {
      // Oturum yoksa oluştur
      if (!sessions[from]) {
        sessions[from] = {
          step: 'greeting',
          data: {},
          history: [],
        };
      }

      const session = sessions[from];
      session.history.push({ role: 'user', content: text });

      // Get active barber ID context
      if (!barberId) {
        const barbers = await DatabaseService.getAllBarbers();
        if (barbers && barbers.length > 0) {
          barberId = barbers[0].id;
        } else {
          barberId = 'test-barber-id';
        }
      }

      // Müşteriyi Tanı - Önce Rehberdeki Contact kayıtlarından ara
      const contact = await DatabaseService.getContactByPhone(barberId, from);
      const isSavedContact = !!contact;
      let customer = contact;
      
      // Bulunamazsa genel User tablosundan ara
      if (!customer) {
        customer = await DatabaseService.getUserByPhone(from);
      }

      // AI ile cevap üret
      const response = await AIService.generateConversationResponse(
        text,
        session,
        customer,
        isSavedContact
      );

      // Cevabı gönder
      await WhatsAppService.sendMessage(from, response.message);

      // Randevu alındıysa kaydet
      if (response.appointment) {
        // Enforce same barberId just in case
        if (!response.appointment.barberId) {
          response.appointment.barberId = barberId;
        }
        await AppointmentLogic.createAppointment(response.appointment);
      }

      // Müşteri adını otomatik öğren/kaydet veya güncelle (Rehber uyumu için)
      const learnedName = response.newCustomer?.name || response.data?.name || (response.appointment && response.appointment.customerName);
      if (learnedName && learnedName !== 'Değerli Müşteri') {
        // 1. Genel User kaydı oluştur veya güncelle
        let extUser = await DatabaseService.getUserByPhone(from);
        if (!extUser) {
          extUser = await DatabaseService.createUser({
            name: learnedName,
            phone: from,
            role: 'customer',
          });
        }

        // 2. Berber rehberine (Contact) otomatik ekle veya güncelle
        const existingContact = await DatabaseService.getContactByPhone(barberId, from);
        if (!existingContact) {
          await DatabaseService.upsertContact(barberId, {
            phone: from,
            name: learnedName,
            category: 'customer',
            autoReplyEnabled: true,
            notes: 'WhatsApp Randevu Asistanı ile otomatik kaydedildi.'
          });
        } else if (existingContact.name !== learnedName) {
          await DatabaseService.upsertContact(barberId, {
            phone: from,
            name: learnedName,
            category: existingContact.category || 'customer',
            autoReplyEnabled: existingContact.autoReplyEnabled !== false,
            notes: existingContact.notes || 'WhatsApp Randevu Asistanı ile güncellendi.'
          });
        }
      }

      // Oturumu güncelle
      session.history.push({ role: 'assistant', content: response.message });
      session.step = response.nextStep || session.step;
      session.data = { ...session.data, ...response.data };

    } catch (error) {
      console.error('❌ Konuşma hatası:', error.message);
      await WhatsAppService.sendMessage(from, 'Üzgünüm, bir sorun oluştu. Lütfen tekrar deneyin.');
    }
  }
}

module.exports = ConversationService;