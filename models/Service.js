const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  
  // Hangi işletme tipine ait
  businessType: {
    type: String,
    enum: ['berber', 'kuafor', 'guzellik_merkezi'],
    required: true,
  },

  // Kategori (örn: "Saç", "Sakal", "Cilt", "Tırnak")
  category: { type: String, required: true },

  // Hizmet adı
  name: { type: String, required: true },

  // Kod (AI ve sistem için)
  code: { type: String, unique: true, required: true },

  // Süre (dakika)
  defaultDuration: { type: Number, default: 30 },

  // Fiyat aralığı (TL)
  priceMin: { type: Number },
  priceMax: { type: Number },

  // Aktif mi
  isActive: { type: Boolean, default: true },
});

serviceSchema.index({ businessType: 1, category: 1 });

const originalModel = mongoose.model('Service', serviceSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Service', originalModel);
