// backend/models/Player.js
const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  isTrainer:   { type: Boolean, default: false }, // <- für Konsistenz im Frontend
  note:        { type: String, default: "" },
  memberSince: { type: String, default: "" }
});

module.exports = mongoose.model('Player', PlayerSchema);
