const mongoose = require('mongoose');

const PasswordResetRequestSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, index: true },
  userId: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open',
    index: true,
  },
  firstRequestedAt: { type: Date, required: true, default: Date.now },
  lastRequestedAt: { type: Date, required: true, default: Date.now, index: true },
  requestCount: { type: Number, default: 0, min: 0 },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: '' },
});

PasswordResetRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

module.exports = mongoose.model('PasswordResetRequest', PasswordResetRequestSchema);
