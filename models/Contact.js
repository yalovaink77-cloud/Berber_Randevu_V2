const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  ownerId: {
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
  category: {
    type: String,
    enum: ['customer', 'vip', 'family', 'friend', 'supplier', 'unknown', 'blocked'],
    default: 'unknown',
  },
  autoReplyEnabled: {
    type: Boolean,
    default: true,
  },
  notes: String,
  lastInteractionAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

contactSchema.index({ ownerId: 1, phone: 1 }, { unique: true });

const originalModel = mongoose.model('Contact', contactSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Contact', originalModel);
