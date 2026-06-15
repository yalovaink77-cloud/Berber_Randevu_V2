const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { requireBarber } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

function slugify(str) {
  const trMap = { 'ç':'c', 'ğ':'g', 'ı':'i', 'ö':'o', 'ş':'s', 'ü':'u',
                  'Ç':'C', 'Ğ':'G', 'İ':'I', 'Ö':'O', 'Ş':'S', 'Ü':'U' };
  for (const key in trMap) {
    str = str.replace(new RegExp(key, 'g'), trMap[key]);
  }
  return str.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').trim();
}

/**
 * GET /api/services/list
 * Tüm hizmetleri listele (authenticate → herhangi giriş yapmış kullanıcı)
 */
router.get('/list', async (req, res, next) => {
  try {
    const services = await Service.find({}).sort({ businessType: 1, category: 1 });
    res.json(services);
  } catch (err) { next(err); }
});

/**
 * POST /api/services/create
 * Yeni hizmet ekle — sadece berber
 */
router.post('/create', requireBarber, async (req, res, next) => {
  try {
    const { category, name, defaultDuration, priceMin, priceMax } = req.body;
    if (!category || !name) {
      return res.status(400).json({ error: 'Kategori ve Hizmet Adı zorunludur.' });
    }

    const serviceCode = 'berber_' + slugify(name);
    const existing = await Service.findOne({ code: serviceCode });
    if (existing) {
      return res.status(400).json({ error: 'Bu isimde bir hizmet zaten mevcut.' });
    }

    const newService = await Service.create({
      id: uuidv4(),
      code: serviceCode,
      businessType: 'berber',
      category,
      name,
      defaultDuration: Number(defaultDuration) || 30,
      priceMin: Number(priceMin) || 0,
      priceMax: Number(priceMax) || Number(priceMin) || 0,
      isActive: true,
    });

    res.status(201).json({ success: true, message: 'Hizmet başarıyla eklendi.', service: newService });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/services/update/:id
 * Hizmet güncelle — sadece berber
 */
router.put('/update/:id', requireBarber, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, name, defaultDuration, priceMin, priceMax, isActive } = req.body;

    const service = await Service.findOne({ id });
    if (!service) {
      return res.status(404).json({ error: 'Güncellenecek hizmet bulunamadı.' });
    }

    const updatedData = {};
    if (category !== undefined) updatedData.category = category;
    if (name !== undefined) updatedData.name = name;
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

/**
 * DELETE /api/services/delete/:id
 * Hizmet sil — sadece berber
 */
router.delete('/delete/:id', requireBarber, async (req, res, next) => {
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
