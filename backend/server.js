// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// === 1) Überprüfung der Umgebung ===
if (!process.env.MONGODB_URI) {
  console.error('❌ Keine MONGODB_URI in .env gefunden!');
  process.exit(1);
}

// === 2) Mit MongoDB verbinden ===
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Mit MongoDB verbunden');
  })
  .catch((err) => {
    console.error('❌ Fehler beim Verbinden mit MongoDB:', err);
    process.exit(1);
  });

// === 3) Mongoose-Schemas und Models definieren ===
// 3.1 Schema für Benutzer (Users)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// 3.2 Schema für Spieler/Trainer (Players)
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  isTrainer: { type: Boolean, required: true },
});
const Player = mongoose.model('Player', playerSchema);

// 3.3 Schema für Trainings (Trainings)
const trainingSchema = new mongoose.Schema({
  date: { type: String, required: true },
  participants: { type: Object, default: {} },
  trainerStatus: { type: Object, default: {} },
  createdBy: { type: String, default: '' },
  lastEdited: {
    by: { type: String, default: '' },
    at: { type: String, default: '' },
  },
});
const Training = mongoose.model('Training', trainingSchema);

// === 4) Express-App konfigurieren ===
const app = express();
app.use(cors());
app.use(bodyParser.json());

// === 5) API-Endpunkte ===

// ---- 5.1 Users ----
// GET /users → gibt alle Benutzer zurück
app.get('/users', async (req, res) => {
  try {
    const allUsers = await User.find().lean();
    res.json(allUsers);
  } catch (err) {
    console.error('Fehler GET /users:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Users' });
  }
});

// POST /users → ersetzt die gesamte Sammlung users, wenn { reset: true, list: [...] }
app.post('/users', async (req, res) => {
  const { reset, list } = req.body;
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }

  try {
    // 1) Sammlung komplett löschen
    await User.deleteMany({});
    // 2) Neue User-Dokumente anlegen
    //    → Wir gehen davon aus, dass jedes Objekt in `list` mindestens { name, password } enthält.
    if (list.length > 0) {
      await User.insertMany(list.map(u => ({ name: u.name, password: u.password })));
    }
    // 3) Alle neuen Benutzer aus DB holen und zurücksenden
    const saved = await User.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /users:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Users' });
  }
});

// ---- 5.2 Players ----
// GET /players → gibt alle Spieler/Trainer zurück
app.get('/players', async (req, res) => {
  try {
    const allPlayers = await Player.find().lean();
    res.json(allPlayers);
  } catch (err) {
    console.error('Fehler GET /players:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Players' });
  }
});

// POST /players → ersetzt die gesamte players-Sammlung
app.post('/players', async (req, res) => {
  const { reset, list } = req.body;
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }

  try {
    await Player.deleteMany({});
    if (list.length > 0) {
      await Player.insertMany(list.map(p => ({ name: p.name, isTrainer: p.isTrainer })));
    }
    const saved = await Player.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /players:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Players' });
  }
});

// ---- 5.3 Trainings ----
// GET /trainings → gibt alle Trainings zurück
app.get('/trainings', async (req, res) => {
  try {
    const allTrainings = await Training.find().lean();
    res.json(allTrainings);
  } catch (err) {
    console.error('Fehler GET /trainings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Trainings' });
  }
});

// POST /trainings → ersetzt die gesamte trainings-Sammlung
app.post('/trainings', async (req, res) => {
  const { reset, list } = req.body;
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }

  try {
    await Training.deleteMany({});
    if (list.length > 0) {
      // list ist ein Array von Objekten mit: { date, participants, trainerStatus, createdBy, lastEdited }
      await Training.insertMany(
        list.map(t => ({
          date: t.date,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          createdBy: t.createdBy || '',
          lastEdited: t.lastEdited || { by: '', at: '' },
        }))
      );
    }
    const saved = await Training.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /trainings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Trainings' });
  }
});

// === 6) Fallback-Route (optional) ===
app.use((req, res) => {
  res.status(404).send('Nicht gefunden');
});

// === 7) Server starten ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft unter http://localhost:${PORT} (oder Port ${PORT})`);
});
