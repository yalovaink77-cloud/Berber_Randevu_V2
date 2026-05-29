const mongoose = require('mongoose');

const missedCallSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  barberId: {
    type: String,
    required: true,
    index: true,
  },
  fromPhone: {
    type: String,
    required: true,
  },
  fromName: String,
  contactCategory: {
    type: String,
    enum: ['customer', 'vip', 'family', 'friend', 'supplier', 'unknown', 'blocked'],
    default: 'unknown',
  },
  barberStatus: {
    type: String,
    enum: ['available', 'working', 'break', 'closed'],
    default: 'working',
  },
  autoReplyMessage: String,
  autoReplyAction: {
    type: String,
    enum: ['none', 'send', 'manual_review'],
    default: 'manual_review',
  },
  autoReplySent: {
    type: Boolean,
    default: false,
  },
  replyChannel: {
    type: String,
    enum: ['whatsapp', 'sms', 'none'],
    default: 'whatsapp',
  },
  callAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

missedCallSchema.index({ barberId: 1, callAt: -1 });

const originalModel = mongoose.model('MissedCall', missedCallSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('MissedCall', originalModel);
