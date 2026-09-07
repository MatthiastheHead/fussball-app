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
