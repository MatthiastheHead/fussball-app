const test = require('node:test');
const assert = require('node:assert/strict');
const TeamCash = require('./models/TeamCash');

test('speichert Geldbeträge der Mannschaftskasse als ganze Cent', () => {
  const cash = new TeamCash({
    openingBalanceCents: 25050,
    transactions: [
      {
        date: '2026-09-07',
        person: 'Matthias',
        amountCents: 1999,
        purpose: 'Getränke',
        createdBy: 'Matthias',
      },
    ],
  });

  assert.equal(cash.validateSync(), undefined);
  assert.equal(cash.openingBalanceCents, 25050);
  assert.equal(cash.transactions[0].amountCents, 1999);
});

test('weist Ausgaben ohne positiven Betrag zurück', () => {
  const cash = new TeamCash({
    transactions: [
      {
        date: '2026-09-07',
        person: 'Matthias',
        amountCents: 0,
        purpose: 'Getränke',
        createdBy: 'Matthias',
      },
    ],
  });

  assert.ok(cash.validateSync()?.errors['transactions.0.amountCents']);
});

test('erhält Buchungsarten und behandelt Altbestand als Ausgabe', () => {
  const entry = { date: '2026-09-09', person: 'Matthias', amountCents: 501, purpose: 'Beitrag', createdBy: 'Matthias' };
  const cash = new TeamCash({ transactions: [entry, { ...entry, type: 'deposit' }] });
  assert.equal(cash.validateSync(), undefined);
  assert.equal(cash.transactions[0].type, 'expense');
  assert.equal(cash.toObject().transactions[1].type, 'deposit');
  cash.transactions[1].type = 'invalid';
  assert.ok(cash.validateSync()?.errors['transactions.1.type']);
});

const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const server = readFileSync(require.resolve('./server'), 'utf8');
const cashCode = server.slice(server.indexOf('const cleanTeamCash ='), server.indexOf('// === 6) Fallback-Route'));
function cashHarness() {
  const routes = {};
  const writes = [];
  const context = {
    app: { patch(path, access, handler) { routes[`PATCH ${path}`] = { access, handler }; }, get(path, access, handler) { routes[path] = { access, handler }; }, post(path, access, handler) { routes[path] = { access, handler }; }, delete(path, access, handler) { routes[path] = { access, handler }; } },
    mongoose: require('mongoose'),
    requireAccess: key => key,
    requireCashPermission: key => key,
    requireAdmin: 'admin',
    TeamCash: { async findOneAndUpdate(query, update) { writes.push(update); return { openingBalanceCents: 1000, transactions: [update.$push.transactions] }; } },
    console,
  };
  vm.runInNewContext(cashCode, context);
  return { routes, writes, context };
}
test('Einzahlung wird serverseitig mit Sitzungsname gebucht und erhöht den Saldo', async () => {
  const { routes, writes } = cashHarness();
  const route = routes['/team-cash/transactions'];
  assert.equal(route.access, 'teamCash');
  let result;
  const res = { status(code) { this.code = code; return this; }, json(data) { result = data; } };
  await route.handler({ auth: { username: 'Matthias' }, body: { date: '2026-09-09', type: 'deposit', amountCents: 501, purpose: 'Beitrag', person: 'Fremder' } }, res);
  assert.equal(res.code, 201);
  assert.equal(writes[0].$push.transactions.person, 'Matthias');
  assert.equal(writes[0].$push.transactions.createdBy, 'Matthias');
  assert.equal(result.balanceCents, 1501);
  assert.equal(result.depositedCents, 501);
  assert.equal(result.spentCents, 0);
});
test('ungültige Buchungsarten und Beträge erzeugen keine Buchung', async () => {
  const { routes, writes } = cashHarness();
  for (const patch of [{ type: 'invalid' }, { type: null }, { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }]) {
    const res = { status(code) { this.code = code; return this; }, json() {} };
    await routes['/team-cash/transactions'].handler({ auth: { username: 'Matthias' }, body: { date: '2026-09-09', type: 'deposit', amountCents: 501, purpose: 'Beitrag', ...patch } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(writes.length, 0);
});

test('Löschen verlangt das besondere Kassenrecht und erhält einen internen Nachweis', async () => {
  const { routes, context } = cashHarness();
  const route = routes['/team-cash/transactions/:id'];
  assert.equal(route.access, 'canDelete');
  const id = '507f1f77bcf86cd799439011';
  context.TeamCash.findOneAndUpdate = async (query, update, options) => {
    assert.equal(query.transactions.$elemMatch._id, id);
    assert.equal(query.transactions.$elemMatch.deletedAt, null);
    assert.equal(update.$set['transactions.$.deletedBy'], 'Matthias');
    assert.ok(update.$set['transactions.$.deletedAt']);
    assert.equal(options.new, true);
    assert.equal(update.$pull, undefined);
    return { openingBalanceCents: 1000, transactions: [
      { type: 'deposit', amountCents: 500, deletedAt: new Date() },
      { amountCents: 100 },
    ] };
  };
  let result;
  await route.handler({ params: { id }, auth: { username: 'Matthias' } }, { json(data) { result = data; } });
  assert.equal(result.balanceCents, 900);
  assert.equal(result.transactions.length, 1);
});

test('ungültige und bereits gelöschte Buchungen werden abgewiesen', async () => {
  const { routes, context } = cashHarness();
  let called = false;
  context.TeamCash.findOneAndUpdate = async () => { called = true; return null; };
  const res = { status(code) { this.code = code; return this; }, json() {} };
  const handler = routes['/team-cash/transactions/:id'].handler;
  await handler({ params: { id: 'invalid' }, auth: { username: 'Matthias' } }, res);
  assert.equal(res.code, 400);
  assert.equal(called, false);
  await handler({ params: { id: '507f1f77bcf86cd799439011' }, auth: { username: 'Matthias' } }, res);
  assert.equal(res.code, 404);
});

test('Admin-Middleware sperrt normale und unangemeldete Benutzer', () => {
  const context = { sessions: new Map() };
  vm.createContext(context);
  vm.runInContext(server.slice(server.indexOf('const pruneSessions ='), server.indexOf('const requireMainAdmin =')), context);
  for (const [token, session, expected] of [
    ['', null, 401], ['trainer', { isAdmin: false }, 403], ['admin', { isAdmin: true }, 200],
  ]) {
    if (session) context.sessions.set(token, { ...session, expiresAt: Date.now() + 60000 });
    context.req = { get: () => `Bearer ${token}` };
    context.res = { status(code) { this.code = code; return this; }, json() {} };
    vm.runInContext('requireAdmin(req, res, () => { res.code = 200; })', context);
    assert.equal(context.res.code, expected);
  }
});

test('gelöschte Buchungen kommen ausschließlich aus dem gesondert geschützten Endpunkt', async () => {
  const { routes, context } = cashHarness();
  context.TeamCash.findOne = () => ({ lean: async () => ({ transactions: [
    { _id: 'active', amountCents: 100 },
    { _id: 'deleted', amountCents: 500, deletedAt: '2026-09-10T12:00:00Z', deletedBy: 'Matthias' },
  ] }) });
  let result;
  const res = { json(data) { result = data; } };
  await routes['/team-cash'].handler({ auth: { username: 'Exporttrainer' } }, res);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0]._id, 'active');
  assert.equal(result.generatedBy, 'Exporttrainer');
  assert.ok(!Number.isNaN(new Date(result.generatedAt).getTime()));
  assert.equal(routes['/team-cash/deleted'].access, 'canViewDeleted');
  await routes['/team-cash/deleted'].handler({}, res);
  assert.equal(result.length, 1);
  assert.equal(result[0]._id, 'deleted');
  assert.equal(result[0].deletedBy, 'Matthias');
});


test('Bearbeiten prüft die 15-Minuten-Grenze atomar und erhält Urheber, Zeitpunkt und Belegzuordnung', async () => {
  const { routes, context } = cashHarness();
  const route = routes['PATCH /team-cash/transactions/:id'];
  assert.equal(route.access, 'teamCash');
  const id = '507f1f77bcf86cd799439011';
  const fixedNow = Date.parse('2026-09-11T12:00:00Z');
  context.Date = class extends Date { constructor(value) { super(value === undefined ? fixedNow : value); } };
  const body = { type: 'deposit', date: '2026-08-01', amountCents: 2500, purpose: ' Korrektur ', createdAt: new Date(), createdBy: 'Fake', person: 'Fake', _id: 'Fake', lastEditedBy: 'Fake' };
  for (const [age, deleted, expected] of [[0, false, 200], [899999, false, 200], [900000, false, 409], [900001, false, 409], [-1, false, 409], [1000, true, 409]]) {
    const original = { _id: id, type: 'expense', amountCents: 100, createdBy: 'Robert', person: 'Robert', createdAt: new Date(fixedNow - age), deletedAt: deleted ? new Date() : null };
    context.TeamCash.findOneAndUpdate = async (query, update, options) => {
      const match = query.transactions.$elemMatch;
      assert.equal(match._id, id);
      assert.equal(match.deletedAt, null);
      assert.equal(match.createdAt.$gt.getTime(), fixedNow - 900000);
      assert.equal(match.createdAt.$lte.getTime(), fixedNow);
      assert.equal(options.runValidators, true);
      assert.deepEqual(Object.keys(update.$set).sort(), ['amountCents', 'date', 'lastEditedAt', 'lastEditedBy', 'purpose', 'type'].map(k => `transactions.$.${k}`).sort());
      if (original.deletedAt || original.createdAt <= match.createdAt.$gt || original.createdAt > match.createdAt.$lte) return null;
      const row = { ...original };
      for (const [key, value] of Object.entries(update.$set)) row[key.split('.').at(-1)] = value;
      return { openingBalanceCents: 1000, transactions: [row] };
    };
    let result;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { result = value; } };
    await route.handler({ params: { id }, auth: { username: 'Matthias', isAdmin: true }, body }, res);
    assert.equal(res.code, expected);
    if (expected === 200) {
      assert.equal(result.balanceCents, 3500);
      const row = result.transactions[0];
      assert.equal(row._id, id);
      assert.equal(row.createdAt.getTime(), original.createdAt.getTime());
      assert.equal(row.person, 'Robert');
      assert.equal(row.createdBy, 'Robert');
      assert.equal(row.lastEditedBy, 'Matthias');
      assert.equal(row.lastEditedAt.getTime(), fixedNow);
      assert.equal(row.purpose, 'Korrektur');
      assert.equal(row.date, '2026-08-01');
    }
  }
});

test('Bearbeiten weist ungültige Daten ohne Schreibzugriff zurück', async () => {
  const { routes, context } = cashHarness();
  context.TeamCash.findOneAndUpdate = async () => assert.fail('Ungültige Eingabe darf nicht geschrieben werden');
  for (const patch of [{ date: '2026-02-30' }, { type: 'invalid' }, { amountCents: 0 }, { amountCents: 1.5 }, { amountCents: '100' }, { purpose: ' ' }, { purpose: 'x'.repeat(201) }]) {
    const res = { status(code) { this.code = code; return this; }, json() {} };
    await routes['PATCH /team-cash/transactions/:id'].handler({ params: { id: '507f1f77bcf86cd799439011' }, auth: { username: 'Matthias' }, body: { type: 'expense', date: '2026-09-11', amountCents: 100, purpose: 'Test', ...patch } }, res);
    assert.equal(res.code, 400);
  }
});
