const AppointmentLogic = require('./appointmentLogic');

function parseTimeFromText(text) {
  const m = (text || '').match(/(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

function formatSlotTime(date) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

async function isSlotAvailable(barberId, appointmentDate, duration = 30) {
  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) return false;

  const slots = await AppointmentLogic.getAvailableSlots(barberId, date, duration || 30);
  const h = date.getHours();
  const m = date.getMinutes();
  return slots.some((s) => s.start.getHours() === h && s.start.getMinutes() === m);
}

async function suggestAlternativeSlots(barberId, appointmentDate, duration = 30, count = 3) {
  const date = new Date(appointmentDate);
  const slots = await AppointmentLogic.getAvailableSlots(barberId, date, duration || 30);
  return slots.slice(0, count).map((s) => formatSlotTime(s.start));
}

async function buildSlotConflictMessage(barberId, appointmentDate, duration = 30) {
  const date = new Date(appointmentDate);
  const timeStr = formatSlotTime(date);
  const dateStr = date.toLocaleDateString('tr-TR');
  const alts = await suggestAlternativeSlots(barberId, date, duration, 3);

  if (alts.length) {
    return `Üzgünüm, ${dateStr} saat ${timeStr} dolu görünüyor. Şu saatler uygun: ${alts.join(', ')}. Hangisini tercih edersiniz?`;
  }
  return `Üzgünüm, ${dateStr} saat ${timeStr} dolu ve o gün başka boş saat kalmamış. Farklı bir gün söylerseniz kontrol edeyim.`;
}

function detectBookingIntent(text) {
  const t = (text || '').toLowerCase();
  return /randevu|uygun|musait|müsait|alabilir miyim|istiyorum|onaylıyorum|onayliyorum|evet|tamam/.test(t);
}

module.exports = {
  parseTimeFromText,
  isSlotAvailable,
  suggestAlternativeSlots,
  buildSlotConflictMessage,
  detectBookingIntent,
};
