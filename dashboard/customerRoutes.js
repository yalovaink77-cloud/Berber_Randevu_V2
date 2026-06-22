const express = require('express');
const Joi = require('joi');
const router = express.Router();
const customerService = require('../services/customerService');
const {
  requireBarber,
  requireTenant,
  requireActiveSubscriptionOnWrite,
} = require('../middleware/auth');

router.use(requireTenant);
router.use(requireActiveSubscriptionOnWrite);

const createSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  phone: Joi.string().trim().min(8).required(),
  email: Joi.string().trim().email().allow('', null),
  notes: Joi.string().trim().allow('', null),
});

const updateSchema = Joi.object({
  name: Joi.string().trim().min(2),
  phone: Joi.string().trim().min(8),
  email: Joi.string().trim().email().allow('', null),
  notes: Joi.string().trim().allow('', null),
}).min(1);

const listSchema = Joi.object({
  q: Joi.string().trim().allow(''),
  limit: Joi.number().integer().min(1).max(200).default(100),
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

function handleServiceError(err, res, next) {
  if (err.status === 400) {
    return res.status(400).json({
      error: err.message || 'Geçersiz istek verisi',
      details: err.details,
    });
  }
  if (err.status === 404) {
    return res.status(404).json({ error: err.message || 'Müşteri bulunamadı' });
  }
  if (err.status === 409) {
    return res.status(409).json({ error: err.message });
  }
  return next(err);
}

router.get('/', requireBarber, validateQuery(listSchema), async (req, res, next) => {
  try {
    const customers = await customerService.listCustomers(req.businessId, req.query);
    res.json({ success: true, customers });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireBarber, async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.businessId, req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }
    res.json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireBarber, validateBody(createSchema), async (req, res, next) => {
  try {
    const customer = await customerService.createCustomer(req.businessId, req.body);
    res.status(201).json({ success: true, customer });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

router.put('/:id', requireBarber, validateBody(updateSchema), async (req, res, next) => {
  try {
    const customer = await customerService.updateCustomer(
      req.businessId,
      req.params.id,
      req.body
    );
    res.json({ success: true, customer });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

module.exports = router;
