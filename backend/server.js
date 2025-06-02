// ===========================================
// Datei: backend/server.js
// Beschreibung: Node/Express-Server mit Verbindung zu MongoDB Atlas über Mongoose
// Version: 1.0
// ===========================================

// 1. Module importieren
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// 2. Express-App initialisieren
const app = express();

// 3. Middleware setup
//    CORS aktivieren, damit das Frontend auf den Server zugreifen darf
app.use(cors());
//    body-parser, damit req.body bei JSON-Inhalten funktioniert
app.use(bodyParser.json());

// 4. Atlas-Connection-String (bitte VORFELDIG hier eintragen)
//    - Ersetze <db_password> durch dein tatsächliches Passwort.
//    - Füge nach dem Hostnamen direkt den Datenbanknamen ein, z.B. "/fussballDB".
//
//    Original von Atlas: 
//    mongodb+srv://matthias:<db_password>@cluster0.03d5din.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
//
//    Hier ersetzen wir "<db_password>" durch "NBpxpd74ARRV5Ln8" 
//    und fügen "/fussballDB" als DB-Namen hinzu:
const atlasConnectionString =
  "mongodb+srv://matthias:NBpxpd74ARRV5Ln8@cluster0.03d5din.mongodb.net/fussballDB?retryWrites=true&w=majority&appName=Cluster0";

// 5. Mit MongoDB Atlas verbinden
mongoose
  .connect(atlasConnectionString, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Mit MongoDB Atlas verbunden"))
  .catch((err) => console.error("❌ Verbindung zu MongoDB Atlas fehlgeschlagen:", err));

// 6. Mongoose-Schemas und -Modelle definieren
//    Beispiel: Einfache "Player"-Collection mit Feldern "name" und "isTrainer".
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isTrainer: { type: Boolean, default: false },
});
//    Sammlung "players" (Plural automatisch verwendet)
const Player = mongoose.model("Player", playerSchema);

//    Beispiel: Einfache "Training"-Collection mit Datum und Teilnehmerstatus
const trainingSchema = new mongoose.Schema({
  date: { type: String, required: true }, // z.B. "2025-06-10" oder "10.06.2025"
  participants: { type: Map, of: String, default: {} }, // Map<Name→Status>
  trainer: { type: [String], default: [] },              // Array der Trainer-Namen
});
const Training = mongoose.model("Training", trainingSchema);

// 7. Beispiel-Endpunkte (CRUD) für "players" und "trainings"

// --- Spieler (Players) ---
// GET  /players    → Alle Spieler aus der DB auslesen
app.get("/players", async (req, res) => {
  try {
    const alleSpieler = await Player.find({});
    res.json(alleSpieler);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Abrufen der Spieler" });
  }
});

// POST /players    → Liste von Spielern überschreiben oder neue hinzufügen
// Annahme: Nutzer sendet { reset: true, list: [ { name, isTrainer }, … ] }
app.post("/players", async (req, res) => {
  try {
    const { reset, list } = req.body;
    if (reset) {
      // Alte Daten löschen
      await Player.deleteMany({});
      // Neue Spieler anlegen
      await Player.insertMany(list);
      return res.json({ message: "Spieler‐Liste neu gesetzt" });
    } else {
      return res.status(400).json({ error: "Ungültige Anfrage" });
    }
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Speichern der Spieler" });
  }
});

// DELETE /players/:id  → Einzelnen Spieler anhand der _id löschen
app.delete("/players/:id", async (req, res) => {
  try {
    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: "Spieler gelöscht" });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Löschen des Spielers" });
  }
});

// --- Trainings (Trainings) ---
// GET  /trainings → Alle Trainings abrufen
app.get("/trainings", async (req, res) => {
  try {
    const alleTrainings = await Training.find({});
    res.json(alleTrainings);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Abrufen der Trainings" });
  }
});

// POST /trainings → Liste von Trainings überschreiben (mit reset:true) oder neue anlegen
app.post("/trainings", async (req, res) => {
  try {
    const { reset, list } = req.body;
    if (reset) {
      await Training.deleteMany({});
      await Training.insertMany(list);
      return res.json({ message: "Trainings‐Liste neu gesetzt" });
    } else {
      return res.status(400).json({ error: "Ungültige Anfrage" });
    }
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Speichern der Trainings" });
  }
});

// DELETE /trainings/:id → Einzelnes Training anhand der _id löschen
app.delete("/trainings/:id", async (req, res) => {
  try {
    await Training.findByIdAndDelete(req.params.id);
    res.json({ message: "Training gelöscht" });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Löschen des Trainings" });
  }
});

// 8. Einen einfachen Test‐Endpunkt anlegen, um zu prüfen, ob der Server läuft
app.get("/", (req, res) => {
  res.send("⚽ Backend ist live und MongoDB Atlas ist verbunden!");
});

// 9. Server starten auf dem Port, den Render/Vercel vorgibt, oder lokal 3001
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
