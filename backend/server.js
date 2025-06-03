// backend/server.js

require('dotenv').config();                // Liest .env-Datei ein
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === 0) Verbindung zu MongoDB über Mongoose ===
const mongoURI = process.env.MONGODB_URI || '';  
if (!mongoURI) {
  console.error('❌ Keine MONGODB_URI in .env gefunden!');
  process.exit(1);
}

mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Mit MongoDB verbunden'))
  .catch(err => {
    console.error('❌ MongoDB-Verbindungsfehler:', err);
    process.exit(1);
  });

// === 0.1) OPTIONAL: Sobald wir verbunden sind, können wir prüfen, ob Collections existieren oder initial Daten anlegen. 
//             Wir gehen aber davon aus, dass die Collections bei Bedarf dynamisch gefüllt werden.

// --------------------------------------------------------------------------------
// === 1) Mongoose‐Schemen und -Modelle ===

// 1.1) User‐Schema
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  isAdmin:   { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// 1.2) Player‐Schema (Spieler & Trainer)
const playerSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  isTrainer: { type: Boolean, default: false }
});
const Player = mongoose.model('Player', playerSchema);

// 1.3) Training‐Schema
const trainingSchema = new mongoose.Schema({
  date: {
    type: String, required: true  // z. B. "Mo, 12.05.2025"
  },
  participants: {
    // Schlüssel: Spieler-Name, Wert: Icon als String ("✅", "❌", "⏳" oder "—")
    type: Map,
    of: String,
    default: {}
  },
  trainerStatus: {
    // Schlüssel: Trainer-Name, Wert: Status-String ("Zugesagt" oder "Abgemeldet")
    type: Map,
    of: String,
    default: {}
  },
  createdBy: {
    type: String, required: true // Benutzername, der das Training angelegt hat
  },
  lastEdited: {
    by: { type: String },
    at: { type: String }         // z. B. "14.05.2025 16:30"
  }
});
const Training = mongoose.model('Training', trainingSchema);

// --------------------------------------------------------------------------------
// === 2) USER‐Routen ===

// 2.1) GET /users → Liefere alle Benutzer (Name, Passwort, isAdmin)
app.get('/users', async (req, res) => {
  try {
    const all = await User.find({}, { __v: 0 }).lean();
    return res.json(all);
  } catch (err) {
    console.error('Fehler in GET /users:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 2.2) POST /users → Neuen Benutzer erstellen
//       Body: { name: String, password: String, isAdmin: Boolean }
app.post('/users', async (req, res) => {
  const { name, password, isAdmin } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'name und password erforderlich' });
  }
  try {
    // Prüfe, ob Benutzername existiert
    const exists = await User.findOne({ name }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Benutzer existiert bereits' });
    }
    const neu = new User({ name, password, isAdmin: !!isAdmin });
    await neu.save();
    return res.status(201).json({ message: 'Benutzer angelegt' });
  } catch (err) {
    console.error('Fehler in POST /users:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 2.3) PUT /users/:name → Passwort oder isAdmin ändern
//       Body kann eines oder beide Felder enthalten: { password?: String, isAdmin?: Boolean }
app.put('/users/:name', async (req, res) => {
  const username = req.params.name;
  const { password, isAdmin } = req.body;
  try {
    const user = await User.findOne({ name: username });
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    if (password !== undefined) user.password = password;
    if (isAdmin !== undefined) user.isAdmin = isAdmin;
    await user.save();
    return res.json({ message: 'Benutzer aktualisiert' });
  } catch (err) {
    console.error(`Fehler in PUT /users/${username}:`, err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 2.4) DELETE /users/:name → Benutzer löschen (außer Adminngabe optional)
//       Falls man Administrator nicht löschen möchte, müsste man hier extra prüfen.
//       Wir lassen es dem Frontend überlassen, dass Admins sich selbst nicht löschen.
app.delete('/users/:name', async (req, res) => {
  const username = req.params.name;
  try {
    const result = await User.deleteOne({ name: username });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    return res.json({ message: 'Benutzer gelöscht' });
  } catch (err) {
    console.error(`Fehler in DELETE /users/${username}:`, err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// --------------------------------------------------------------------------------
// === 3) PLAYER‐Routen ===

// 3.1) GET /players → Liefere alle Spieler/Trainer
app.get('/players', async (req, res) => {
  try {
    const all = await Player.find({}, { __v: 0 }).lean();
    return res.json(all);
  } catch (err) {
    console.error('Fehler in GET /players:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 3.2) POST /players → Komplette Liste von Spielern/Trainern neu setzen
//       Body: { reset: true, list: [ { name: String, isTrainer: Boolean }, … ] }
app.post('/players', async (req, res) => {
  const { reset, list } = req.body;
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültiger Body: reset + list erwartet' });
  }
  try {
    // 1) Leere Collection
    await Player.deleteMany({});
    // 2) Setze die übergebene Liste ein
    if (list.length > 0) {
      // Wir ziehen Bulk‐Insert vor, statt einzelne saves
      await Player.insertMany(list.map(p => ({ name: p.name, isTrainer: p.isTrainer })));
    }
    return res.json({ message: 'Spielerliste gespeichert' });
  } catch (err) {
    console.error('Fehler in POST /players:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 3.3) DELETE /players/:name → Einzelnen Spieler/Trainer löschen
app.delete('/players/:name', async (req, res) => {
  const nm = req.params.name;
  try {
    const result = await Player.deleteOne({ name: nm });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Spieler/Trainer nicht gefunden' });
    }
    return res.json({ message: 'Spieler/Trainer gelöscht' });
  } catch (err) {
    console.error(`Fehler in DELETE /players/${nm}:`, err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// --------------------------------------------------------------------------------
// === 4) TRAINING‐Routen ===

// 4.1) GET /trainings → Liefere alle Trainings
app.get('/trainings', async (req, res) => {
  try {
    const all = await Training.find({}, { __v: 0 }).lean();
    return res.json(all);
  } catch (err) {
    console.error('Fehler in GET /trainings:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 4.2) POST /trainings → Komplette Trainings‐Liste neu setzen
//       Body: { reset: true, list: [ <TrainingObjekt>, … ] }
//       Ein TrainingObjekt muss alle Felder enthalten, z. B.:
//       {
//         date: String,
//         participants: { "Max Mustermann": "✅", … },
//         trainerStatus: { "Julia Schmidt": "Abgemeldet", … },
//         createdBy: String,
//         lastEdited: { by: String, at: String }
//       }
app.post('/trainings', async (req, res) => {
  const { reset, list } = req.body;
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültiger Body: reset + list erwartet' });
  }
  try {
    // 1) Lösche alle Trainings
    await Training.deleteMany({});
    // 2) Füge alle aus dem Body ein
    if (list.length > 0) {
      // Mongoose‐inserts setzen die Maps korrekt um
      await Training.insertMany(list.map(t => ({
        date: t.date,
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {},
        createdBy: t.createdBy,
        lastEdited: t.lastEdited
      })));
    }
    return res.json({ message: 'Trainingsliste gespeichert' });
  } catch (err) {
    console.error('Fehler in POST /trainings:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// 4.3) DELETE /trainings/:id → Einzelnes Training löschen
//       Hier verwenden wir die Trainings‐ID aus MongoDB, nicht das Datum
//       Restrukturierung: Statt nur über `date` zu löschen, ist es zuverlässiger, 
//       über die _id zu gehen. Das Frontend muss also `training._id` übergeben.
app.delete('/trainings/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await Training.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Training nicht gefunden' });
    }
    return res.json({ message: 'Training gelöscht' });
  } catch (err) {
    console.error(`Fehler in DELETE /trainings/${id}:`, err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// --------------------------------------------------------------------------------
// === 5) In Produktion (Render, Heroku o. Ä.) oder lokal – Server starten ===

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server läuft unter http://localhost:${PORT}`);
});
