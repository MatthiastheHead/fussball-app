import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamCashPdf, teamCashPdfFilename } from './teamCashPdf.js';
import { createTeamCashReport } from './teamCashUtils.js';

const options = { team: 'VfB Werther D-Juniorinnen', season: '2026/27', from: '2026-07-01', to: '2027-06-30' };

test('leere Kasse kann als einseitiges PDF mit passendem Dateinamen exportiert werden', () => {
  const report = createTeamCashReport({}, options);
  const doc = createTeamCashPdf(report);
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(doc.output().startsWith('%PDF-'));
  assert.equal(teamCashPdfFilename(report), 'Mannschaftskasse-VfB-Werther-D-Juniorinnen-Saison-2026-27-2026-07-01-bis-2027-06-30.pdf');
});

test('viele Buchungen mit langen Texten erzeugen mehrere PDF-Seiten', () => {
  const report = createTeamCashReport({ transactions: Array.from({ length: 65 }, (_, i) => ({
    date: '2026-09-09', type: i % 2 ? 'expense' : 'deposit', amountCents: 1050,
    person: 'Testtrainer', purpose: 'Langer Buchungstext '.repeat(10),
  })) }, options);
  const doc = createTeamCashPdf(report);
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output().includes('Mannschaftskasse'));
});
