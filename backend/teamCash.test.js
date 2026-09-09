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
    app: { get() {}, post(path, access, handler) { routes[path] = { access, handler }; }, delete(path, access, handler) { routes[path] = { access, handler }; } },
    mongoose: require('mongoose'),
    requireAccess: key => key,
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

test('Löschen ist nur für Admins registriert und erhält einen internen Nachweis', async () => {
  const { routes, context } = cashHarness();
  const route = routes['/team-cash/transactions/:id'];
  assert.equal(route.access, 'admin');
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
