const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('./cashRemovalRoutes');
const id = '111111111111111111111111';
function harness() {
  let state = { transactions: [{ _id: id, deletedAt: new Date(), deletedBy: 'Master', purpose: 'Test', amountCents: 100 }], receipts: [{ transactionId: id }, { transactionId: 'other' }] };
  const routes = {}; let receiptFailure = false;
  const session = { withTransaction: async fn => { const before = structuredClone(state); try { await fn(); } catch (e) { state = before; throw e; } }, endSession: async () => {} };
  register({
    app: { get: (path, access, handler) => { routes.get = { access, handler }; }, delete: (path, access, handler) => { routes.delete = { access, handler }; } },
    requireCashPermission: permission => { assert.equal(permission, 'canDelete'); return (req, res, next) => {
      if (!req.auth) return res.status(401).json({});
      if (!req.auth.cashPermissions?.canDelete) return res.status(403).json({});
      return next();
    }; },
    mongoose: { startSession: async () => session },
    TeamCash: { findOne: () => ({ lean: async () => state }), updateOne: async (query, update, options) => {
      assert.equal(options.session, session);
      assert.deepEqual(query.transactions.$elemMatch, update.$pull.transactions);
      assert.equal(query.transactions.$elemMatch.deletedAt.$type, 'date');
      const row = state.transactions.find(t => t._id === query.transactions.$elemMatch._id && t.deletedAt instanceof Date);
      if (!row) return { modifiedCount: 0 };
      state.transactions = state.transactions.filter(t => t !== row);
      return { modifiedCount: 1 };
    } },
    CashReceipt: { deleteMany: async (query, options) => {
      assert.equal(options.session, session);
      if (receiptFailure) throw new Error('database unavailable');
      state.receipts = state.receipts.filter(r => r.transactionId !== query.transactionId);
    } },
  });
  return { state: () => state, failReceipts: () => { receiptFailure = true; }, invoke: async (method, auth = { cashPermissions: { canDelete: true } }, rowId = id) => {
    const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    const req = { auth, params: { id: rowId } };
    await routes[method].access(req, res, () => routes[method].handler(req, res));
    return res;
  } };
}
test('Endgültiges Löschen entfernt nur die gewählte gelöschte Buchung samt Belegen', async () => {
  const h = harness();
  assert.equal((await h.invoke('delete')).code, 200);
  assert.equal(h.state().transactions.length, 0);
  assert.deepEqual(h.state().receipts, [{ transactionId: 'other' }]);
  assert.equal((await h.invoke('delete')).code, 404);
});
test('Aktive Buchungen sind geschützt und Fehler beim Beleglöschen rollen alles zurück', async () => {
  const h = harness(); h.state().transactions[0].deletedAt = null;
  assert.equal((await h.invoke('delete')).code, 404);
  h.state().transactions[0].deletedAt = new Date(); h.failReceipts();
  assert.equal((await h.invoke('delete')).code, 500);
  assert.equal(h.state().transactions.length, 1);
  assert.equal(h.state().receipts.length, 2);
  assert.equal((await h.invoke('delete', undefined, 'invalid')).code, 400);
});
test('Nur Kassenadmins können auf die Bereinigung zugreifen; Liste enthält keine Löschangaben', async () => {
  const h = harness();
  for (const method of ['get', 'delete']) {
    assert.equal((await h.invoke(method, null)).code, 401);
    assert.equal((await h.invoke(method, { cashPermissions: { canViewDeleted: true } })).code, 403);
  }
  const list = await h.invoke('get');
  assert.equal(list.data[0].purpose, 'Test');
  assert.equal(list.data[0].deletedBy, undefined);
  assert.equal(list.data[0].deletedAt, undefined);
});
