const mongoose = require('mongoose');

const AdminRecoverySchema = new mongoose.Schema(
  {
    // "key" bleibt erhalten, damit eine bereits eingerichtete Matthias-
    // Wiederherstellung ohne Datenverlust weiterverwendet werden kann.
    key: { type: String, required: true, unique: true },
    userId: { type: String, index: { unique: true, sparse: true } },
    username: { type: String, default: '', trim: true },
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
