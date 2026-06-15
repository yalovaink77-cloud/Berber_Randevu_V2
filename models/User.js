const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    lowercase: true,
  },
  role: {
    type: String,
    enum: ['barber', 'customer'],
    default: 'customer',
  },
  passwordHash: {
    type: String,
    select: false,
  },
  // Berber için özel alanlar
  businessName: {
    type: String,
  },
  businessAddress: {
    type: String,
  },
  assistantStatus: {
    type: String,
    enum: ['available', 'working', 'break', 'closed'],
    default: 'working',
  },
  assistantSettings: {
    missedCallAutoReply: {
      type: Boolean,
      default: false,
    },
    unknownCallerAutoReply: {
      type: Boolean,
      default: false,
    },
    privateContactAutoReply: {
      type: Boolean,
      default: false,
    },
    defaultReplyChannel: {
      type: String,
      enum: ['whatsapp', 'sms', 'none'],
      default: 'whatsapp',
    },
  },
  onboarding: {
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    contactsImported: {
      type: Boolean,
      default: false,
    },
    permissionsGranted: {
      contacts: {
        type: Boolean,
        default: false,
      },
      phoneState: {
        type: Boolean,
        default: false,
      },
      notifications: {
        type: Boolean,
        default: false,
      },
    },
  },
  specialties: [
    {
      type: String, // Saç kesimi, tıraş vb.
    },
  ],
  workDays: {
    type: Object, // { monday: true, tuesday: true, ...}
  },
  workHours: {
    start: Number, // 10
    end: Number,   // 20
  },
  // Müşteri için özel alanlar
  preferences: {
    favoriteBarbers: [String],
    preferredTime: String,
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

const originalModel = mongoose.model('User', userSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('User', originalModel);
