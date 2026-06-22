const express = require('express');
const Joi = require('joi');
const router = express.Router();
const businessService = require('../services/businessService');
const {
  requireBarber,
  requireTenant,
  requireActiveSubscriptionOnWrite,
} = require('../middleware/auth');

router.use(requireTenant);
router.use(requireActiveSubscriptionOnWrite);

const updateSchema = Joi.object({
  name: Joi.string().trim().min(2),
  city: Joi.string().trim().allow(''),
  businessType: Joi.string().valid(...businessService.VALID_BUSINESS_TYPES),
}).min(1);

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

router.get('/me', requireBarber, async (req, res, next) => {
  try {
    const business = await businessService.getMyBusiness(req.businessId);
    res.json({ success: true, business });
  } catch (err) {
    next(err);
  }
});

router.put('/me', requireBarber, validateBody(updateSchema), async (req, res, next) => {
  try {
    const business = await businessService.updateMyBusiness(
      req.businessId,
      req.user.id,
      req.body
    );
    res.json({ success: true, business });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({
        error: err.message || 'Geçersiz istek verisi',
        details: err.details,
      });
    }
    next(err);
  }
});

module.exports = router;
