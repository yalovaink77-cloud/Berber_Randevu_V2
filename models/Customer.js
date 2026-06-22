const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  businessId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    lowercase: true,
  },
  notes: String,
  linkedUserId: {
    type: String,
    index: true,
  },
  source: {
    type: String,
    enum: ['manual', 'whatsapp', 'import', 'appointment'],
    default: 'manual',
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

customerSchema.index({ businessId: 1, phone: 1 }, { unique: true });

const originalModel = mongoose.model('Customer', customerSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Customer', originalModel);
