const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  customerId: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  barberId: {
    type: String,
    required: true,
  },
  barberName: {
    type: String,
    required: true,
  },
  businessId: {
    type: String,
    index: true,
  },
  serviceType: {
    type: String,
    default: 'haircut',
  },
  appointmentDate: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number, // dakika
    default: 30,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes: String,
  price: Number,
  aiSummary: String, // Claude AI tarafından oluşturulan özet
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index'ler
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ customerId: 1 });
appointmentSchema.index({ barberId: 1 });
appointmentSchema.index({ businessId: 1, appointmentDate: 1 });
appointmentSchema.index({ status: 1 });

const originalModel = mongoose.model('Appointment', appointmentSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Appointment', originalModel);
