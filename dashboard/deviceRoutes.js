const express = require('express');
const Joi = require('joi');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const CallAssistantService = require('../services/callAssistantService');
const { authenticateDeviceOrBarber } = require('../middleware/deviceAuth');

const missedCallSchema = Joi.object({
  barberId: Joi.string().trim(),
  fromPhone: Joi.string().trim().min(8).required(),
  fromName: Joi.string().trim().allow('', null),
  barberStatus: Joi.string().valid('available', 'working', 'break', 'closed'),
  sendAutoReply: Joi.boolean(),
  callAt: Joi.date().iso(),
});

router.use(authenticateDeviceOrBarber);

router.post('/missed-call', async (req, res, next) => {
  try {
    const { value, error } = missedCallSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        error: 'Geçersiz istek verisi',
        details: error.details.map((d) => d.message),
      });
    }

    const barberId = req.user.id;
    const profile = await DatabaseService.getUserById(barberId);
    if (!profile || profile.role !== 'barber') {
      return res.status(404).json({ error: 'Berber bulunamadı' });
    }

    const barberStatus = value.barberStatus || profile.assistantStatus || 'working';
    const sendAutoReply =
      typeof value.sendAutoReply === 'boolean'
        ? value.sendAutoReply
        : profile.assistantSettings?.missedCallAutoReply === true;

    const result = await CallAssistantService.handleMissedCall({
      barberId,
      fromPhone: value.fromPhone,
      fromName: value.fromName,
      barberStatus,
      sendAutoReply,
      assistantSettings: profile.assistantSettings,
      callAt: value.callAt,
    });

    res.status(201).json({
      success: true,
      authSource: req.authSource,
      missedCall: result.missedCall,
      decision: result.decision,
      contact: result.contact,
      hasAppointmentHistory: result.hasAppointmentHistory,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/status', async (req, res, next) => {
  try {
    const status = req.body?.assistantStatus;
    if (!['available', 'working', 'break', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz assistantStatus' });
    }
    const profile = await DatabaseService.updateAssistantStatus(req.user.id, status);
    if (!profile) return res.status(404).json({ error: 'Berber bulunamadı' });
    res.json({ success: true, assistantStatus: profile.assistantStatus });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
