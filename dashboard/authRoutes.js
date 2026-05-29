const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Body: { name, phone, email?, password, role? }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name, phone, email, password, role } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone ve password zorunlu' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
    }

    const result = await authService.register({ name, phone, email, password, role });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Body: { phone, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'phone ve password zorunlu' });
    }

    const result = await authService.login({ phone, password });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Token sahibinin profilini döner
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findOne({ id: req.user.id }).select('-passwordHash -__v');
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
