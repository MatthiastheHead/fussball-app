// models/Checklist.js
const mongoose = require('mongoose');

const ChecklistSchema = new mongoose.Schema({
  title: { type: String, required: true },
  items: { type: Object, default: {} }, // { "Spielername": true/false }
  createdBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Checklist', ChecklistSchema);
