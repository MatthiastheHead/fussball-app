// models/Checklist.js
const mongoose = require('mongoose');

const ChecklistSchema = new mongoose.Schema({
  title: { type: String, required: true },
  items: { type: Object, default: {} },       // { "Spielername": true/false }
  createdBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  // Neu: History für letzte Bearbeitung. Optional, daher default null.
  lastEdited: { type: Object, default: null }, // { by: String, at: String } oder null
});

module.exports = mongoose.model('Checklist', ChecklistSchema);
