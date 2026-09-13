const POSITIONS = ['TW', 'LV', 'IV', 'RV', 'LWB', 'RWB', 'DM', 'ZM', 'OM', 'LM', 'RM', 'LA', 'RA', 'ST'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function settings(input) {
  const fieldPlayers = Number(input.fieldPlayers), benchSize = Number(input.benchSize);
  if (!Number.isInteger(fieldPlayers) || fieldPlayers < 2 || fieldPlayers > 10 || !Number.isInteger(benchSize) || benchSize < 0 || benchSize > 15) fail('Spielstärke oder Ersatzplätze ungültig.');
  const formation = String(input.formation || '');
  const rows = formation.split('-').map(Number);
  if (!/^\d(?:-\d){1,3}$/.test(formation) || rows.some(n => n < 1 || n > 5) || rows.reduce((a, b) => a + b, 0) !== fieldPlayers) fail('Die Formation muss zur Zahl der Feldspielerinnen passen, z. B. 3-3-2 bei 8+1.');
  return { fieldPlayers, benchSize, formation };
}
function profile(input) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) fail('Bitte einen Namen mit höchstens 100 Zeichen angeben.');
  if (!['unbekannt', 'links', 'rechts', 'beidfüßig'].includes(input.foot)) fail('Ungültiger starker Fuß.');
  if (input.mainPosition && !POSITIONS.includes(input.mainPosition)) fail('Ungültige Stammposition.');
  if (!Array.isArray(input.positions) || input.positions.some(p => !POSITIONS.includes(p))) fail('Ungültige weitere Position.');
  if (String(input.note || '').length > 1000 || String(input.club || '').length > 100) fail('Notiz oder Verein ist zu lang.');
  const number = String(input.number || '');
  if (number && !/^\d{1,2}$/.test(number)) fail('Rückennummer muss zwischen 0 und 99 liegen.');
  return { name, foot: input.foot, mainPosition: input.mainPosition || '', positions: [...new Set(input.positions)], number, note: String(input.note || '').trim(), club: String(input.club || '').trim(), inactive: input.inactive === true };
}
function captains(input, allowedIds) {
  const captainId = input.captainId || '', viceCaptainIds = input.viceCaptainIds || [];
  if (!Array.isArray(viceCaptainIds) || viceCaptainIds.length > 2) fail('Höchstens zwei Vizekapitäninnen auswählen.');
  const ids = [captainId, ...viceCaptainIds].filter(Boolean);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[pg]:[a-f\d]{24}$/i.test(id) || !allowedIds.includes(id))) fail('Kapitänin und Vizekapitäninnen müssen verschieden und verfügbar sein.');
  return { captainId, viceCaptainIds: viceCaptainIds.filter(Boolean) };
}
function game(input, candidates) {
  const fussballGameId = input.fussballGameId || '', fussballTeamId = input.fussballTeamId || '';
  if (Boolean(fussballGameId) !== Boolean(fussballTeamId) || [fussballGameId, fussballTeamId].some(id => id && (typeof id !== 'string' || !/^[A-Z0-9]{32}$/.test(id)))) fail('Ungültige FUSSBALL.DE-Spielzuordnung.');
  const config = settings(input);
  if (!validDate(input.date) || !validDate(input.from) || !validDate(input.to) || input.from > input.to || input.to > input.date) fail('Bitte einen gültigen Spieltermin und Auswertungszeitraum bis zum Spieltag wählen.');
  const opponent = String(input.opponent || '').trim(), location = String(input.location || '').trim();
  if (!opponent || opponent.length > 100 || location.length > 200 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')) fail('Bitte Gegner, Uhrzeit und Spielort prüfen.');
  if (!Array.isArray(input.lineup) || input.lineup.length > config.fieldPlayers + 1 + config.benchSize) fail('Der Kader ist zu groß.');
  const availableIds = input.availableIds === undefined ? input.lineup.map(p => p?.personId) : input.availableIds;
  if (!Array.isArray(availableIds) || availableIds.length > 1000 || new Set(availableIds).size !== availableIds.length || availableIds.some(id => typeof id !== 'string' || !/^[pg]:[a-f\d]{24}$/i.test(id) || !candidates.some(p => p.id === id && !p.inactive))) fail('Bitte gültige, aktive Spielerinnen als verfügbar auswählen.');
  const seen = new Set(); let field = 0, keepers = 0, bench = 0;
  const lineup = input.lineup.map(row => {
    if (!row || typeof row !== 'object') fail('Ungültiger Kaderplatz.');
    const candidate = candidates.find(p => p.id === row.personId);
    if (!/^[pg]:[a-f\d]{24}$/i.test(row.personId) || !availableIds.includes(row.personId) || !candidate || typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.length > 100 || candidate.guest !== row.personId.startsWith('g:') || candidate.inactive || seen.has(row.personId)) fail('Unbekannte, inaktive oder doppelte Spielerin im Kader.');
    seen.add(row.personId);
    if (!['field', 'keeper', 'bench'].includes(row.role) || (row.position && !POSITIONS.includes(row.position))) fail('Ungültige Position.');
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || row.x < 5 || row.x > 95 || row.y < 5 || row.y > 95) fail('Position liegt außerhalb des Spielfelds.');
    if (row.role === 'field') field++; else if (row.role === 'keeper') keepers++; else bench++;
    return { personId: row.personId, name: candidate.name, guest: candidate.guest, role: row.role, position: row.role === 'keeper' ? 'TW' : row.position || '', x: row.x, y: row.y };
  });
  if (field > config.fieldPlayers || keepers > 1 || bench > config.benchSize) fail('Zu viele Feldspielerinnen, Torhüterinnen oder Ersatzspielerinnen.');
  const leaders = captains(input, [...seen]);
  return { ...config, fussballGameId, fussballTeamId, opponent, location, date: input.date, time: input.time, from: input.from, to: input.to, lineup, availableIds, ...leaders };
}
module.exports = { POSITIONS, validDate, settings, profile, game, captains };
