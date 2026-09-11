const mongoose = require('mongoose');
module.exports = mongoose.model('CashReceipt', new mongoose.Schema({
  transactionId: { type: String, required: true, index: true, match: /^[a-f\d]{24}$/i },
  name: { type: String, required: true, maxlength: 180 },
  type: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  data: { type: String, required: true },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  sha256: { type: String, required: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}));
