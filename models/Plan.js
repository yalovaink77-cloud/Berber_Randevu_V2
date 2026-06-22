const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  priceAmount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'TRY',
  },
  billingInterval: {
    type: String,
    enum: ['monthly'],
    default: 'monthly',
  },
  features: {
    type: [String],
    default: [],
  },
  isActive: {
    type: Boolean,
    default: true,
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

planSchema.index({ code: 1 }, { unique: true });

const originalModel = mongoose.model('Plan', planSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Plan', originalModel);
