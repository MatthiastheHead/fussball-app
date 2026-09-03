const mongoose = require('mongoose');

const AdminRecoverySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'matthias' },
    encryptedSecret: { type: String, default: '' },
    recoveryCodeHashes: { type: [String], default: [] },
    lastUsedCounter: { type: Number, default: -1 },
    enabledAt: { type: Date, default: null },
    pendingEncryptedSecret: { type: String, default: '' },
    pendingRecoveryCodeHashes: { type: [String], default: [] },
    pendingCreatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminRecovery', AdminRecoverySchema);
