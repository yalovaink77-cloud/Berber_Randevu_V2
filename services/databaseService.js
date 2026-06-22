const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Contact = require('../models/Contact');
const MissedCall = require('../models/MissedCall');
const Service = require('../models/Service');
const Business = require('../models/Business');
const { withBusinessId, requireBusinessId } = require('../utils/tenant');

const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';

// MongoDB bağlantısı
if (!mongoose.connection.readyState) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/berber_randevu', {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
  })
    .then(() => {
      console.log('✅ MongoDB bağlantısı başarılı');
      if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_SEED === 'true') {
        ensureSeedData();
      }
    })
    .catch((err) => {
      console.error('❌ MongoDB bağlantı hatası:', err.message);
      mongoose.disconnect().catch(() => {});
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Production ortamında MongoDB zorunludur. Sunucu mock moda geçmeyecek.');
        process.exit(1);
      }
      console.warn('ℹ️ Uygulama in-memory mock veritabanı modunda çalışmaya devam ediyor.');
    });
}

/**
 * Aktif veritabanında (MongoDB veya mock) demo berber kullanıcısının,
 * varsayılan hizmetlerin ve örnek randevuların bulunduğundan emin olur.
 * Böylece taze bir MongoDB kurulumunda bile demo girişi (+905551112233 / 123456)
 * çalışır ve panel boş görünmez.
 */
async function ensureSeedData() {
  try {
    const bcrypt = require('bcryptjs');
    let SERVICES = [];
    try { SERVICES = require('../data/services'); } catch (e) { /* opsiyonel */ }

    const demoPhone = process.env.DEMO_BARBER_PHONE || '+905551112233';
    const demoBarberId = 'test-barber-id';

    // 1) Demo Business
    let business = await Business.findOne({ id: DEMO_BUSINESS_ID });
    if (!business) {
      business = await Business.create({
        id: DEMO_BUSINESS_ID,
        name: 'Gökhan Erkek Kuaförü',
        slug: process.env.DEMO_BUSINESS_SLUG || 'demo-gokhan-berber',
        businessType: 'berber',
        status: 'active',
      });
      console.log(`✅ Demo işletme eklendi (${DEMO_BUSINESS_ID})`);
    }

    // 1b) Demo aktif abonelik (Sprint 2)
    const subscriptionService = require('./subscriptionService');
    await subscriptionService.ensureLaunchPlan();
    const demoSub = await subscriptionService.ensureDemoActiveSubscription(DEMO_BUSINESS_ID);
    if (demoSub?.status === 'active') {
      console.log(`✅ Demo abonelik aktif (${DEMO_BUSINESS_ID} / ${demoSub.planCode})`);
    }

    // 2) Varsayılan hizmetler (tenant scoped)
    if (SERVICES.length) {
      const serviceCount = await Service.countDocuments(withBusinessId(DEMO_BUSINESS_ID));
      if (!serviceCount) {
        const rows = SERVICES.map((s) => ({
          ...s,
          id: uuidv4(),
          businessId: DEMO_BUSINESS_ID,
        }));
        await Service.insertMany(rows);
        console.log(`✅ ${rows.length} varsayılan hizmet eklendi (${DEMO_BUSINESS_ID})`);
      }
    }

    // 3) Demo berber kullanıcısı
    let barber = await User.findOne({ phone: demoPhone });
    if (!barber) {
      const demoPassword = process.env.DEMO_BARBER_PASSWORD;
      if (!demoPassword || demoPassword.length < 8) {
        throw new Error('DEMO_BARBER_PASSWORD tanımlı değil veya 8 karakterden kısa. .env dosyanızı kontrol edin.');
      }
      barber = await User.create({
        id: demoBarberId,
        businessId: DEMO_BUSINESS_ID,
        name: 'Gökhan Berber',
        phone: demoPhone,
        email: 'gokhan@berber.com',
        role: 'barber',
        passwordHash: bcrypt.hashSync(demoPassword, 12),
        businessName: 'Gökhan Erkek Kuaförü',
        businessAddress: 'Atatürk Cad. No:77, Merkez, Yalova',
        assistantStatus: 'working',
        specialties: ['haircut', 'shaver', 'beard_trim'],
        workDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
        workHours: { start: 9, end: 20 },
      });
      console.log(`✅ Demo berber kullanıcısı eklendi (giriş: ${demoPhone} / DEMO_BARBER_PASSWORD)`);
    } else if (!barber.businessId) {
      await User.updateOne(
        { id: barber.id },
        { $set: { businessId: DEMO_BUSINESS_ID, updatedAt: new Date() } }
      );
      barber.businessId = DEMO_BUSINESS_ID;
    }

    // 4) Demo berber için bugüne ait örnek randevular (yalnızca hiç yoksa)
    const barberId = (barber && (barber.id || barber._id)) || demoBarberId;
    const existingAppt = await Appointment.findOne(withBusinessId(DEMO_BUSINESS_ID, { barberId }));
    if (!existingAppt) {
      const today = new Date().toISOString().split('T')[0];
      const demoAppointments = [
        { customerName: 'Ahmet Yılmaz', customerPhone: '+905051234567', serviceType: 'haircut', time: 'T09:30:00', duration: 30, status: 'confirmed', price: 250, notes: 'Kısa model kesim istiyor.' },
        { customerName: 'Mehmet Demir', customerPhone: '+905069876543', serviceType: 'beard_trim', time: 'T14:30:00', duration: 20, status: 'pending', price: 150, notes: 'Sakal düzeltme ve fön.' },
        { customerName: 'Caner Kaya', customerPhone: '+905072345678', serviceType: 'hair_coloring', time: 'T17:00:00', duration: 60, status: 'confirmed', price: 600, notes: 'Renklendirme.' },
      ];
      for (const a of demoAppointments) {
        await Appointment.create({
          id: uuidv4(),
          businessId: DEMO_BUSINESS_ID,
          customerId: 'demo-' + a.customerPhone,
          customerName: a.customerName,
          customerPhone: a.customerPhone,
          barberId,
          barberName: 'Gökhan Berber',
          serviceType: a.serviceType,
          appointmentDate: new Date(today + a.time),
          duration: a.duration,
          status: a.status,
          price: a.price,
          notes: a.notes,
        });
      }
      console.log('✅ Demo randevular eklendi');
    }
  } catch (e) {
    console.warn('⚠️ Seed verisi eklenirken hata:', e.message);
  }
}

class DatabaseService {

  static async createUser(userData) {
    return await User.create({
      id: uuidv4(),
      name: userData.name,
      phone: userData.phone,
      email: userData.email,
      role: userData.role || 'customer',
      businessName: userData.businessName,
      businessAddress: userData.businessAddress,
      assistantStatus: userData.assistantStatus || 'working',
      assistantSettings: userData.assistantSettings,
      onboarding: userData.onboarding,
      specialties: userData.specialties || [],
      workDays: userData.workDays,
      workHours: userData.workHours,
      preferences: userData.preferences,
    });
  }

  static async getUserById(userId) {
    return await User.findOne({ id: userId });
  }

  static async getUserByPhone(phone) {
    return await User.findOne({ phone });
  }

  static async getAllBarbers() {
    return await User.find({ role: 'barber' });
  }

  static async upsertContact(ownerId, contactData) {
    return await Contact.findOneAndUpdate(
      { ownerId, phone: contactData.phone },
      {
        $set: {
          name: contactData.name,
          category: contactData.category || 'unknown',
          autoReplyEnabled: contactData.autoReplyEnabled !== false,
          notes: contactData.notes,
          lastInteractionAt: new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          id: uuidv4(),
          ownerId,
          phone: contactData.phone,
          createdAt: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
  }

  static async getContactByPhone(ownerId, phone) {
    return await Contact.findOne({ ownerId, phone });
  }

  static async getContacts(ownerId, category) {
    const query = { ownerId };
    if (category) query.category = category;
    return await Contact.find(query).sort({ updatedAt: -1 });
  }

  static async deleteContact(ownerId, phone) {
    return await Contact.findOneAndDelete({ ownerId, phone });
  }

  static async createMissedCall(callData) {
    return await MissedCall.create({
      id: uuidv4(),
      barberId: callData.barberId,
      fromPhone: callData.fromPhone,
      fromName: callData.fromName,
      contactCategory: callData.contactCategory || 'unknown',
      barberStatus: callData.barberStatus || 'working',
      autoReplyMessage: callData.autoReplyMessage,
      autoReplyAction: callData.autoReplyAction || 'manual_review',
      autoReplySent: callData.autoReplySent || false,
      replyChannel: callData.replyChannel || 'whatsapp',
      callAt: callData.callAt || new Date(),
    });
  }

  static async getMissedCalls(barberId, limit = 25) {
    return await MissedCall.find({ barberId })
      .sort({ callAt: -1 })
      .limit(Number(limit));
  }

  static async hasAppointmentHistoryWithPhone(businessId, barberId, phone) {
    const count = await Appointment.countDocuments(
      withBusinessId(businessId, { barberId, customerPhone: phone })
    );
    return count > 0;
  }

  static async updateUser(userId, updateData) {
    return await User.findOneAndUpdate(
      { id: userId },
      { ...updateData, updatedAt: new Date() },
      { returnDocument: 'after' }
    );
  }

  static async updateBarberProfile(userId, profileData) {
    return await User.findOneAndUpdate(
      { id: userId, role: 'barber' },
      {
        ...profileData,
        updatedAt: new Date(),
      },
      { returnDocument: 'after' }
    ).select('-passwordHash -__v');
  }

  static async updateAssistantStatus(userId, assistantStatus) {
    return await User.findOneAndUpdate(
      { id: userId, role: 'barber' },
      {
        assistantStatus,
        updatedAt: new Date(),
      },
      { returnDocument: 'after' }
    ).select('-passwordHash -__v');
  }

  static async createAppointment(businessId, appointmentData) {
    const tenantId = requireBusinessId(businessId);
    return await Appointment.create({
      id: uuidv4(),
      businessId: tenantId,
      customerId: appointmentData.customerId,
      customerName: appointmentData.customerName,
      customerPhone: appointmentData.customerPhone,
      barberId: appointmentData.barberId,
      barberName: appointmentData.barberName,
      serviceType: appointmentData.serviceType || 'haircut',
      appointmentDate: appointmentData.appointmentDate,
      duration: appointmentData.duration || 30,
      notes: appointmentData.notes,
      price: appointmentData.price,
      status: appointmentData.status || 'pending',
    });
  }

  static async getAppointmentById(businessId, appointmentId) {
    return await Appointment.findOne(withBusinessId(businessId, { id: appointmentId }));
  }

  static async getAppointmentsByCustomer(businessId, customerId) {
    return await Appointment.find(withBusinessId(businessId, { customerId })).sort({
      appointmentDate: -1,
    });
  }

  static async getAppointmentsByBarber(businessId, barberId) {
    return await Appointment.find(withBusinessId(businessId, { barberId })).sort({
      appointmentDate: 1,
    });
  }

  static async getActiveAppointmentsByBarber(businessId, barberId) {
    return await Appointment.find(
      withBusinessId(businessId, {
        barberId,
        status: { $ne: 'cancelled' },
      })
    ).sort({ appointmentDate: 1 });
  }

  static async getAvailableSlots(businessId, barberId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return await Appointment.find(
      withBusinessId(businessId, {
        barberId,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $ne: 'cancelled' },
      })
    );
  }

  static async updateAppointment(businessId, appointmentId, updateData) {
    return await Appointment.findOneAndUpdate(
      withBusinessId(businessId, { id: appointmentId }),
      { ...updateData, updatedAt: new Date() },
      { returnDocument: 'after' }
    );
  }

  static async cancelAppointment(businessId, appointmentId) {
    return await Appointment.findOneAndUpdate(
      withBusinessId(businessId, { id: appointmentId }),
      { status: 'cancelled', updatedAt: new Date() },
      { returnDocument: 'after' }
    );
  }

  static async getUpcomingAppointmentsByPhone(businessId, barberId, phone) {
    const now = new Date();
    return await Appointment.find(
      withBusinessId(businessId, {
        barberId,
        customerPhone: phone,
        status: { $ne: 'cancelled' },
        appointmentDate: { $gte: now },
      })
    ).sort({ appointmentDate: 1 });
  }

  static async getAppointmentsByDate(businessId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return await Appointment.find(
      withBusinessId(businessId, {
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      })
    ).sort({ appointmentDate: 1 });
  }

  static async getUpcomingAppointments(businessId, barberId, days = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Number(days));
    return await Appointment.find(
      withBusinessId(businessId, {
        barberId,
        appointmentDate: { $gte: now, $lte: futureDate },
        status: { $ne: 'cancelled' },
      })
    ).sort({ appointmentDate: 1 });
  }

  // ─── Service (tenant scoped) ─────────────────────────────────────────────

  static async getServicesByBusiness(businessId) {
    return await Service.find(withBusinessId(businessId)).sort({
      businessType: 1,
      category: 1,
    });
  }

  static async getServiceById(businessId, serviceId) {
    return await Service.findOne(withBusinessId(businessId, { id: serviceId }));
  }

  static async findServiceByCode(businessId, code) {
    return await Service.findOne(withBusinessId(businessId, { code }));
  }

  static async createService(businessId, serviceData) {
    const tenantId = requireBusinessId(businessId);
    return await Service.create({
      id: uuidv4(),
      businessId: tenantId,
      businessType: serviceData.businessType || 'berber',
      category: serviceData.category,
      name: serviceData.name,
      code: serviceData.code,
      defaultDuration: serviceData.defaultDuration ?? 30,
      priceMin: serviceData.priceMin ?? 0,
      priceMax: serviceData.priceMax ?? serviceData.priceMin ?? 0,
      isActive: serviceData.isActive !== false,
    });
  }

  static async updateService(businessId, serviceId, updateData) {
    return await Service.findOneAndUpdate(
      withBusinessId(businessId, { id: serviceId }),
      { $set: { ...updateData, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  }

  static async deleteService(businessId, serviceId) {
    return await Service.deleteOne(withBusinessId(businessId, { id: serviceId }));
  }
}

module.exports = DatabaseService;
