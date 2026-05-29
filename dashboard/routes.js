const express = require('express');
const router = express.Router();
const AppointmentLogic = require('../logic/appointmentLogic');
const DatabaseService = require('../services/databaseService');

// ===== APPOINTMENT ENDPOINTS =====

/**
 * POST /api/appointments
 * Yeni randevu oluştur
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      customerId,
      customerName,
      customerPhone,
      barberId,
      barberName,
      serviceType,
      appointmentDate,
      duration,
      notes,
      price,
    } = req.body;

    // Validasyon
    if (!customerId || !customerName || !customerPhone || !barberId || !barberName || !appointmentDate) {
      return res.status(400).json({
        error: 'Gerekli alanlar eksik (customerId, customerName, customerPhone, barberId, barberName, appointmentDate)',
      });
    }

    const appointment = await AppointmentLogic.createAppointment({
      customerId,
      customerName,
      customerPhone,
      barberId,
      barberName,
      serviceType: serviceType || 'haircut',
      appointmentDate: new Date(appointmentDate),
      duration: duration || 30,
      notes,
      price,
    });

    res.status(201).json({
      success: true,
      message: 'Randevu başarıyla oluşturuldu',
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/:id
 * Randevu detaylarını getir
 */
router.get('/:id', async (req, res, next) => {
  try {
    const appointment = await DatabaseService.getAppointmentById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Randevu bulunamadı' });
    }

    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/customer/:customerId
 * Müşterinin randevularını listele
 */
router.get('/customer/:customerId', async (req, res, next) => {
  try {
    const appointments = await DatabaseService.getAppointmentsByCustomer(req.params.customerId);
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/barber/:barberId
 * Berber'in randevularını listele
 */
router.get('/barber/:barberId', async (req, res, next) => {
  try {
    const appointments = await DatabaseService.getAppointmentsByBarber(req.params.barberId);
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/appointments/:id
 * Randevuyu güncelle
 */
router.put('/:id', async (req, res, next) => {
  try {
    const {
      serviceType,
      appointmentDate,
      duration,
      status,
      notes,
      price,
    } = req.body;

    const appointment = await AppointmentLogic.updateAppointment(req.params.id, {
      serviceType,
      appointmentDate,
      duration,
      status,
      notes,
      price,
    });

    res.json({
      success: true,
      message: 'Randevu başarıyla güncellendi',
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/appointments/:id
 * Randevuyu iptal et
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await AppointmentLogic.cancelAppointment(req.params.id);

    res.json({
      success: true,
      message: 'Randevu başarıyla iptal edildi',
    });
  } catch (error) {
    next(error);
  }
});

// ===== AVAILABILITY ENDPOINTS =====

/**
 * GET /api/appointments/barber/:barberId/available-slots
 * Berber'in kullanılabilir saatlerini getir
 */
router.get('/barber/:barberId/available-slots', async (req, res, next) => {
  try {
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Tarih parametresi gerekli' });
    }

    const slots = await AppointmentLogic.getAvailableSlots(
      req.params.barberId,
      new Date(date),
      duration || 30
    );

    res.json({
      date,
      slots,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/barber/:barberId/upcoming
 * Berber'in yaklaşan randevularını getir
 */
router.get('/barber/:barberId/upcoming', async (req, res, next) => {
  try {
    const { days } = req.query;
    const appointments = await DatabaseService.getUpcomingAppointments(
      req.params.barberId,
      days || 7
    );

    res.json(appointments);
  } catch (error) {
    next(error);
  }
});


// Servis listesi endpoint - dashboard için
const Service = require('../models/Service');
router.get('/services/list', async (req, res, next) => {
  try {
    // Return all services including inactive ones for the settings dashboard so they can toggled/managed
    const services = await Service.find({}).sort({ businessType: 1, category: 1 });
    res.json(services);
  } catch (err) { next(err); }
});

router.post('/services/create', async (req, res, next) => {
  try {
    const { category, name, defaultDuration, priceMin, priceMax } = req.body;
    if (!category || !name) {
      return res.status(400).json({ error: 'Kategori ve Hizmet Adı zorunludur.' });
    }

    // Generate unique code and id
    const slugify = (str) => {
      const trMap = { 'ç':'c', 'ğ':'g', 'ı':'i', 'ö':'o', 'ş':'s', 'ü':'u', 'Ç':'C', 'Ğ':'G', 'İ':'I', 'Ö':'O', 'Ş':'S', 'Ü':'U' };
      for (let key in trMap) {
        str = str.replace(new RegExp(key, 'g'), trMap[key]);
      }
      return str.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').trim();
    };

    const serviceCode = 'berber_' + slugify(name);
    
    // Check if code already exists
    const existing = await Service.findOne({ code: serviceCode });
    if (existing) {
      return res.status(400).json({ error: 'Bu isimde bir hizmet zaten mevcut.' });
    }

    const { v4: uuidv4 } = require('uuid');
    const serviceId = uuidv4();

    const newService = await Service.create({
      id: serviceId,
      code: serviceCode,
      businessType: 'berber',
      category: category,
      name: name,
      defaultDuration: Number(defaultDuration) || 30,
      priceMin: Number(priceMin) || 0,
      priceMax: Number(priceMax) || Number(priceMin) || 0,
      isActive: true
    });

    res.status(201).json({ success: true, message: 'Hizmet başarıyla eklendi.', service: newService });
  } catch (error) {
    next(error);
  }
});

router.put('/services/update/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, name, defaultDuration, priceMin, priceMax, isActive } = req.body;
    
    const service = await Service.findOne({ id });
    if (!service) {
      return res.status(404).json({ error: 'Güncellenecek hizmet bulunamadı.' });
    }

    const updatedData = {};
    if (category) updatedData.category = category;
    if (name) updatedData.name = name;
    if (defaultDuration !== undefined) updatedData.defaultDuration = Number(defaultDuration);
    if (priceMin !== undefined) updatedData.priceMin = Number(priceMin);
    if (priceMax !== undefined) updatedData.priceMax = Number(priceMax) || Number(priceMin);
    if (isActive !== undefined) updatedData.isActive = Boolean(isActive);

    const updated = await Service.findOneAndUpdate({ id }, { $set: updatedData }, { new: true });
    
    res.json({ success: true, message: 'Hizmet başarıyla güncellendi.', service: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/services/delete/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const service = await Service.findOne({ id });
    if (!service) {
      return res.status(404).json({ error: 'Silinecek hizmet bulunamadı.' });
    }

    await Service.deleteOne({ id });

    res.json({ success: true, message: 'Hizmet başarıyla silindi.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
