const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReceipt, MAX_FILE } = require('./receiptUtils');
const register = require('./receiptRoutes');
const id = '111111111111111111111111', receiptId = '222222222222222222222222';
const input = { name: 'Quittung.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') };
function harness() {
  let state = { transactions: [{ _id: id }], receipts: [] };
  const routes = {};
  const query = fn => { const q = { select: () => q, session: () => q, lean: async () => fn() }; return q; };
  const TeamCash = { findOne: () => query(() => state), updateOne: async () => {} };
  const CashReceipt = {
    find: filter => query(() => state.receipts.filter(row => !filter.transactionId || row.transactionId === filter.transactionId)),
    findOne: filter => query(() => state.receipts.find(row => row._id === filter._id && row.transactionId === filter.transactionId)),
    create: async rows => { const row = { ...rows[0], _id: receiptId }; state.receipts.push(row); return [row]; },
  };
  const mongoose = { startSession: async () => ({ withTransaction: async fn => { const before = structuredClone(state); try { await fn(); } catch (err) { state = before; throw err; } }, endSession: async () => {} }) };
  const app = {};
  for (const method of ['get', 'post']) app[method] = (path, access, handler) => { routes[`${method} ${path}`] = { access, handler }; };
  register({ app, mongoose, TeamCash, CashReceipt, requireAccess: () => (req, res, next) => {
    if (!req.auth) return res.status(401).json({});
    if (req.auth.permissions?.teamCash === false) return res.status(403).json({});
    next();
  } });
  const invoke = (method, download = false, auth = { username: 'Matthias' }, body = input, transactionId = id) => new Promise(resolve => {
    const path = `/team-cash/transactions/:id/receipts${download ? '/:receiptId' : ''}`;
    const req = { auth, body, params: { id: transactionId, receiptId } };
    const res = { code: 200, headers: {}, status(code) { this.code = code; return this; }, set(key, value) { if (typeof key === 'object') Object.assign(this.headers, key); else this.headers[key] = value; }, json(data) { resolve({ code: this.code, data, headers: this.headers }); }, send(data) { this.json(data); } };
    routes[`${method} ${path}`].access(req, res, () => routes[`${method} ${path}`].handler(req, res));
  });
  return { invoke, state: () => state };
}
test('Belegupload, Metadaten und geschützter Download erhalten den Dateiinhalt', async () => {
  const { invoke } = harness();
  const uploaded = await invoke('post', false, { username: 'Robert' }, { ...input, createdBy: 'Gefälscht' });
  assert.equal(uploaded.code, 201);
  assert.equal(uploaded.data.createdBy, 'Robert');
  assert.equal(uploaded.data.data, undefined);
  await invoke('post', false, { username: 'Robert' });
  const list = await invoke('get');
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].data, undefined);
  const file = await invoke('get', true);
  assert.equal(file.data.toString('base64'), input.data);
  assert.equal(file.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(file.headers['Cache-Control'], 'no-store');
  assert.equal((await invoke('get', true, { username: 'Robert' }, {}, '333333333333333333333333')).code, 404);
});
test('Kassenrechte und Rechte auf gelöschte Buchungen gelten auch für Belege', async () => {
  const { invoke, state } = harness();
  await invoke('post');
  for (const [method, download] of [['get', false], ['post', false], ['get', true]]) {
    assert.equal((await invoke(method, download, null)).code, 401);
    assert.equal((await invoke(method, download, { username: 'Trainer', permissions: { teamCash: false } })).code, 403);
  }
  state().transactions[0].deletedAt = new Date();
  assert.equal((await invoke('get', true)).code, 404);
  const privileged = { username: 'Matthias', cashPermissions: { canViewDeleted: true } };
  assert.equal((await invoke('get', true, privileged)).code, 200);
  assert.equal((await invoke('post', false, privileged)).code, 404);
});
test('Dateiprüfung lehnt falsche Formate und Größen ab und akzeptiert die 10-MB-Grenze', () => {
  assert.throws(() => validateReceipt({ ...input, data: Buffer.from('<script>bad</script>').toString('base64') }));
  assert.throws(() => validateReceipt({ ...input, name: '../Beleg.pdf' }));
  assert.throws(() => validateReceipt({ ...input, type: 'image/jpeg' }));
  const bytes = Buffer.alloc(MAX_FILE); bytes.write('%PDF-');
  assert.equal(validateReceipt({ ...input, data: bytes.toString('base64') }).size, MAX_FILE);
  assert.throws(() => validateReceipt({ ...input, data: Buffer.concat([bytes, Buffer.from('x')]).toString('base64') }));
});
