const express = require('express');
const Joi = require('joi');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const CallAssistantService = require('../services/callAssistantService');
const { requireActiveSubscriptionOnWrite } = require('../middleware/auth');

router.use(requireActiveSubscriptionOnWrite);

const contactCategories = ['customer', 'vip', 'family', 'friend', 'supplier', 'unknown', 'blocked'];
const barberStatuses = ['available', 'working', 'break', 'closed'];

const profileSchema = Joi.object({
  businessName: Joi.string().trim().min(2),
  businessAddress: Joi.string().trim().allow('', null),
  specialties: Joi.array().items(Joi.string().trim()).default([]),
  workDays: Joi.object().unknown(true),
  workHours: Joi.object({
    start: Joi.number().integer().min(0).max(23).required(),
    end: Joi.number().integer().min(1).max(24).required(),
  }),
  assistantSettings: Joi.object({
    missedCallAutoReply: Joi.boolean(),
    unknownCallerAutoReply: Joi.boolean(),
    privateContactAutoReply: Joi.boolean(),
    defaultReplyChannel: Joi.string().valid('whatsapp', 'sms', 'none'),
  }),
  onboarding: Joi.object({
    profileCompleted: Joi.boolean(),
    contactsImported: Joi.boolean(),
    permissionsGranted: Joi.object({
      contacts: Joi.boolean(),
      phoneState: Joi.boolean(),
      notifications: Joi.boolean(),
    }),
  }),
}).min(1);

const statusSchema = Joi.object({
  assistantStatus: Joi.string().valid(...barberStatuses).required(),
});

const contactSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  phone: Joi.string().trim().min(8).required(),
  category: Joi.string().valid(...contactCategories).default('unknown'),
  autoReplyEnabled: Joi.boolean().default(true),
  notes: Joi.string().allow('', null),
});

const missedCallSchema = Joi.object({
  fromPhone: Joi.string().trim().min(8).required(),
  fromName: Joi.string().trim().allow('', null),
  barberStatus: Joi.string().valid(...barberStatuses),
  sendAutoReply: Joi.boolean(),
  callAt: Joi.date().iso(),
});

const listSchema = Joi.object({
  category: Joi.string().valid(...contactCategories),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

function validateBody(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Geçersiz istek verisi',
        details: error.details.map((detail) => detail.message),
      });
    }

    req.body = value;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Geçersiz sorgu parametresi',
        details: error.details.map((detail) => detail.message),
      });
    }

    req.query = value;
    next();
  };
}

function requireBarber(req, res, next) {
  if (req.user?.role !== 'barber') {
    return res.status(403).json({ error: 'Bu işlem için berber yetkisi gerekli' });
  }
  next();
}

router.get('/contacts', requireBarber, validateQuery(listSchema), async (req, res, next) => {
  try {
    const contacts = await DatabaseService.getContacts(req.user.id, req.query.category);
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

router.post('/contacts', requireBarber, validateBody(contactSchema), async (req, res, next) => {
  try {
    const contact = await DatabaseService.upsertContact(req.user.id, req.body);
    res.status(201).json({
      success: true,
      contact,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/contacts/:phone', requireBarber, async (req, res, next) => {
  try {
    await DatabaseService.deleteContact(req.user.id, req.params.phone);
    res.json({
      success: true,
      message: 'Kişi başarıyla silindi ve sıfırlandı'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', requireBarber, async (req, res, next) => {
  try {
    const profile = await DatabaseService.getUserById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Berber profili bulunamadı' });
    const obj = profile.toObject();
    delete obj.passwordHash;
    delete obj.__v;
    res.json(obj);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', requireBarber, validateBody(profileSchema), async (req, res, next) => {
  try {
    const profile = await DatabaseService.updateBarberProfile(req.user.id, req.body);
    if (!profile) return res.status(404).json({ error: 'Berber profili bulunamadı' });
    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/status', requireBarber, validateBody(statusSchema), async (req, res, next) => {
  try {
    const profile = await DatabaseService.updateAssistantStatus(
      req.user.id,
      req.body.assistantStatus
    );
    if (!profile) return res.status(404).json({ error: 'Berber profili bulunamadı' });
    res.json({
      success: true,
      assistantStatus: profile.assistantStatus,
      profile,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/missed-calls', requireBarber, validateQuery(listSchema), async (req, res, next) => {
  try {
    const calls = await DatabaseService.getMissedCalls(req.user.id, req.query.limit);
    res.json(calls);
  } catch (error) {
    next(error);
  }
});

router.post('/missed-calls', requireBarber, validateBody(missedCallSchema), async (req, res, next) => {
  try {
    const profile = await DatabaseService.getUserById(req.user.id);
    const barberStatus = req.body.barberStatus || profile?.assistantStatus || 'working';
    const sendAutoReply =
      typeof req.body.sendAutoReply === 'boolean'
        ? req.body.sendAutoReply
        : profile?.assistantSettings?.missedCallAutoReply === true;
    const result = await CallAssistantService.handleMissedCall({
      barberId: req.user.id,
      ...req.body,
      barberStatus,
      sendAutoReply,
      assistantSettings: profile?.assistantSettings,
    });

    res.status(201).json({
      success: true,
      missedCall: result.missedCall,
      decision: result.decision,
      contact: result.contact,
      hasAppointmentHistory: result.hasAppointmentHistory,
    });
  } catch (error) {
    next(error);
  }
});

// ===== CHAT SIMULATION ENDPOINTS FOR LOCAL REVIEW AND DEMO FLOWS =====
const ConversationService = require('../services/conversationService');

router.post('/simulate-message', requireBarber, async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Telefon numarası ve mesaj zorunludur' });
    }

    // Initialize global simulated state
    if (!global.simulatedChats) {
      global.simulatedChats = {};
    }
    if (!global.simulatedChats[phone]) {
      global.simulatedChats[phone] = [];
    }

    // Add user message to simulation store
    global.simulatedChats[phone].push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Handle WhatsApp flow with conversation service (this triggers AI and books appointments)
    await ConversationService.handleMessage(phone, message, req.user.id);

    res.json({
      success: true,
      history: global.simulatedChats[phone]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/simulate-message/:phone', requireBarber, async (req, res, next) => {
  try {
    const { phone } = req.params;
    if (!global.simulatedChats || !global.simulatedChats[phone]) {
      return res.json({ success: true, history: [] });
    }
    res.json({ success: true, history: global.simulatedChats[phone] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
