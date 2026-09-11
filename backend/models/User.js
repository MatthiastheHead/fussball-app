const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  backupPermissions: {
    canFullBackup: { type: Boolean, default: false },
    canExport: { type: Boolean, default: false },
    canImport: { type: Boolean, default: false },
  },
  cashPermissions: {
    canDelete: { type: Boolean, default: false },
    canViewDeleted: { type: Boolean, default: false },
  },
  permissions: {
    tasks: { type: Boolean, default: true },
    training: { type: Boolean, default: true },
    checklists: { type: Boolean, default: true },
    teamGenerator: { type: Boolean, default: true },
    teamCash: { type: Boolean, default: true },
  },
});
module.exports = mongoose.model('User', userSchema);
