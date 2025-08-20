// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// === Modelle ===
const Checklist = require('./models/Checklist');
const Player = require('./models/Player');
const Training = require('./models/Training');

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

// === 3) Users-Schema (bleibt wie gehabt) ===
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// === 4) Express-App konfigurieren ===
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---- Diagnose-/Health-Routen (zum Verifizieren des Deploys) ----
app.get('/__health', (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection?.readyState === 1 ? 'connected' : 'not-connected',
    cwd: process.cwd(),
  });
});

app.get('/__routes', (req, res) => {
  const routes = (app._router?.stack || [])
    .filter(l => l.route)
    .map(l => {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      return `${methods} ${l.route.path}`;
    });
  res.json(routes);
});

// favicon-Noise ausblenden
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Root-Info
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'fussball-api', version: 1 });
});

// === 5) API-Endpunkte ===

// ---- 5.1 Users ----
app.get('/users', async (req, res) => {
  try {
    const allUsers = await User.find().lean();
    res.json(allUsers);
  } catch (err) {
    console.error('Fehler GET /users:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Users' });
  }
});

app.post('/users', async (req, res) => {
  const { reset, list } = req.body || {};
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
app.get('/players', async (req, res) => {
  try {
    const allPlayers = await Player.find().lean();
    res.json(allPlayers);
  } catch (err) {
    console.error('Fehler GET /players:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Players' });
  }
});

app.post('/players', async (req, res) => {
  const { reset, list } = req.body || {};
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
app.get('/trainings', async (req, res) => {
  try {
    const allTrainings = await Training.find().lean();
    res.json(allTrainings);
  } catch (err) {
    console.error('Fehler GET /trainings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Trainings' });
  }
});

app.post('/trainings', async (req, res) => {
  const { reset, list } = req.body || {};
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
          playerNotes: t.playerNotes || {},   // Notizen pro Spieler*in
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

// ---- 5.4 Checklists (NEU) ----
console.log('🧩 Registriere Checklisten-Endpunkte...');

// GET /checklists → alle Checklisten, neueste zuerst
app.get('/checklists', async (_req, res) => {
  try {
    const list = await Checklist.find({}).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    console.error('Fehler GET /checklists:', e);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Checklisten' });
  }
});

// POST /checklists → ersetzt die gesamte Sammlung (reset/list)
app.post('/checklists', async (req, res) => {
  const { reset, list } = req.body || {};
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }
  try {
    await Checklist.deleteMany({});
    if (list.length > 0) {
      await Checklist.insertMany(list.map(cl => ({
        title: typeof cl.title === 'string' ? cl.title : 'Unbenannt',
        items: typeof cl.items === 'object' && cl.items !== null ? cl.items : {},
        createdBy: cl.createdBy || '',
        createdAt: cl.createdAt ? new Date(cl.createdAt) : new Date()
      })));
    }
    const saved = await Checklist.find({}).sort({ createdAt: -1 }).lean();
    res.json(saved);
  } catch (e) {
    console.error('Fehler POST /checklists:', e);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Checklisten' });
  }
});

// === 6) Fallback-Route ===
app.use((req, res) => {
  res.status(404).send('Nicht gefunden');
});

// === 7) Server starten ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft unter http://localhost:${PORT} (oder Port ${PORT})`);
});
