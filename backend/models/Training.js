// backend/models/Training.js
const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
  // Datum im Format "Wochentag, DD.MM.YYYY"
  date:          { type: String, required: true, trim: true },
  // Teilnehmer-Status: { "Spielername": "✅" | "❌" | "⏳" }
  participants:  { type: Object, default: {} },
  // Trainer-Status: { "Trainername": "Zugesagt" | "Abgemeldet" }
  trainerStatus: { type: Object, default: {} },
  // Notiz zum Training
  note:          { type: String, default: "" },
  // Notizen pro Spieler*in: { "Spielername": "Text" }
  playerNotes:   { type: Object, default: {} },
  // Wer das Training angelegt hat
  createdBy:     { type: String, default: "" },
  // Letzte Bearbeitung (z. B. { by: "Name", at: "dd.mm.yyyy hh:mm" }), kann auch null sein
  lastEdited:    { type: Object, default: null }
});

module.exports = mongoose.model('Training', TrainingSchema);
