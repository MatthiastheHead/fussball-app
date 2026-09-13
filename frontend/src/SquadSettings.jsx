import React, { useEffect, useState } from 'react';
import { POSITIONS } from './squadUtils.js';
const empty = { name: '', playerId: '', foot: 'unbekannt', mainPosition: '', positions: [], number: '', club: '', note: '', inactive: false };
export default function SquadSettings({ request }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function call(path, method, body) {
    const res = await request(path, method ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Speichern fehlgeschlagen.'); return json;
  }
  async function run(fn) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  useEffect(() => { run(async () => setData(await call('squads/admin'))); }, []);
  const edit = p => setDraft({ ...empty, ...p, id: p.guest ? p._id : undefined, playerId: p.guest ? '' : p.playerId, positions: p.positions || [] });
  return <section className="squad-settings">
    <h2>Spielkader und Gastspielerinnen</h2>
    <p>Profile ergänzen den vorhandenen Mannschaftskader. Gastspielerinnen bleiben außerhalb von Training und Teamgenerator.</p>
    {error && <p role="alert" className="login-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="btn-edit" disabled={busy} onClick={() => run(async () => { setData(await call('squads/admin')); setDraft(null); })}>Neu laden</button>
    {!data && <p>Lädt …</p>}
    {data && <>
      <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/settings', 'PUT', { ...data, fieldPlayers: Number(data.fieldPlayers), benchSize: Number(data.benchSize) })); setNotice('Voreinstellung gespeichert. Bestehende Spiele behalten ihre Aufstellung.'); }); }}>
        <label>Feldspielerinnen<input type="number" min="2" max="10" required value={data.fieldPlayers} disabled={busy} onChange={e => setData({ ...data, fieldPlayers: e.target.value })} /></label>
        <label>Ersatzplätze<input type="number" min="0" max="15" required value={data.benchSize} disabled={busy} onChange={e => setData({ ...data, benchSize: e.target.value })} /></label>
        <label>Formation<input required value={data.formation} disabled={busy} placeholder="3-3-2" onChange={e => setData({ ...data, formation: e.target.value })} /></label>
        <p>Zusätzlich eine Torhüterin. Formation von Abwehr bis Angriff, z. B. 3-3-2 bei 8+1. Die Summe muss stimmen.</p>
        <button className="btn-save-players" disabled={busy}>Voreinstellung speichern</button>
      </form>
      <button className="btn-save-players" disabled={busy} onClick={() => setDraft({ ...empty })}>Gastspielerin anlegen</button>
      {draft && <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/profiles', 'POST', { ...draft, version: data.version })); setDraft(null); setNotice('Profil gespeichert.'); }); }}>
        <h3>{draft.playerId ? 'Spielerinnenprofil' : 'Gastspielerin'}</h3>
        <label>Name<input required maxLength={100} value={draft.name} disabled={busy || !!draft.playerId} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Starker Fuß<select value={draft.foot} disabled={busy} onChange={e => setDraft({ ...draft, foot: e.target.value })}>{['unbekannt', 'links', 'rechts', 'beidfüßig'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Stammposition<select value={draft.mainPosition} disabled={busy} onChange={e => setDraft({ ...draft, mainPosition: e.target.value })}><option value="">Noch offen</option>{Object.entries(POSITIONS).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label>
        <fieldset><legend>Weitere Positionen</legend><div className="squad-position-options">{Object.entries(POSITIONS).map(([id, name]) => <label key={id}><input type="checkbox" checked={draft.positions.includes(id)} disabled={busy} onChange={e => setDraft({ ...draft, positions: e.target.checked ? [...draft.positions, id] : draft.positions.filter(p => p !== id) })} />{id} · {name}</label>)}</div></fieldset>
        <label>Rückennummer<input inputMode="numeric" maxLength={2} value={draft.number} disabled={busy} onChange={e => setDraft({ ...draft, number: e.target.value })} /></label>
        <label>Verein<input maxLength={100} value={draft.club} disabled={busy} onChange={e => setDraft({ ...draft, club: e.target.value })} /></label>
        <label>Notizen<textarea maxLength={1000} value={draft.note} disabled={busy} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
        {!draft.playerId && <label><input type="checkbox" checked={draft.inactive} disabled={busy} onChange={e => setDraft({ ...draft, inactive: e.target.checked })} />Gastspielerin inaktiv</label>}
        <div className="task-toolbar"><button className="btn-save-players" disabled={busy}>Profil speichern</button><button type="button" className="btn-edit" disabled={busy} onClick={() => setDraft(null)}>Abbrechen</button></div>
      </form>}
      {['Mannschaft', 'Gastspielerinnen'].map((title, index) => <section className="cash-entry-section" key={title}><h3>{title}</h3><ul className="squad-profile-list">{data.candidates.filter(p => p.guest === Boolean(index)).map(p => <li key={p.id}><span><strong>{p.name}</strong><small>{p.mainPosition || 'Position offen'} · {p.foot || 'Fuß unbekannt'}{p.inactive ? ' · Inaktiv' : ''}</small></span><button className="btn-edit" disabled={busy} onClick={() => edit(p)}>Bearbeiten</button></li>)}</ul></section>)}
    </>}
  </section>;
}
