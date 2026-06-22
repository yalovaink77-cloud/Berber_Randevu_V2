const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  businessId: {
    type: String,
    required: true,
    index: true,
  },
  planCode: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'],
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
  trialEndsAt: {
    type: Date,
  },
  currentPeriodStart: {
    type: Date,
  },
  currentPeriodEnd: {
    type: Date,
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false,
  },
  paymentProvider: {
    type: String,
  },
  providerCustomerId: {
    type: String,
  },
  providerSubscriptionId: {
    type: String,
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

subscriptionSchema.index({ businessId: 1, status: 1 });

const originalModel = mongoose.model('Subscription', subscriptionSchema);
const { createModelProxy } = require('./mockFactory');
module.exports = createModelProxy('Subscription', originalModel);
