import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateCashFiles } from './cashReceiptUpload.js';

const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  const addCashTransaction ='), source.indexOf('  const loadDeletedCash ='));

test('Uploadfehler lässt gespeicherte Buchung stehen; Wiederholung lädt nur fehlende Belege', async () => {
  const first = { name: 'eins.pdf', type: 'application/pdf', size: 100 };
  const second = { ...first, name: 'zwei.pdf' };
  let posts = 0, fail = true;
  const uploaded = [];
  const ctx = {
    pendingCashId: null, cashFiles: [first, second],
    cashEntry: { amount: '10,00', date: '2026-09-12', type: 'expense', purpose: 'Test' },
    runOnce: fn => fn(), parseEuroToCents: () => 1000, validateCashFiles,
    setCashError: value => { ctx.error = value; },
    setPendingCashId: value => { ctx.pendingCashId = value; },
    setCashFiles: fn => { ctx.cashFiles = fn(ctx.cashFiles); },
    setCashEntry: fn => { ctx.cashEntry = fn(ctx.cashEntry); },
    setCashPanel: value => { ctx.panel = value; }, setCashNotice() {}, applyTeamCashResponse() {},
    authenticatedRequest: async () => { posts++; return { ok: true, json: async () => ({ createdTransactionId: 'saved-id', transactions: [] }) }; },
    uploadCashReceipt: async (_request, id, file) => {
      assert.equal(id, 'saved-id');
      if (file === second && fail) throw new Error('Upload fehlgeschlagen');
      uploaded.push(file.name);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.save = addCashTransaction;', ctx);
  assert.equal(await ctx.save(), false);
  assert.equal(posts, 1);
  assert.equal(ctx.pendingCashId, 'saved-id');
  assert.deepEqual(ctx.cashFiles, [second]);
  assert.match(ctx.error, /bleiben erhalten/);
  fail = false;
  assert.equal(await ctx.save(), true);
  assert.equal(posts, 1);
  assert.deepEqual(uploaded, ['eins.pdf', 'zwei.pdf']);
  assert.equal(ctx.pendingCashId, null);
  assert.equal(ctx.panel, null);
});

test('Dateiauswahl weist unzulässige Belege vor dem Buchen ab', () => {
  const valid = { name: 'foto.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 };
  assert.doesNotThrow(() => validateCashFiles([valid]));
  for (const files of [[{ ...valid, size: 0 }], [{ ...valid, size: valid.size + 1 }], [{ ...valid, type: 'image/heic' }], Array(11).fill(valid)]) {
    assert.throws(() => validateCashFiles(files));
  }
});
