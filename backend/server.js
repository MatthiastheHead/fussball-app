// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { version } = require('./package.json');

// === Modelle ===
const Checklist = require('./models/Checklist');
const Player = require('./models/Player');
const Training = require('./models/Training');

async function replaceCollectionSafely(Model, list, cleanDocument) {
  const existing = await Model.find({}).lean();
  const existingById = new Map(existing.map(item => [String(item._id), item]));
  const keepIds = [];
  const newDocuments = [];
  const updateOperations = [];

  list.forEach(item => {
    const id = String(item?._id || '');
    const previous = mongoose.isValidObjectId(id) ? existingById.get(id) : null;
    const clean = cleanDocument(item, previous || null);
    if (previous) {
      keepIds.push(id);
      updateOperations.push({
        replaceOne: {
          filter: { _id: id },
          replacement: clean,
        },
      });
    } else {
      newDocuments.push(clean);
    }
  });

  if (newDocuments.length > 0) {
    const inserted = await Model.insertMany(newDocuments);
    keepIds.push(...inserted.map(item => String(item._id)));
  }
  if (updateOperations.length > 0) {
    await Model.bulkWrite(updateOperations);
  }
  await Model.deleteMany(keepIds.length > 0 ? { _id: { $nin: keepIds } } : {});
}

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

// === 3) Users-Schema ===
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// === 4) Express-App konfigurieren ===
const app = express();
app.use(cors());

// ⚙️ Body-Limit deutlich erhöht (Fix für HTTP 413)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ---- Diagnose-/Health-Routen ----
const sendHealth = (_req, res) => {
  const connected = mongoose.connection?.readyState === 1;
  res.status(connected ? 200 : 503).json({
    ok: connected,
    db: connected ? 'connected' : 'not-connected',
  });
};

// Öffentlicher Healthcheck für Frontend und Hosting. Der alte Diagnosepfad
// bleibt aus Kompatibilitätsgründen erhalten.
app.get('/health', sendHealth);
app.get('/__health', sendHealth);

app.get('/__routes', (req, res) => {
  const routes = (app._router?.stack || [])
    .filter(l => l.route)
    .map(l => {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      return `${methods} ${l.route.path}`;
    });
  res.json(routes);
});

// favicon ignorieren
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Root-Info
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'fussball-api', version });
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
    const cleanUsers = list.map(user => ({
      name: typeof user?.name === 'string' ? user.name.trim() : '',
      password: typeof user?.password === 'string' ? user.password : '',
    }));
    if (cleanUsers.some(user => !user.name || !user.password)) {
      return res.status(400).json({ error: 'Jeder Benutzer benötigt Name und Passwort.' });
    }
    if (new Set(cleanUsers.map(user => user.name)).size !== cleanUsers.length) {
      return res.status(409).json({ error: 'Benutzernamen dürfen nicht doppelt vorkommen.' });
    }
    await replaceCollectionSafely(User, list, user => ({
      name: user.name.trim(),
      password: user.password,
    }));
    const saved = await User.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /users:', err);
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.' });
    }
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
    const names = list.map(player =>
      typeof player?.name === 'string' ? player.name.trim() : ''
    );
    if (names.some(name => !name)) {
      return res.status(400).json({ error: 'Jedes Team-Mitglied benötigt einen Namen.' });
    }
    if (new Set(names.map(name => name.toLocaleLowerCase('de-DE'))).size !== names.length) {
      return res.status(409).json({ error: 'Namen dürfen nicht doppelt vorkommen.' });
    }
    await replaceCollectionSafely(Player, list, p => ({
        name: p.name.trim(),
        isTrainer: !!p.isTrainer,
        note: typeof p.note === 'string' ? p.note : "",
        memberSince: typeof p.memberSince === 'string' ? p.memberSince : "",
        inactive: !!p.inactive
      }));
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
    const dates = list.map(t => (typeof t?.date === 'string' ? t.date.trim() : ''));
    if (dates.some(date => !date)) {
      return res.status(400).json({ error: 'Jedes Training benötigt ein gültiges Datum.' });
    }
    if (new Set(dates).size !== dates.length) {
      return res.status(409).json({ error: 'Für ein Datum darf nur ein Training angelegt werden.' });
    }

    const cleanObject = value =>
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const cleanDate = value => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const cleanAudit = value => {
      if (!value || typeof value !== 'object') return null;
      return {
        by: typeof value.by === 'string' ? value.by : '',
        at: typeof value.at === 'string' ? value.at : '',
        action: typeof value.action === 'string' ? value.action : '',
      };
    };
    const cleanRatings = value =>
      Object.fromEntries(
        Object.entries(cleanObject(value)).map(([name, rating]) => [
          name,
          Math.max(
            0,
            Math.min(3, Number.isFinite(Number(rating)) ? Math.round(Number(rating)) : 0)
          ),
        ])
      );
    const cleanTraining = (training, previous = null) => ({
      date: training.date.trim(),
      participants: cleanObject(training.participants),
      ratings: cleanRatings(training.ratings),
      trainerStatus: cleanObject(training.trainerStatus),
      note: typeof training.note === 'string' ? training.note : '',
      playerNotes: cleanObject(training.playerNotes),
      createdBy:
        typeof training.createdBy === 'string' && training.createdBy.trim()
          ? training.createdBy.trim()
          : previous?.createdBy || '',
      createdAt: cleanDate(training.createdAt) || previous?.createdAt || new Date(),
      lastEdited: cleanAudit(training.lastEdited) || previous?.lastEdited || null,
      history: Array.isArray(training.history)
        ? training.history.map(cleanAudit).filter(Boolean).slice(-50)
        : Array.isArray(previous?.history)
          ? previous.history.slice(-50)
          : [],
    });

    // Bestehende IDs bleiben erhalten. Neue Datensätze werden zuerst angelegt
    // und erst danach werden entfernte Datensätze gelöscht. So kann ein Fehler
    // nicht mehr die komplette Trainingssammlung leeren.
    const existing = await Training.find({}).lean();
    const existingIds = new Set(existing.map(item => String(item._id)));
    const existingById = new Map(existing.map(item => [String(item._id), item]));
    const keepIds = [];
    const newDocuments = [];
    const updateOperations = [];

    list.forEach(training => {
      const id = String(training?._id || '');
      if (mongoose.isValidObjectId(id) && existingIds.has(id)) {
        const clean = cleanTraining(training, existingById.get(id));
        keepIds.push(id);
        updateOperations.push({
          replaceOne: {
            filter: { _id: id },
            replacement: clean,
          },
        });
      } else {
        newDocuments.push(cleanTraining(training));
      }
    });

    if (newDocuments.length > 0) {
      const inserted = await Training.insertMany(newDocuments);
      keepIds.push(...inserted.map(item => String(item._id)));
    }
    if (updateOperations.length > 0) {
      await Training.bulkWrite(updateOperations);
    }
    await Training.deleteMany(
      keepIds.length > 0 ? { _id: { $nin: keepIds } } : {}
    );

    const saved = await Training.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /trainings:', err);
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Für ein Datum darf nur ein Training angelegt werden.' });
    }
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Trainings' });
  }
});

// ---- 5.4 Checklists ----
console.log('🧩 Registriere Checklisten-Endpunkte...');

app.get('/checklists', async (_req, res) => {
  try {
    const list = await Checklist.find({}).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    console.error('Fehler GET /checklists:', e);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Checklisten' });
  }
});

app.post('/checklists', async (req, res) => {
  const { reset, list } = req.body || {};
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }
  try {
    await replaceCollectionSafely(Checklist, list, (cl, previous) => ({
        title: typeof cl.title === 'string' ? cl.title : 'Unbenannt',
        items: typeof cl.items === 'object' && cl.items !== null ? cl.items : {},
        createdBy: cl.createdBy || previous?.createdBy || '',
        createdAt:
          cl.createdAt && !Number.isNaN(new Date(cl.createdAt).getTime())
            ? new Date(cl.createdAt)
            : previous?.createdAt || new Date(),
        lastEdited:
          cl.lastEdited && typeof cl.lastEdited === 'object'
            ? cl.lastEdited
            : previous?.lastEdited || null
      }));
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
