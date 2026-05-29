const DatabaseService = require('../services/databaseService');
const WhatsAppService = require('../services/whatsappService');
const AIService = require('../services/aiService');

class AppointmentLogic {
  static buildAppointmentDate(preferredDate, preferredTime) {
    if (!preferredDate) {
      return new Date();
    }

    if (preferredTime) {
      return new Date(`${preferredDate}T${preferredTime}:00`);
    }

    return new Date(preferredDate);
  }

  /**
   * Yeni randevu oluştur
   */
  static async createAppointment(appointmentData) {
    try {
      // Bağımsızlık kontrolü - başka randevu var mı?
      const barberAppointments = await DatabaseService.getActiveAppointmentsByBarber(
        appointmentData.barberId
      );

      const conflicting = barberAppointments.find((apt) => {
        const existingStart = new Date(apt.appointmentDate);
        const existingEnd = new Date(existingStart.getTime() + apt.duration * 60000);

        const newStart = new Date(appointmentData.appointmentDate);
        const newEnd = new Date(newStart.getTime() + (appointmentData.duration || 30) * 60000);

        return (
          (newStart >= existingStart && newStart < existingEnd) ||
          (newEnd > existingStart && newEnd <= existingEnd) ||
          (newStart <= existingStart && newEnd >= existingEnd)
        );
      });

      if (conflicting) {
        throw new Error('Bu zaman diliminde berber mesguldu');
      }

      // Randevu oluştur
      const appointment = await DatabaseService.createAppointment(appointmentData);

      // AI özeti oluştur
      try {
        const aiSummary = await AIService.generateAppointmentSummary(appointment);
        appointment.aiSummary = aiSummary;
        await appointment.save();
      } catch (error) {
        console.error('AI ozeti olusturulamadi:', error.message);
      }

      // WhatsApp onay mesajı gönder
      try {
        const date = new Date(appointment.appointmentDate);
        const dateStr = date.toLocaleDateString('tr-TR');
        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const message = `Merhaba ${appointment.customerName}!\n\nRandevunuz alindi\nBerber: ${appointment.barberName}\nTarih: ${dateStr}\nSaat: ${timeStr}\n\nTesekkur ederiz!`;
        await WhatsAppService.sendMessage(appointmentData.customerPhone, message);
      } catch (error) {
        console.error('WhatsApp onay mesaji gonderilemedi:', error.message);
      }

      return appointment;
    } catch (error) {
      throw new Error('Randevu olusturma basarısız: ' + error.message);
    }
  }

  /**
   * Randevuyu güncelle
   */
  static async updateAppointment(appointmentId, updateData) {
    try {
      const oldAppointment = await DatabaseService.getAppointmentById(appointmentId);

      if (!oldAppointment) {
        throw new Error('Randevu bulunamadı');
      }

      // Eğer tarih/saat değişirse çakışma kontrolü yap
      if (updateData.appointmentDate) {
        const barberAppointments = await DatabaseService.getActiveAppointmentsByBarber(
          oldAppointment.barberId
        );

        const conflicting = barberAppointments.find((apt) => {
          if (apt.id === appointmentId) return false; // Kendi randevusu hariç

          const existingStart = new Date(apt.appointmentDate);
          const existingEnd = new Date(existingStart.getTime() + apt.duration * 60000);

          const newStart = new Date(updateData.appointmentDate);
          const newEnd = new Date(newStart.getTime() + (updateData.duration || oldAppointment.duration) * 60000);

          return (
            (newStart >= existingStart && newStart < existingEnd) ||
            (newEnd > existingStart && newEnd <= existingEnd) ||
            (newStart <= existingStart && newEnd >= existingEnd)
          );
        });

        if (conflicting) {
          throw new Error('Bu zaman diliminde berber meşguldür');
        }
      }

      const updatedAppointment = await DatabaseService.updateAppointment(
        appointmentId,
        updateData
      );

      return updatedAppointment;
    } catch (error) {
      throw new Error(`Randevu güncelleme başarısız: ${error.message}`);
    }
  }

  /**
   * Randevuyu iptal et
   */
  static async cancelAppointment(appointmentId) {
    try {
      const appointment = await DatabaseService.getAppointmentById(appointmentId);

      if (!appointment) {
        throw new Error('Randevu bulunamadi');
      }

      // Musteriye WhatsApp mesajı gonder
      try {
        const message = `Merhaba ${appointment.customerName}!\n\nRandevunuz iptal edildi\nBerber: ${appointment.barberName}\n\nYeni bir randevu icin lutfen bize ulasin.`;
        await WhatsAppService.sendMessage(appointment.customerPhone, message);
      } catch (error) {
        console.error('WhatsApp iptal mesaji gonderilemedi:', error.message);
      }

      return await DatabaseService.cancelAppointment(appointmentId);
    } catch (error) {
      throw new Error('Randevu iptal basarısız: ' + error.message);
    }
  }

  /**
   * İnsan talebinden randevu oluştur
   */
  static async createAppointmentFromCustomerRequest(customerData, requestMessage) {
    try {
      // AI'ya müşteri talebini analiz ettir
      const analysis = await AIService.analyzeCustomerRequest(requestMessage);

      // Berber adaylarını getir
      const barbers = await DatabaseService.getAllBarbers();

      if (barbers.length === 0) {
        throw new Error('Kullanılabilir berber yok');
      }

      // Tercih edilen berberi bul (varsa)
      let selectedBarber = barbers[0];
      if (customerData.preferences && customerData.preferences.favoriteBarbers.length > 0) {
        const favorite = barbers.find(
          (b) => b.id === customerData.preferences.favoriteBarbers[0]
        );
        if (favorite) {
          selectedBarber = favorite;
        }
      }

      // Randevu oluştur
      const appointmentData = {
        customerId: customerData.id,
        customerName: customerData.name,
        customerPhone: customerData.phone,
        barberId: selectedBarber.id,
        barberName: selectedBarber.name,
        serviceType: analysis.serviceType,
        appointmentDate: this.buildAppointmentDate(analysis.preferredDate, analysis.preferredTime),
        notes: analysis.additionalNotes,
      };

      return await this.createAppointment(appointmentData);
    } catch (error) {
      throw new Error(`Müşteri talebinden randevu oluşturma başarısız: ${error.message}`);
    }
  }

  /**
   * Berber için kullanılabilir saatleri getir
   */
  static async getAvailableSlots(barberId, date, slotDuration = 30) {
    try {
      const barber = await DatabaseService.getUserById(barberId);

      if (!barber || barber.role !== 'barber') {
        throw new Error('Berber bulunamadi');
      }

      const appointments = await DatabaseService.getAvailableSlots(barberId, date);

      // Çalışma saatlerini al
      const businessStart = process.env.BUSINESS_HOURS_START || 10;
      const businessEnd = process.env.BUSINESS_HOURS_END || 20;

      const slots = [];
      const dayStart = new Date(date);
      dayStart.setHours(businessStart, 0, 0, 0);

      const dayEnd = new Date(date);
      dayEnd.setHours(businessEnd, 0, 0, 0);

      for (let current = new Date(dayStart); current < dayEnd; current.setMinutes(current.getMinutes() + slotDuration)) {
        const slotEnd = new Date(current.getTime() + slotDuration * 60000);

        // Çakışma kontrol et
        const isConflicting = appointments.some((apt) => {
          const aptStart = new Date(apt.appointmentDate);
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);

          return (
            (current >= aptStart && current < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (current <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!isConflicting) {
          slots.push({
            start: new Date(current),
            end: new Date(slotEnd),
          });
        }
      }

      return slots;
    } catch (error) {
      throw new Error(`Kullanılabilir saatler getirme başarısız: ${error.message}`);
    }
  }
}

module.exports = AppointmentLogic;
