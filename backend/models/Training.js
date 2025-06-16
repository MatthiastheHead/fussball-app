// backend/models/Training.js
const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
  date:          { type: String, required: true },
  participants:  { type: Object, default: {} },
  trainerStatus: { type: Object, default: {} },
  note:          { type: String, default: "" },
  createdBy:     { type: String, default: "" },
  lastEdited:    { type: Object, default: null }
});

module.exports = mongoose.model('Training', TrainingSchema);
