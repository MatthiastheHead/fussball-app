const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const DATA_DIR = './data';
const PLAYERS_FILE = `${DATA_DIR}/players.json`;
const TRAININGS_FILE = `${DATA_DIR}/trainings.json`;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const readJson = (file) => {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Fehler beim Lesen von ${file}:`, err);
    return [];
  }
};

const writeJson = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Fehler beim Schreiben von ${file}:`, err);
  }
};

app.get('/players', (req, res) => {
  const players = readJson(PLAYERS_FILE);
  res.json(players);
});

app.post('/players', (req, res) => {
  if (req.body.reset) {
    writeJson(PLAYERS_FILE, req.body.list || []);
    res.json({ status: 'saved', count: req.body.list?.length || 0 });
  } else {
    res.status(400).json({ error: 'reset:true erforderlich' });
  }
});

app.get('/trainings', (req, res) => {
  const trainings = readJson(TRAININGS_FILE);
  res.json(trainings);
});

app.post('/trainings', (req, res) => {
  if (req.body.reset) {
    writeJson(TRAININGS_FILE, req.body.list || []);
    res.json({ status: 'saved', count: req.body.list?.length || 0 });
  } else {
    res.status(400).json({ error: 'reset:true erforderlich' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft unter http://localhost:${PORT}`);
});
