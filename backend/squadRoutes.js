const { settings, profile, game, validDate, captains } = require('./squadUtils');
const { teamUrl, fetchGames } = require('./fussballSource');
module.exports = function registerSquadRoutes({ app, Squad, Player, Training, requireAccess, requireAdmin }) {
  const access = requireAccess('squads');
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status((e.name === 'VersionError' || e.code === 11000) ? 409 : e.status || 500).json({ error: (e.name === 'VersionError' || e.code === 11000) ? 'Der Spielkader wurde inzwischen geändert. Bitte neu laden.' : e.status ? e.message : 'Spielkader konnte nicht gespeichert oder geladen werden.' }); } };
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  async function read() { return await Squad.findOne({ key: 'squads' }) || new Squad({ key: 'squads' }); }
  async function candidates(doc) {
    const players = await Player.find({ isTrainer: { $ne: true } }).lean();
    return [...players.map(p => {
      const info = doc.profiles.find(row => row.playerId === String(p._id));
      return { ...(info?.toObject() || {}), id: `p:${p._id}`, playerId: String(p._id), name: p.name, guest: info?.guest === true, inactive: p.inactive === true };
    }), ...doc.profiles.filter(p => !p.playerId).map(p => ({ ...p.toObject(), id: `g:${p._id}`, guest: true, legacyGuest: true }))];
  }
  async function output(doc) { return { version: doc.__v || 0, fussballTeamUrl: doc.fussballTeamUrl, fieldPlayers: doc.fieldPlayers, benchSize: doc.benchSize, formation: doc.formation, captainId: doc.captainId, viceCaptainIds: doc.viceCaptainIds, candidates: await candidates(doc), games: doc.games }; }
  function checkVersion(req, doc) { if (req.body?.version !== (doc.__v || 0)) fail('Der Bereich wurde inzwischen geändert. Bitte neu laden.', 409); }
  function removePersonFromUpcomingGames(doc, personId) {
    const today = new Date().toISOString().slice(0, 10);
    for (const row of doc.games) {
      if (!row.date || row.date < today) continue;
      if (Array.isArray(row.availableIds)) row.availableIds = row.availableIds.filter(id => id !== personId);
      if (Array.isArray(row.lineup)) row.lineup = row.lineup.filter(item => item.personId !== personId);
      if (row.captainId === personId) row.captainId = '';
      if (Array.isArray(row.viceCaptainIds)) row.viceCaptainIds = row.viceCaptainIds.filter(id => id !== personId);
    }
  }
  app.get('/squads', access, wrap(async (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(await output(await read())); }));
  app.get('/squads/admin', requireAdmin, wrap(async (_req, res) => res.json(await output(await read()))));
  app.put('/squads/source', requireAdmin, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc); doc.fussballTeamUrl = teamUrl(req.body.fussballTeamUrl); await doc.save(); res.json(await output(doc));
  }));
  app.get('/squads/fixtures', access, wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fetchGames((await read()).fussballTeamUrl)); }
    catch (error) { fail(error.status ? error.message : 'Der Spielabruf ist gerade nicht möglich. Bitte später erneut versuchen.', 502); }
  }));
  app.put('/squads/settings', requireAdmin, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc); Object.assign(doc, settings(req.body), captains(req.body, (await candidates(doc)).filter(p => !p.inactive).map(p => p.id))); await doc.save(); res.json(await output(doc));
  }));
  app.post('/squads/profiles', requireAdmin, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc);
    let playerId = String(req.body.playerId || '');
    if (playerId && !/^[a-f\d]{24}$/i.test(playerId)) fail('Ungültige Spielerin.');
    let player = playerId ? await Player.findOne({ _id: playerId, isTrainer: { $ne: true } }) : null;
    if (playerId && !player) fail('Spielerin nicht gefunden.');
    const fields = profile(req.body);
    if (!playerId) {
      const duplicate = await Player.findOne({ name: fields.name, isTrainer: { $ne: true } });
      if (duplicate) fail('Eine Spielerin mit diesem Namen besteht bereits.');
      player = await Player.create({ name: fields.name, inactive: fields.inactive === true });
      playerId = String(player._id);
    }
    let row = doc.profiles.find(p => p.playerId === playerId);
    const guest = row?.guest === true || !req.body.playerId;
    if (guest) {
      player.name = fields.name;
      player.inactive = fields.inactive === true;
      await player.save();
    }
    if (row) Object.assign(row, fields, { guest }); else doc.profiles.push({ ...fields, playerId, guest });
    await doc.save(); res.json(await output(doc));
  }));
  app.delete('/squads/people/:personId', requireAdmin, wrap(async (req, res) => {
    const personId = String(req.params.personId || '');
    if (!/^[pg]:[a-f\d]{24}$/i.test(personId)) fail('Ungültiges Kader-Mitglied.');
    const doc = await read();
    if (personId.startsWith('p:')) {
      const playerId = personId.slice(2);
      const player = await Player.findById(playerId);
      if (!player) fail('Kader-Mitglied nicht gefunden.', 404);
      doc.profiles = doc.profiles.filter(p => p.playerId !== playerId);
      if (doc.captainId === personId) doc.captainId = '';
      doc.viceCaptainIds = (doc.viceCaptainIds || []).filter(id => id !== personId);
      removePersonFromUpcomingGames(doc, personId);
      await doc.save();
      await Player.deleteOne({ _id: playerId });
      return res.json(await output(doc));
    }
    const profileId = personId.slice(2);
    const legacy = doc.profiles.find(p => !p.playerId && String(p._id) === profileId);
    if (!legacy) fail('Gastspielerin nicht gefunden.', 404);
    doc.profiles = doc.profiles.filter(p => String(p._id) !== profileId);
    if (doc.captainId === personId) doc.captainId = '';
    doc.viceCaptainIds = (doc.viceCaptainIds || []).filter(id => id !== personId);
    removePersonFromUpcomingGames(doc, personId);
    await doc.save();
    res.json(await output(doc));
  }));
  app.delete('/squads/guests/:playerId', requireAdmin, wrap(async (req, res) => {
    const playerId = String(req.params.playerId || '');
    if (!/^[a-f\d]{24}$/i.test(playerId)) fail('Ungültige Gastspielerin.');
    const doc = await read();
    const row = doc.profiles.find(p => p.playerId === playerId && p.guest === true);
    if (!row) fail('Gastspielerin nicht gefunden.', 404);
    const personId = `p:${playerId}`;
    doc.profiles = doc.profiles.filter(p => p.playerId !== playerId);
    if (doc.captainId === personId) doc.captainId = '';
    doc.viceCaptainIds = (doc.viceCaptainIds || []).filter(id => id !== personId);
    removePersonFromUpcomingGames(doc, personId);
    await doc.save();
    await Player.deleteOne({ _id: playerId, isTrainer: { $ne: true } });
    res.json(await output(doc));
  }));
  app.post('/squads/games', access, wrap(async (req, res) => {
    const doc = await read(); checkVersion(req, doc);
    const row = req.body.id ? doc.games.id(req.body.id) : null;
    if (req.body.id && !row) fail('Spiel nicht gefunden.', 404);
    const fields = game(req.body, await candidates(doc)); const now = new Date();
    if (fields.fussballGameId && doc.games.some(g => g.fussballGameId === fields.fussballGameId && g.fussballTeamId === fields.fussballTeamId && String(g._id) !== String(row?._id))) fail('Dieses FUSSBALL.DE-Spiel ist bereits angelegt.', 409);
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
      for (const t of rows) {
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
