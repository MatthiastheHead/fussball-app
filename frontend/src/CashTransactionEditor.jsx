import React, { useEffect, useState } from 'react';
import { parseEuroToCents } from './teamCashUtils.js';

export default function CashTransactionEditor({ transaction, request, onSaved, disabled }) {
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const created = new Date(transaction.createdAt).getTime();
  const expires = created + 15 * 60 * 1000;
  const editable = Boolean(transaction._id && !transaction.deletedAt && created <= now && now < expires);
  useEffect(() => {
    if (!editable) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [editable]);
  async function save(event) {
    event.preventDefault();
    if (saving || disabled) return;
    if (Date.now() >= expires) { setNow(Date.now()); return; }
    const amountCents = parseEuroToCents(draft.amount);
    if (!amountCents || amountCents > 100_000_000) { setError('Bitte einen gültigen positiven Betrag eingeben.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await request(`team-cash/transactions/${transaction._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: draft.date, type: draft.type, purpose: draft.purpose, amountCents }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Die Buchung konnte nicht geändert werden.');
      onSaved(data); setDraft(null); setNotice('Buchung geändert.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); setNow(Date.now()); }
  }
  return <section className="cash-transaction-editor">
    {editable && !draft && <button type="button" className="btn-edit" disabled={disabled} onClick={() => {
      setNow(Date.now()); setError(''); setNotice('');
      setDraft({ date: transaction.date, type: transaction.type || 'expense', amount: (transaction.amountCents / 100).toFixed(2).replace('.', ','), purpose: transaction.purpose });
    }}>Buchung bearbeiten</button>}
    {editable && <small>Noch {Math.ceil((expires - now) / 60000)} Min. bearbeitbar (15 Minuten ab Erstellung).</small>}
    {draft && <form className="cash-entry-form" onSubmit={save}>
      <label>Datum<input type="date" required value={draft.date} disabled={saving || !editable} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label>Buchungsart<select value={draft.type} disabled={saving || !editable} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="deposit">Einzahlung</option><option value="expense">Ausgabe</option></select></label>
      <label>Betrag (€)<input inputMode="decimal" required value={draft.amount} disabled={saving || !editable} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></label>
      <label>Verwendungszweck<input required maxLength={200} value={draft.purpose} disabled={saving || !editable} onChange={e => setDraft({ ...draft, purpose: e.target.value })} /></label>
      {!editable && <p role="alert">Die Bearbeitungsfrist von 15 Minuten ist abgelaufen.</p>}
      <button className="btn-edit" type="submit" disabled={saving || disabled || !editable}>{saving ? 'Speichert …' : 'Änderungen speichern'}</button>
      <button className="btn-edit" type="button" disabled={saving} onClick={() => { setDraft(null); setError(''); }}>Abbrechen</button>
    </form>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
