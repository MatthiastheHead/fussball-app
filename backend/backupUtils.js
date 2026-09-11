const { createHash } = require('crypto');
const FORMAT = 'fussball-app-backup';
const KEYS = ['players', 'trainings', 'checklists', 'settings', 'teamCash', 'tasks'];
const LIMIT = 8 * 1024 * 1024;
const labels = { players: 'Spielerinnen und Trainer', trainings: 'Trainings', checklists: 'Checklisten', settings: 'Einstellungen', teamCash: 'Mannschaftskasse', tasks: 'Aufgaben' };
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const digest = value => createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex');
const snapshotHash = data => digest(Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)))])));

function scopeFor(auth, importing = false) {
  const allowed = key => auth.isAdmin || auth.permissions?.[key] !== false;
  return KEYS.filter(key => {
    if (key === 'players' || key === 'settings') return !importing || auth.isAdmin;
    if (key === 'trainings') return allowed('training');
    if (key === 'checklists') return allowed('checklists');
    if (key === 'tasks') return allowed('tasks');
    return allowed('teamCash') && (!importing || auth.isAdmin || auth.cashPermissions?.canDelete === true);
  });
}

function makeBackup(raw, auth, version) {
  const data = JSON.parse(JSON.stringify(raw));
  if (!auth.cashPermissions?.canViewDeleted && data.teamCash) {
    for (const cash of data.teamCash) cash.transactions = (cash.transactions || []).filter(t => !t.deletedAt);
  }
  const backup = {
    format: FORMAT, schemaVersion: 1, appVersion: version,
    exportedAt: new Date().toISOString(), exportedBy: auth.username,
    includesDeletedCash: !!auth.cashPermissions?.canViewDeleted,
    data, checksum: digest(data),
  };
  if (Buffer.byteLength(JSON.stringify(backup, null, 2)) > LIMIT) fail('Die Sicherung ist größer als 8 MB. Bitte weniger Bereiche auswählen.');
  return backup;
}

function validateBackup(backup, selected, auth, models) {
  if (!backup || backup.format !== FORMAT || backup.schemaVersion !== 1) fail('Keine unterstützte Fußball-App-Sicherung (Formatversion 1).');
  if (Buffer.byteLength(JSON.stringify(backup)) > LIMIT) fail('Die Sicherungsdatei darf höchstens 8 MB groß sein.');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) fail('Die Sicherung enthält keine gültigen Daten.');
  if (Object.keys(backup.data).some(key => !KEYS.includes(key))) fail('Die Sicherung enthält unbekannte Bereiche.');
  if (backup.checksum !== digest(backup.data)) fail('Die Prüfsumme stimmt nicht. Die Sicherung ist beschädigt oder wurde verändert.');
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) fail('Bitte Bereiche für den Import auswählen.');
  const permitted = scopeFor(auth, true);
  const data = {};
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$') || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Die Sicherung enthält unzulässige Datenfelder.');
      inspect(item);
    }
  };
  for (const key of selected) {
    if (!KEYS.includes(key) || !permitted.includes(key)) throw Object.assign(new Error('Für einen ausgewählten Bereich fehlt dir die Importberechtigung.'), { status: 403 });
    const rows = backup.data[key];
    if (!Array.isArray(rows) || rows.length > 20000) fail(`Ungültige Daten in ${labels[key]}.`);
    if (['settings', 'teamCash'].includes(key) && rows.length > 1) fail('Einstellungen und Kasse dürfen jeweils nur einen Datensatz enthalten.');
    const ids = new Set();
    const unique = new Set();
    data[key] = rows.map(row => {
      if (!row || Array.isArray(row) || typeof row !== 'object') fail(`Ungültiger Datensatz in ${labels[key]}.`);
      inspect(row);
      if (!/^[a-f\d]{24}$/i.test(row._id || '') || ids.has(String(row._id))) fail(`Fehlende oder doppelte Datensatz-ID in ${labels[key]}.`);
      ids.add(String(row._id));
      const field = key === 'players' ? 'name' : key === 'trainings' ? 'date' : null;
      if (field) {
        const value = String(row[field] || '').trim();
        if (!value || unique.has(value)) fail(`Leere oder doppelte ${field === 'name' ? 'Namen' : 'Trainingsdaten'}.`);
        unique.add(value);
      }
      const maps = key === 'trainings' ? ['participants', 'ratings', 'trainerStatus', 'playerNotes', 'inactiveReasons'] : key === 'checklists' ? ['items', 'remarks'] : [];
      for (const map of maps) if (row[map] !== undefined && (!row[map] || typeof row[map] !== 'object' || Array.isArray(row[map]))) fail(`Ungültige Zuordnung in ${labels[key]}.`);
      if (key === 'trainings') {
        const match = String(row.date).match(/(\d{2})\.(\d{2})\.(\d{4})$/);
        const iso = match && `${match[3]}-${match[2]}-${match[1]}`;
        const date = new Date(`${iso}T00:00:00Z`);
        if (!iso || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) fail('Ungültiges Trainingsdatum.');
        if (Object.values(row.ratings || {}).some(value => !Number.isInteger(value) || value < 0 || value > 3)) fail('Ungültige Trainingsbewertung.');
      }
      if (key === 'settings' && row.key !== 'app') fail('Ungültiger Einstellungsschlüssel.');
      if (key === 'teamCash') {
        if (row.key !== 'team-cash' || !Number.isSafeInteger(row.openingBalanceCents) || row.openingBalanceCents < 0 || row.openingBalanceCents > 100_000_000) fail('Ungültiger Kassenstartbestand.');
        if (!Array.isArray(row.transactions)) fail('Ungültige Kassenbuchungen.');
        const transactionIds = new Set();
        for (const t of row.transactions) {
          if (!t || !/^[a-f\d]{24}$/i.test(t._id || '') || transactionIds.has(t._id)) fail('Fehlende oder doppelte Buchungs-ID.');
          transactionIds.add(t._id);
          if (t.deletedAt && !auth.cashPermissions?.canViewDeleted) throw Object.assign(new Error('Diese Kasse enthält gelöschte Buchungen. Dafür fehlt dir die Berechtigung.'), { status: 403 });
          const date = new Date(`${t.date}T00:00:00Z`);
          if (!Number.isSafeInteger(t.amountCents) || t.amountCents < 1 || t.amountCents > 100_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== t.date) fail('Ungültiges Datum oder Betrag einer Kassenbuchung.');
        }
      }
      try {
        const doc = new models[key](row, undefined, { strict: 'throw' });
        const error = doc.validateSync();
        if (error) fail(`Ungültiger Datensatz in ${labels[key]}.`);
        return doc.toObject();
      } catch { fail(`Ungültiger Datensatz in ${labels[key]}.`); }
    });
  }
  return data;
}

function prepareCashImport(imported, current, auth) {
  const previous = current?.[0];
  const next = imported?.[0];
  if (!auth.isAdmin && (next?.openingBalanceCents || 0) !== (previous?.openingBalanceCents || 0)) {
    throw Object.assign(new Error('Nur allgemeine Admins dürfen einen abweichenden Kassenstartbestand importieren.'), { status: 403 });
  }
  const deleted = (previous?.transactions || []).filter(t => t.deletedAt);
  if (!next && !deleted.length) return [];
  const cash = next || { ...previous, transactions: [], openingBalanceCents: 0 };
  const preservedIds = new Set(deleted.map(t => String(t._id)));
  return [{ ...cash, transactions: [...(cash.transactions || []).filter(t => !preservedIds.has(String(t._id))), ...deleted] }];
}

module.exports = { FORMAT, KEYS, LIMIT, labels, digest, snapshotHash, scopeFor, makeBackup, validateBackup, prepareCashImport };
