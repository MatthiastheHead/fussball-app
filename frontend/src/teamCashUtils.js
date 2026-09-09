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
  const spentCents = (teamCash?.transactions || []).reduce(
    (sum, transaction) => sum + (transaction?.type === 'deposit' ? -1 : 1) * (Number(transaction?.amountCents) || 0),
    0
  );
  return openingBalanceCents - spentCents;
}
