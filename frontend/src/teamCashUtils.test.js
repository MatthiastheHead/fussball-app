import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTeamCashBalance,
  formatEuro,
  parseEuroToCents,
} from './teamCashUtils.js';

test('wandelt deutsche Euro-Eingaben exakt in Cent um', () => {
  assert.equal(parseEuroToCents('12,50'), 1250);
  assert.equal(parseEuroToCents('1.234,56'), 123456);
  assert.equal(parseEuroToCents('8'), 800);
});

test('weist ungültige oder negative Beträge zurück', () => {
  assert.equal(parseEuroToCents('12,345'), null);
  assert.equal(parseEuroToCents('-5'), null);
  assert.equal(parseEuroToCents('abc'), null);
});

test('berechnet den Kassenstand ohne Fließkommafehler', () => {
  assert.equal(
    calculateTeamCashBalance({
      openingBalanceCents: 10000,
      transactions: [{ amountCents: 1250 }, { amountCents: 899 }],
    }),
    7851
  );
  assert.equal(formatEuro(7851), '78,51 €');
});

test('addiert Einzahlungen und zieht neue sowie bestehende Ausgaben ab', () => {
  assert.equal(calculateTeamCashBalance({
    openingBalanceCents: 10000,
    transactions: [
      { type: 'deposit', amountCents: 2505 },
      { type: 'expense', amountCents: 1500 },
      { amountCents: 999 },
    ],
  }), 10006);
  assert.equal(calculateTeamCashBalance({ transactions: [{ type: 'deposit', amountCents: 501 }] }), 501);
});
