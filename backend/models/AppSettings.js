const mongoose = require('mongoose');

const AppSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'app' },
  defaultTrainingLocation: {
    type: String,
    enum: ['Sportplatz', 'Turnhalle'],
    default: 'Sportplatz',
  },
});

module.exports = mongoose.model('AppSettings', AppSettingsSchema);
