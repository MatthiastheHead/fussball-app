import { formatTrainingDate, seasonDateRange } from './trainingUtils.js';

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

export function parseEuroToCents(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return null;

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [euros, cents = ''] = normalized.split('.');
  const result = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

export function formatEuro(cents) {
  const safeCents = Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : 0;
  return euroFormatter.format(safeCents / 100);
}

export function calculateTeamCashBalance(teamCash) {
  const openingBalanceCents = Number(teamCash?.openingBalanceCents) || 0;
  const spentCents = (teamCash?.transactions || []).filter(transaction => !transaction.deletedAt).reduce(
    (sum, transaction) => sum + (transaction?.type === 'deposit' ? -1 : 1) * (Number(transaction?.amountCents) || 0),
    0
  );
  return openingBalanceCents - spentCents;
}

export function createTeamCashReport(teamCash, { season, team, from, to, generatedAt, generatedBy }) {
  const range = seasonDateRange(season);
  if (!range.from) throw new Error('Bitte eine gültige Saison auswählen.');
  const teamName = String(team || '').trim();
  if (!teamName || teamName.length > 100) throw new Error('Bitte einen Mannschaftsnamen mit höchstens 100 Zeichen eintragen.');
  if (!formatTrainingDate(from) || !formatTrainingDate(to) || from > to) {
    throw new Error('Bitte einen gültigen Zeitraum von/bis auswählen.');
  }
  if (from < range.from || to > range.to) {
    throw new Error('Der Zeitraum muss innerhalb der ausgewählten Saison liegen.');
  }
  const active = (teamCash?.transactions || []).filter(transaction => !transaction.deletedAt);
  const transactions = active.filter(transaction => transaction.date >= from && transaction.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const openingCents = calculateTeamCashBalance({
    openingBalanceCents: teamCash?.openingBalanceCents,
    transactions: active.filter(transaction => transaction.date < from),
  });
  const depositedCents = transactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amountCents, 0);
  const spentCents = transactions.filter(t => t.type !== 'deposit').reduce((sum, t) => sum + t.amountCents, 0);
  return {
    season, team: teamName, from, to, transactions, openingCents, depositedCents, spentCents,
    generatedAt, generatedBy,
    closingCents: openingCents + depositedCents - spentCents,
  };
}
