const express = require('express');
const router = express.Router();
const AppointmentLogic = require('../logic/appointmentLogic');
const DatabaseService = require('../services/databaseService');
const { requireTenant, requireActiveSubscriptionOnWrite } = require('../middleware/auth');
const { belongsToBusiness } = require('../utils/tenant');

router.use(requireTenant);
router.use(requireActiveSubscriptionOnWrite);

async function requireAppointmentAccess(req, res, next) {
  try {
    const appointment = await DatabaseService.getAppointmentById(
      req.businessId,
      req.params.id
    );
    if (!appointment) return res.status(404).json({ error: 'Randevu bulunamadı' });

    const userId = req.user?.id;
    if (
      appointment.customerId === userId ||
      appointment.barberId === userId
    ) {
      if (req.user.role === 'barber' && !belongsToBusiness(appointment, req.businessId)) {
        return res.status(403).json({ error: 'Bu randevuya erişim yetkiniz yok' });
      }
      req.appointment = appointment;
      return next();
    }

    return res.status(403).json({ error: 'Bu randevuya erişim yetkiniz yok' });
  } catch (err) {
    next(err);
  }
}

function requireSelfOrBarber(paramKey = 'customerId') {
  return (req, res, next) => {
    if (req.user?.role === 'barber') return next();
    if (req.user?.id === req.params[paramKey]) return next();
    return res.status(403).json({ error: 'Yalnızca kendi verilerinize erişebilirsiniz' });
  };
}

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

    if (!customerId || !customerName || !customerPhone || !barberId || !barberName || !appointmentDate) {
      return res.status(400).json({
        error: 'Gerekli alanlar eksik (customerId, customerName, customerPhone, barberId, barberName, appointmentDate)',
      });
    }

    if (req.user.role === 'customer' && req.user.id !== customerId) {
      return res.status(403).json({ error: 'Yalnızca kendi adınıza randevu oluşturabilirsiniz' });
    }
    if (req.user.role === 'barber' && req.user.id !== barberId) {
      return res.status(403).json({ error: 'Yalnızca kendi takviminize randevu ekleyebilirsiniz' });
    }

    const appointment = await AppointmentLogic.createAppointment({
      businessId: req.businessId,
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

router.get('/:id', requireAppointmentAccess, async (req, res) => {
  res.json(req.appointment);
});

router.get('/customer/:customerId', requireSelfOrBarber('customerId'), async (req, res, next) => {
  try {
    if (req.user.role !== 'barber') {
      return res.status(403).json({ error: 'Bu işlem için berber yetkisi gerekli' });
    }
    const appointments = await DatabaseService.getAppointmentsByCustomer(
      req.businessId,
      req.params.customerId
    );
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

router.get('/barber/:barberId', async (req, res, next) => {
  if (req.user.role !== 'barber' || req.user.id !== req.params.barberId) {
    return res.status(403).json({ error: 'Yalnızca kendi randevularınıza erişebilirsiniz' });
  }
  try {
    const appointments = await DatabaseService.getAppointmentsByBarber(
      req.businessId,
      req.user.id
    );
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireAppointmentAccess, async (req, res, next) => {
  try {
    const {
      serviceType,
      appointmentDate,
      duration,
      status,
      notes,
      price,
    } = req.body;

    const appointment = await AppointmentLogic.updateAppointment(req.businessId, req.params.id, {
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

router.delete('/:id', requireAppointmentAccess, async (req, res, next) => {
  try {
    await AppointmentLogic.cancelAppointment(req.businessId, req.params.id);

    res.json({
      success: true,
      message: 'Randevu başarıyla iptal edildi',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/barber/:barberId/available-slots', async (req, res, next) => {
  try {
    if (req.user.role !== 'barber' || req.user.id !== req.params.barberId) {
      return res.status(403).json({ error: 'Yalnızca kendi takviminize erişebilirsiniz' });
    }

    const { date, duration } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Tarih parametresi gerekli' });
    }

    const slots = await AppointmentLogic.getAvailableSlots(
      req.businessId,
      req.user.id,
      new Date(date),
      duration || 30
    );

    res.json({ date, slots });
  } catch (error) {
    next(error);
  }
});

router.get('/barber/:barberId/upcoming', async (req, res, next) => {
  if (req.user.role !== 'barber' || req.user.id !== req.params.barberId) {
    return res.status(403).json({ error: 'Yalnızca kendi randevularınıza erişebilirsiniz' });
  }
  try {
    const { days } = req.query;
    const appointments = await DatabaseService.getUpcomingAppointments(
      req.businessId,
      req.user.id,
      days || 7
    );
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
