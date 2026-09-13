const { settings, profile, game, validDate } = require('./squadUtils');
module.exports = function registerSquadRoutes({ app, Squad, Player, Training, requireAccess, requireAdmin }) {
  const access = requireAccess('squads');
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status((e.name === 'VersionError' || e.code === 11000) ? 409 : e.status || 500).json({ error: (e.name === 'VersionError' || e.code === 11000) ? 'Der Spielkader wurde inzwischen geändert. Bitte neu laden.' : e.status ? e.message : 'Spielkader konnte nicht gespeichert oder geladen werden.' }); } };
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  async function read() { return await Squad.findOne({ key: 'squads' }) || new Squad({ key: 'squads' }); }
  async function candidates(doc) {
    const players = await Player.find({ isTrainer: { $ne: true } }).lean();
    return [...players.map(p => {
      const info = doc.profiles.find(row => row.playerId === String(p._id));
      return { ...(info?.toObject() || {}), id: `p:${p._id}`, playerId: String(p._id), name: p.name, guest: false, inactive: p.inactive === true };
    }), ...doc.profiles.filter(p => !p.playerId).map(p => ({ ...p.toObject(), id: `g:${p._id}`, guest: true }))];
  }
  async function output(doc) { return { version: doc.__v || 0, fieldPlayers: doc.fieldPlayers, benchSize: doc.benchSize, formation: doc.formation, candidates: await candidates(doc), games: doc.games }; }
  function checkVersion(req, doc) { if (req.body?.version !== (doc.__v || 0)) fail('Der Bereich wurde inzwischen geändert. Bitte neu laden.', 409); }
  app.get('/squads', access, wrap(async (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(await output(await read())); }));
  app.get('/squads/admin', requireAdmin, wrap(async (_req, res) => res.json(await output(await read()))));
  app.put('/squads/settings', requireAdmin, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc); Object.assign(doc, settings(req.body)); await doc.save(); res.json(await output(doc));
  }));
  app.post('/squads/profiles', requireAdmin, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc);
    const playerId = String(req.body.playerId || '');
    if (playerId && !/^[a-f\d]{24}$/i.test(playerId)) fail('Ungültige Spielerin.');
    if (playerId && !await Player.exists({ _id: playerId, isTrainer: { $ne: true } })) fail('Spielerin nicht gefunden.');
    let row = playerId ? doc.profiles.find(p => p.playerId === playerId) : req.body.id ? doc.profiles.id(req.body.id) : null;
    if (req.body.id && (!row || row.playerId)) fail('Gastspielerin nicht gefunden.');
    const fields = profile(req.body);
    if (!playerId && doc.profiles.some(p => !p.playerId && String(p._id) !== String(row?._id) && p.name.toLocaleLowerCase('de') === fields.name.toLocaleLowerCase('de'))) fail('Eine Gastspielerin mit diesem Namen besteht bereits.');
    if (row) Object.assign(row, fields); else doc.profiles.push({ ...fields, playerId });
    await doc.save(); res.json(await output(doc));
  }));
  app.post('/squads/games', access, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc);
    const row = req.body.id ? doc.games.id(req.body.id) : null;
    if (req.body.id && !row) fail('Spiel nicht gefunden.', 404);
    const fields = game(req.body, await candidates(doc)); const now = new Date();
    if (row) Object.assign(row, fields, { updatedBy: req.auth.username, updatedAt: now });
    else doc.games.push({ ...fields, createdBy: req.auth.username, createdAt: now, updatedBy: req.auth.username, updatedAt: now });
    await doc.save(); res.json(await output(doc));
  }));
  app.get('/squads/statistics', access, wrap(async (req, res) => {
    const { from, to } = req.query;
    if (!validDate(from) || !validDate(to) || from > to) fail('Ungültiger Auswertungszeitraum.');
    const doc = await read(), people = await candidates(doc), trainings = await Training.find({}).lean();
    const rows = trainings.filter(t => { const m = t.date?.match(/(\d{2})\.(\d{2})\.(\d{4})$/); const date = m ? `${m[3]}-${m[2]}-${m[1]}` : ''; return date && date >= from && date <= to; });
    const stats = people.map(p => {
      let total = 0, attended = 0, rated = 0, stars = 0;
      if (!p.guest) for (const t of rows) {
        const name = p.name;
        if (![t.participants, t.ratings, t.inactiveReasons].some(map => Object.hasOwn(map || {}, name)) || String(t.inactiveReasons?.[name] || '').trim()) continue;
        total++;
        if (t.participants?.[name] === '✅') { attended++; const rating = t.ratings?.[name]; if (Number.isInteger(rating) && rating >= 0 && rating <= 3) { stars += rating; rated++; } }
      }
      return { id: p.id, total, attended, rated, average: rated ? stars / rated : null, attendance: total ? attended / total : null };
    });
    res.json(stats);
  }));
};
