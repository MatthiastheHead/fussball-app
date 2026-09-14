import React, { useEffect, useState } from 'react';
import SquadConfigFields from './SquadConfigFields.jsx';
import { POSITIONS } from './squadUtils.js';
const empty = { name: '', playerId: '', foot: 'unbekannt', mainPosition: '', positions: [], number: '', club: '', note: '', inactive: false };
export default function SquadSettings({ request, onProfileSaved }) {
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
      <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/source', 'PUT', { fussballTeamUrl: data.fussballTeamUrl || '', version: data.version })); setNotice('Mannschaftslink gespeichert. Vorhandene Spiele bleiben unverändert.'); }); }}>
        <h3>Spieltermine von FUSSBALL.DE</h3>
        <label className="squad-wide">Mannschaftslink<input type="url" maxLength={600} disabled={busy} value={data.fussballTeamUrl || ''} onChange={e => setData({ ...data, fussballTeamUrl: e.target.value })} placeholder="https://www.fussball.de/mannschaft/…" /></label>
        <p>Du kannst hier eine andere Mannschaft oder Saison hinterlegen. Ein leerer Link deaktiviert den Abruf. Deine Spielerinnen und bisherigen Spielkader werden dadurch nicht geändert.</p>
        <button className="btn-save-players" disabled={busy}>Mannschaftslink speichern</button>
      </form>
      <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/settings', 'PUT', { ...data, fieldPlayers: Number(data.fieldPlayers), benchSize: Number(data.benchSize) })); setNotice('Voreinstellung gespeichert. Bestehende Spiele behalten ihre Aufstellung.'); }); }}>
        <SquadConfigFields value={data} disabled={busy} onChange={values => setData({ ...data, ...values })} />
        <p>Der Spielmodus enthält eine Torhüterin. Die Vorgaben lassen sich bei jedem Spiel ändern.</p>
        {[0, 1, 2].map(index => {
          const values = [data.captainId || '', ...(data.viceCaptainIds || [])];
          return <label key={index}>{index === 0 ? 'Kapitänin' : `${index}. Vizekapitänin`}<select value={values[index] || ''} disabled={busy} onChange={e => { values[index] = e.target.value; setData({ ...data, captainId: values[0], viceCaptainIds: values.slice(1).filter(Boolean) }); }}><option value="">Noch offen</option>{data.candidates.filter(p => !p.inactive || values.includes(p.id)).map(p => <option key={p.id} value={p.id} disabled={values.includes(p.id) && values[index] !== p.id}>{p.name}{p.inactive ? ' (inaktiv)' : ''}</option>)}</select></label>;
        })}
        <p>Ist die Kapitänin nicht im Kader, rückt die erste verfügbare Vizekapitänin nach. Pro Spiel kannst du die Auswahl anpassen.</p>
        <button className="btn-save-players" disabled={busy}>Voreinstellung speichern</button>
      </form>
      <button className="btn-save-players" disabled={busy} onClick={() => setDraft({ ...empty })}>Gastspielerin anlegen</button>
      {draft && <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/profiles', 'POST', { ...draft, version: data.version })); setDraft(null); setNotice('Profil gespeichert.'); await onProfileSaved?.(); }); }}>
        <h3>{draft.playerId ? 'Spielerinnenprofil' : 'Gastspielerin'}</h3>
        <label>Name<input required maxLength={100} value={draft.name} disabled={busy || !!draft.playerId} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Starker Fuß<select value={draft.foot} disabled={busy} onChange={e => setDraft({ ...draft, foot: e.target.value })}>{['unbekannt', 'links', 'rechts', 'beidfüßig'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Stammposition<select value={draft.mainPosition} disabled={busy} onChange={e => setDraft({ ...draft, mainPosition: e.target.value })}><option value="">Noch offen</option>{Object.entries(POSITIONS).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label>
        <fieldset><legend>Weitere Positionen</legend><div className="squad-position-options">{Object.entries(POSITIONS).map(([id, name]) => <label key={id}><input type="checkbox" checked={draft.positions.includes(id)} disabled={busy} onChange={e => setDraft({ ...draft, positions: e.target.checked ? [...draft.positions, id] : draft.positions.filter(p => p !== id) })} />{id} · {name}</label>)}</div></fieldset>
        <label>Rückennummer<input inputMode="numeric" maxLength={2} value={draft.number} disabled={busy} onChange={e => setDraft({ ...draft, number: e.target.value })} /></label>
        {draft.playerId && <p>Diese feste Rückennummer gilt auch für Training und Teamverwaltung.</p>}
        <label>Verein<input maxLength={100} value={draft.club} disabled={busy} onChange={e => setDraft({ ...draft, club: e.target.value })} /></label>
        <label>Notizen<textarea maxLength={1000} value={draft.note} disabled={busy} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
        {!draft.playerId && <label><input type="checkbox" checked={draft.inactive} disabled={busy} onChange={e => setDraft({ ...draft, inactive: e.target.checked })} />Gastspielerin inaktiv</label>}
        <div className="task-toolbar"><button className="btn-save-players" disabled={busy}>Profil speichern</button><button type="button" className="btn-edit" disabled={busy} onClick={() => setDraft(null)}>Abbrechen</button></div>
      </form>}
      {['Mannschaft', 'Gastspielerinnen'].map((title, index) => <section className="cash-entry-section" key={title}><h3>{title}</h3><ul className="squad-profile-list">{data.candidates.filter(p => p.guest === Boolean(index)).map(p => <li key={p.id}><span><strong>{p.name}</strong><small>{p.mainPosition || 'Position offen'} · {p.foot || 'Fuß unbekannt'}{p.inactive ? ' · Inaktiv' : ''}</small></span><button className="btn-edit" disabled={busy} onClick={() => edit(p)}>Bearbeiten</button></li>)}</ul></section>)}
    </>}
  </section>;
}
