const mongoose = require('mongoose');

const TeamCashTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['expense', 'deposit'], default: 'expense' },
  date: { type: String, required: true },
  person: { type: String, required: true, trim: true },
  amountCents: { type: Number, required: true, min: 1 },
  purpose: { type: String, required: true, trim: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const TeamCashSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'team-cash' },
  openingBalanceCents: { type: Number, default: 0, min: 0 },
  openingBalanceUpdatedBy: { type: String, default: '' },
  openingBalanceUpdatedAt: { type: Date, default: null },
  transactions: { type: [TeamCashTransactionSchema], default: [] },
});

module.exports = mongoose.model('TeamCash', TeamCashSchema);
