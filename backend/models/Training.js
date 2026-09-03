// backend/models/Training.js
const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
  // Datum im Format "Wochentag, DD.MM.YYYY"
  date:          { type: String, required: true, trim: true, unique: true },
  // Teilnehmer-Status: { "Spielername": "✅" | "❌" | "⏳" }
  participants:  { type: Object, default: {} },
  // Trainingsbewertung je Spielerin: { "Spielername": 0 | 1 | 2 | 3 }
  ratings:       { type: Object, default: {} },
  // Trainer-Status: { "Trainername": "Zugesagt" | "Abgemeldet" | "Nicht abgemeldet" }
  trainerStatus: { type: Object, default: {} },
  // Notiz zum Training
  note:          { type: String, default: "" },
  // Notizen pro Spieler*in: { "Spielername": "Text" }
  playerNotes:   { type: Object, default: {} },
  // Wer das Training angelegt hat
  createdBy:     { type: String, default: "" },
  // Zeitpunkt der Anlage. Bei historischen Datensätzen darf er unbekannt sein.
  createdAt:     { type: Date, default: null },
  // Letzte Bearbeitung: { by, at, action }
  lastEdited:    { type: Object, default: null },
  // Begrenzter Bearbeitungsverlauf für Version 6.0
  history:       { type: Array, default: [] }
});

module.exports = mongoose.model('Training', TrainingSchema);
