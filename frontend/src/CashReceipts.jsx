import React, { useEffect, useState } from 'react';
const LIMIT = 10 * 1024 * 1024;
const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.')); reader.readAsDataURL(file);
});
export default function CashReceipts({ request, transactionId, readOnly = false }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(null);
  const path = `team-cash/transactions/${transactionId}/receipts`;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function call(suffix = '', options = {}) {
    const response = await request(path + suffix, { cache: 'no-store', ...options });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Beleg konnte nicht geladen werden.'); }
    return response;
  }
  async function run(action) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function upload(files) {
    run(async () => {
      for (const file of files) {
        if (!file.size || file.size > LIMIT) throw new Error(`${file.name}: höchstens 10 MB je Beleg.`);
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error(`${file.name}: Bitte als JPEG, PNG, WebP oder PDF wählen. HEIC-Fotos vorher als JPEG speichern.`);
        const data = await readFile(file);
        const saved = await (await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, data }) })).json();
        setRows(previous => [...previous.filter(row => row._id !== saved._id), saved]);
        setNotice('Beleg gespeichert. Bei einem späteren Fehler bleiben bereits hochgeladene Belege erhalten.');
      }
    });
  }
  async function fetchFile(row, download) {
    const blob = await (await call(`/${row._id}`)).blob();
    const url = URL.createObjectURL(blob);
    if (download) {
      const link = document.createElement('a'); link.href = url; link.download = row.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else setPreview({ url, name: row.name, type: row.type });
  }
  return <section className="cash-receipts">
    <button type="button" className="btn-edit" disabled={busy} onClick={() => {
      if (open) { setOpen(false); setPreview(null); return; }
      run(async () => { setRows(await (await call()).json()); setOpen(true); });
    }}>{open ? 'Belege schließen' : readOnly ? 'Belege öffnen' : 'Belege öffnen / anhängen'}</button>
    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {open && <>
      {!readOnly && <div className="receipt-upload">
        <p>Fotos oder PDFs, bis 10 MB je Datei. Höchstens zehn Belege je Buchung und 32 MB Belege insgesamt. Neue Buchung bitte zuerst speichern.</p>
        <label>Beleg fotografieren<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={event => { const files = [...event.target.files]; event.target.value = ''; upload(files); }} /></label>
        <label>Dateien anhängen<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple disabled={busy} onChange={event => { const files = [...event.target.files]; event.target.value = ''; upload(files); }} /></label>
      </div>}
      {!rows.length && <p>Noch keine Belege hinterlegt.</p>}
      <ul>{rows.map(row => <li key={row._id}>
        <span>{row.name} ({(row.size / 1024).toFixed(0)} KB)</span>
        <small>Hochgeladen von {row.createdBy} am {new Date(row.createdAt).toLocaleString('de-DE')}</small>
        <div><button type="button" className="btn-edit" disabled={busy} onClick={() => run(() => fetchFile(row, false))}>Öffnen</button><button type="button" className="btn-edit" disabled={busy} onClick={() => run(() => fetchFile(row, true))}>Herunterladen</button></div>
      </li>)}</ul>
      {preview && <div className="receipt-preview"><h3>{preview.name}</h3><button type="button" className="btn-edit" onClick={() => setPreview(null)}>Vorschau schließen</button>
        {preview.type === 'application/pdf' ? <><iframe sandbox="" src={preview.url} title={`Beleg ${preview.name}`} /><p>Keine Vorschau sichtbar? Nutze „Herunterladen“.</p></> : <img src={preview.url} alt={`Beleg ${preview.name}`} />}
      </div>}
    </>}
  </section>;
}
