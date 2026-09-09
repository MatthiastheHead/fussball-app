import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTeamCashBalance,
  createTeamCashReport,
  formatEuro,
  parseEuroToCents,
} from './teamCashUtils.js';

test('wandelt deutsche Euro-Eingaben exakt in Cent um', () => {
  assert.equal(parseEuroToCents('12,50'), 1250);
  assert.equal(parseEuroToCents('1.234,56'), 123456);
  assert.equal(parseEuroToCents('8'), 800);
});

test('PDF-Bericht filtert inklusive Datumsgrenzen und berechnet Übertrag', () => {
  const cash = { openingBalanceCents: 1000, transactions: [
    { date: '2026-06-30', type: 'deposit', amountCents: 500 },
    { date: '2026-07-01', amountCents: 200 },
    { date: '2026-07-31', type: 'deposit', amountCents: 300 },
    { date: '2026-08-01', amountCents: 50 },
    { date: '2026-07-15', amountCents: 999, deletedAt: '2026-07-16' },
  ] };
  const report = createTeamCashReport(cash, { team: ' D-Juniorinnen ', season: '2026/27', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(report.team, 'D-Juniorinnen');
  assert.equal(report.transactions.length, 2);
  assert.equal(report.openingCents, 1500);
  assert.equal(report.closingCents, 1600);
  assert.equal(report.spentCents, 200);
  assert.equal(report.depositedCents, 300);
  assert.equal(calculateTeamCashBalance(cash), 1550);
  assert.equal(cash.transactions.length, 5);
});

test('PDF-Bericht validiert Mannschaft, Saison und Zeitraum', () => {
  const valid = { team: 'Team', season: '2026/27', from: '2026-07-01', to: '2027-06-30' };
  for (const patch of [{ team: '' }, { season: '2026/28' }, { from: '2026-06-30' }, { to: '2027-07-01' }, { from: '2027-02-30' }, { from: '2026-09-10', to: '2026-09-01' }]) {
    assert.throws(() => createTeamCashReport({}, { ...valid, ...patch }));
  }
  const empty = createTeamCashReport({}, valid);
  assert.equal(empty.transactions.length, 0);
  assert.equal(empty.closingCents, 0);
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
