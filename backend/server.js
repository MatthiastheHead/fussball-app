// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// === 1) Überprüfung der Umgebung ===
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
    console.log('Aktuell verbundene DB:', mongoose.connection.name);
  })
  .catch((err) => {
    console.error('❌ Fehler beim Verbinden mit MongoDB:', err);
    process.exit(1);
  });

// === 3) Mongoose-Modelle importieren ===
const Player = require('./models/Player');
const Training = require('./models/Training');

// Users-Schema (bleibt wie gehabt)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

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
    await User.deleteMany({});
    if (list.length > 0) {
      await User.insertMany(list.map(u => ({ name: u.name, password: u.password })));
    }
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
      await Player.insertMany(list.map(p => ({
        name: p.name,
        isTrainer: !!p.isTrainer,
        note: typeof p.note === 'string' ? p.note : "",
        memberSince: typeof p.memberSince === 'string' ? p.memberSince : ""
      })));
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
      await Training.insertMany(
        list.map(t => ({
          date: t.date,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : "",
          playerNotes: t.playerNotes || {},   // <---- WICHTIG: Notizen pro Spieler*in!
          createdBy: t.createdBy || '',
          lastEdited: t.lastEdited || null
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
