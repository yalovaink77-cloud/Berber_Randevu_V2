const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    unique: true,
    required: true,
  },
  businessType: {
    type: String,
    enum: ['berber', 'kuafor', 'guzellik_merkezi'],
    default: 'berber',
  },
  city: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

businessSchema.index({ status: 1 });

const originalModel = mongoose.model('Business', businessSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Business', originalModel);
