const AIService = require('./aiService');
const WhatsAppService = require('./whatsappService');
const DatabaseService = require('./databaseService');
const AppointmentLogic = require('../logic/appointmentLogic');
const ConversationRules = require('../logic/conversationRules');

const sessions = {};

function detectCancelIntent(text) {
  const t = (text || '').toLowerCase();
  return /iptal|vazgeç|vazgec|randevumu sil|randevuyu sil|gelmeyeceğim|gelmeyecegim/.test(t);
}

function detectCancelAllIntent(text) {
  const t = (text || '').toLowerCase();
  return /hepsini|tümünü|tumunu|hepini|hepsi|4 randevu|5 randevu|tüm randevu|tum randevu/.test(t);
}

function getAppointmentId(appointment) {
  if (!appointment) return null;
  if (appointment.id) return String(appointment.id);
  if (appointment._id) return String(appointment._id);
  return null;
}

function detectConfirmIntent(text) {
  const t = (text || '').toLowerCase().trim();
  // "Hepsini iptal et" isteği onay değildir
  if (detectCancelAllIntent(text) && /iptal|vazgeç|vazgec|sil/.test(t)) return false;
  if (detectCancelIntent(text) && !/^(evet|onay|tamam|tamamdır|tamamdir|ok|olur)\b/.test(t)) {
    return false;
  }
  return (
    /^(evet|onay|onaylıyorum|onayliyorum|tamam|tamamdır|tamamdir|ok|olur|kesin|onayla)\b/.test(t) ||
    /\b(evet|onaylıyorum|onayliyorum|tamamdır|tamamdir)\b/.test(t)
  );
}

function parseAppointmentIndex(text) {
  const m = (text || '').match(/\b([1-9])\b/);
  return m ? parseInt(m[1], 10) - 1 : null;
}

function matchIdInUpcoming(id, upcoming) {
  if (!id) return null;
  const strId = String(id);
  for (const a of upcoming) {
    const apptId = getAppointmentId(a);
    if (apptId === strId) return apptId;
    if (apptId && (apptId.includes(strId) || strId.includes(apptId))) return apptId;
  }
  return null;
}

function resolveCancelIds(response, session, text, upcoming) {
  if (!upcoming.length) return [];

  const confirmed =
    detectConfirmIntent(text) ||
    response.cancelAll ||
    (response.cancelAppointmentId && response.nextStep === 'cancel') ||
    /iptal ediyorum|iptal ettim|iptal edildi/.test((response.message || '').toLowerCase());

  const wantsAll =
    response.cancelAll ||
    (session.pendingCancelAll && confirmed) ||
    (detectCancelAllIntent(text) && confirmed);

  if (wantsAll) {
    return upcoming.map((a) => getAppointmentId(a)).filter(Boolean);
  }

  if (response.cancelAppointmentIds?.length) {
    const valid = response.cancelAppointmentIds
      .map((id) => matchIdInUpcoming(id, upcoming))
      .filter(Boolean);
    if (valid.length) return valid;
  }

  let singleId = response.cancelAppointmentId
    ? matchIdInUpcoming(response.cancelAppointmentId, upcoming)
    : null;

  if (!singleId && session.pendingCancelId && confirmed) {
    singleId = matchIdInUpcoming(session.pendingCancelId, upcoming);
  }

  if (singleId) return [singleId];

  const idx = parseAppointmentIndex(text);
  if (idx !== null && upcoming[idx] && (detectCancelIntent(text) || session.step === 'cancel')) {
    return [getAppointmentId(upcoming[idx])].filter(Boolean);
  }

  const timeMatch = (text || '').match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch && detectCancelIntent(text)) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const found = upcoming.filter((a) => {
      const d = new Date(a.appointmentDate);
      return d.getHours() === h && d.getMinutes() === m;
    });
    if (found.length === 1) return [getAppointmentId(found[0])].filter(Boolean);
  }

  const recentCancelAll = session.history
    .slice(-8)
    .some((h) => h.role === 'user' && detectCancelAllIntent(h.content));
  if (recentCancelAll && confirmed) {
    return upcoming.map((a) => getAppointmentId(a)).filter(Boolean);
  }

  return [];
}

function resetSession(session) {
  session.step = 'greeting';
  session.data = {};
  session.history = [];
  session.pendingCancelId = null;
  session.pendingCancelAll = false;
}

async function buildConflictMessage(barberId, appt) {
  return ConversationRules.buildSlotConflictMessage(
    barberId,
    appt.appointmentDate,
    appt.duration || 30
  );
}

function buildCancelSuccessMessage(cancelledCount, upcoming) {
  if (cancelledCount > 1) {
    return `Tamam, ${cancelledCount} randevunuz iptal edildi. Başka bir konuda yardımcı olabilir miyim?`;
  }
  if (upcoming.length === 1) {
    const d = new Date(upcoming[0].appointmentDate);
    const dateStr = d.toLocaleDateString('tr-TR');
    const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `Tamam, ${dateStr} saat ${timeStr} randevunuz iptal edildi. Başka bir konuda yardımcı olabilir miyim?`;
  }
  return 'Randevunuz iptal edildi. Başka bir konuda yardımcı olabilir miyim?';
}

function buildBookingSuccessMessage(appt) {
  const d = new Date(appt.appointmentDate);
  const dateStr = d.toLocaleDateString('tr-TR');
  const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const name = appt.customerName || 'Değerli Müşterimiz';
  return `Randevunuz oluşturuldu ${name}! ${dateStr} saat ${timeStr} — ${appt.serviceType || 'hizmet'}. Görüşmek üzere!`;
}

function parseLocalAppointmentDate(dateValue, timeValue) {
  if (dateValue && timeValue) {
    return new Date(`${dateValue}T${timeValue}:00`);
  }
  if (!dateValue) return null;
  const raw = String(dateValue);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    return new Date(`${match[1]}T${match[2]}:${match[3]}:00`);
  }
  return new Date(raw);
}

function buildAppointmentPayload(response, barberId, from) {
  const appt = { ...response.appointment };
  if (!appt.barberId) appt.barberId = barberId;
  if (!appt.customerPhone) appt.customerPhone = from;

  const localDate = parseLocalAppointmentDate(
    response.data?.date,
    response.data?.time
  );
  if (localDate && !Number.isNaN(localDate.getTime())) {
    appt.appointmentDate = localDate.toISOString();
  } else if (appt.appointmentDate) {
    const parsed = parseLocalAppointmentDate(appt.appointmentDate);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      appt.appointmentDate = parsed.toISOString();
    }
  }
  return appt;
}

class ConversationService {
  static async handleMessage(from, text, barberId) {
    try {
      if (!sessions[from]) {
        sessions[from] = {
          step: 'greeting',
          data: {},
          history: [],
          pendingCancelId: null,
          pendingCancelAll: false,
        };
      }

      const session = sessions[from];
      session.history.push({ role: 'user', content: text });

      if (!barberId) {
        const barbers = await DatabaseService.getAllBarbers();
        if (barbers && barbers.length > 0) {
          barberId = barbers[0].id;
        } else {
          barberId = 'test-barber-id';
        }
      }

      const contact = await DatabaseService.getContactByPhone(barberId, from);
      const isSavedContact = !!contact;
      let customer = contact;
      if (!customer) {
        customer = await DatabaseService.getUserByPhone(from);
      }

      const upcoming = await DatabaseService.getUpcomingAppointmentsByPhone(barberId, from);

      const response = await AIService.generateConversationResponse(
        text,
        session,
        customer,
        isSavedContact,
        from
      );

      const inCancelFlow =
        session.step === 'cancel' ||
        session.pendingCancelId ||
        session.pendingCancelAll ||
        detectCancelIntent(text) ||
        response.cancelAll ||
        !!response.cancelAppointmentId;

      // Çoklu iptal — önce onay iste
      if (
        detectCancelAllIntent(text) &&
        !detectConfirmIntent(text) &&
        upcoming.length > 1 &&
        !session.pendingCancelAll
      ) {
        session.pendingCancelAll = true;
        session.step = 'cancel';
        const confirmMsg = response.message.toLowerCase().includes('onay')
          ? response.message
          : `${response.message}\n\nToplam ${upcoming.length} aktif randevunuz var. Hepsini iptal etmemi onaylıyor musunuz? (Evet veya Tamam yazın)`;
        await WhatsAppService.sendMessage(from, confirmMsg);
        session.history.push({ role: 'assistant', content: confirmMsg });
        return;
      }

      // Tek randevu — onay iste
      if (
        detectCancelIntent(text) &&
        !detectCancelAllIntent(text) &&
        !detectConfirmIntent(text) &&
        upcoming.length === 1 &&
        !session.pendingCancelId
      ) {
        session.pendingCancelId = getAppointmentId(upcoming[0]);
        session.step = 'cancel';
        const d = new Date(upcoming[0].appointmentDate);
        const confirmMsg = response.message.toLowerCase().includes('onay')
          ? response.message
          : `${response.message}\n\n${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} randevunuzu iptal etmemi onaylıyor musunuz? (Evet yazmanız yeterli)`;
        await WhatsAppService.sendMessage(from, confirmMsg);
        session.history.push({ role: 'assistant', content: confirmMsg });
        return;
      }

      const cancelIds = resolveCancelIds(response, session, text, upcoming);
      const allowedIds = new Set(upcoming.map((a) => getAppointmentId(a)).filter(Boolean));
      const safeCancelIds = cancelIds.filter((id) => allowedIds.has(id));

      if (safeCancelIds.length > 0) {
        let cancelled = 0;
        for (const id of safeCancelIds) {
          try {
            await AppointmentLogic.cancelAppointment(id, { notify: false });
            cancelled++;
          } catch (err) {
            console.error('İptal hatası:', id, err.message);
          }
        }
        if (cancelled > 0) {
          const targets = upcoming.filter((a) =>
            safeCancelIds.includes(getAppointmentId(a))
          );
          const msg = buildCancelSuccessMessage(cancelled, targets);
          await WhatsAppService.sendMessage(from, msg);
          resetSession(session);
          return;
        }
      }

      if (upcoming.length === 0 && detectCancelIntent(text)) {
        session.pendingCancelId = null;
        session.pendingCancelAll = false;
      }

      const isFinalBooking =
        response.nextStep === 'done' ||
        (response.nextStep === 'confirm' && detectConfirmIntent(text));

      const shouldCreate =
        response.appointment &&
        isFinalBooking &&
        !inCancelFlow &&
        !response.cancelAll &&
        !response.cancelAppointmentId &&
        !session.pendingCancelAll &&
        safeCancelIds.length === 0;

      if (shouldCreate) {
        const appt = buildAppointmentPayload(response, barberId, from);
        try {
          const slotOk = await ConversationRules.isSlotAvailable(
            barberId,
            appt.appointmentDate,
            appt.duration || 30
          );
          if (!slotOk) {
            const failMsg = await buildConflictMessage(barberId, appt);
            await WhatsAppService.sendMessage(from, failMsg);
            session.history.push({ role: 'assistant', content: failMsg });
            session.step = 'time';
            session.data = { ...session.data, ...response.data };
            return;
          }
          await AppointmentLogic.createAppointment(appt, { notify: false });
          const successMsg = buildBookingSuccessMessage(appt);
          await WhatsAppService.sendMessage(from, successMsg);
          resetSession(session);
          return;
        } catch (err) {
          const isConflict = /mesgul|meşgul|çakış|dolu/i.test(err.message);
          const failMsg = isConflict
            ? await buildConflictMessage(barberId, appt)
            : 'Üzgünüm, randevu kaydedilemedi. Lütfen tarih ve saati tekrar kontrol edelim.';
          console.error('Randevu oluşturma hatası:', err.message);
          await WhatsAppService.sendMessage(from, failMsg);
          session.history.push({ role: 'assistant', content: failMsg });
          session.step = 'time';
          session.data = { ...session.data, ...response.data };
          return;
        }
      }

      await WhatsAppService.sendMessage(from, response.message);

      const learnedName =
        response.newCustomer?.name ||
        response.data?.name ||
        (response.appointment && response.appointment.customerName);
      if (learnedName && learnedName !== 'Değerli Müşteri') {
        let extUser = await DatabaseService.getUserByPhone(from);
        if (!extUser) {
          extUser = await DatabaseService.createUser({
            name: learnedName,
            phone: from,
            role: 'customer',
          });
        }

        const existingContact = await DatabaseService.getContactByPhone(barberId, from);
        if (!existingContact) {
          await DatabaseService.upsertContact(barberId, {
            phone: from,
            name: learnedName,
            category: 'customer',
            autoReplyEnabled: true,
            notes: 'WhatsApp Randevu Asistanı ile otomatik kaydedildi.',
          });
        } else if (existingContact.name !== learnedName) {
          await DatabaseService.upsertContact(barberId, {
            phone: from,
            name: learnedName,
            category: existingContact.category || 'customer',
            autoReplyEnabled: existingContact.autoReplyEnabled !== false,
            notes: existingContact.notes || 'WhatsApp Randevu Asistanı ile güncellendi.',
          });
        }
      }

      if (safeCancelIds.length === 0 && !shouldCreate) {
        session.history.push({ role: 'assistant', content: response.message });
        session.step = response.nextStep || session.step;
        session.data = { ...session.data, ...response.data };
      }
    } catch (error) {
      console.error('❌ Konuşma hatası:', error.message);
      await WhatsAppService.sendMessage(from, 'Üzgünüm, bir sorun oluştu. Lütfen tekrar deneyin.');
    }
  }
}

module.exports = ConversationService;
