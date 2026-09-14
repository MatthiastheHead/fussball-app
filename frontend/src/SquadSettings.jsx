import React, { useEffect, useMemo, useState } from 'react';
import SquadConfigFields from './SquadConfigFields.jsx';
import { POSITIONS } from './squadUtils.js';

const emptyProfile = { name: '', playerId: '', guest: true, foot: 'unbekannt', mainPosition: '', positions: [], number: '', club: '', note: '', inactive: false };
const emptyMember = { name: '', isTrainer: false, note: '', memberSince: '', inactive: false };

export default function SquadSettings({ request, onProfileSaved }) {
  const [data, setData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [profileDraft, setProfileDraft] = useState(null);
  const [memberDraft, setMemberDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function call(path, method, body) {
    const res = await request(path, method ? {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    } : { cache: 'no-store' });
    const json = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(json?.error || 'Speichern fehlgeschlagen.');
    return json;
  }

  async function loadAll() {
    const [squadData, playerData] = await Promise.all([call('squads/admin'), call('players')]);
    setData(squadData);
    setPlayers(playerData);
  }

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  useEffect(() => { run(loadAll); }, []);

  const trainers = useMemo(() => players.filter(p => p.isTrainer), [players]);
  const roster = useMemo(() => data?.candidates || [], [data]);

  const editProfile = p => setProfileDraft({
    ...emptyProfile,
    ...p,
    playerId: p.playerId || '',
    positions: p.positions || [],
  });

  const editMember = p => setMemberDraft({
    _id: p._id,
    name: p.name || '',
    isTrainer: !!p.isTrainer,
    note: p.note || '',
    memberSince: p.memberSince || '',
    inactive: !!p.inactive,
  });

  async function saveMembers(nextPlayers, message) {
    const saved = await call('players', 'POST', { reset: true, list: nextPlayers });
    setPlayers(saved);
    setData(await call('squads/admin'));
    setMemberDraft(null);
    setNotice(message);
    await onProfileSaved?.();
  }

  async function saveMember() {
    const cleanName = String(memberDraft?.name || '').trim();
    if (!cleanName) throw new Error('Bitte einen Namen eingeben.');
    const next = memberDraft?._id
      ? players.map(p => String(p._id) === String(memberDraft._id) ? { ...p, ...memberDraft, name: cleanName } : p)
      : [...players, { ...emptyMember, ...memberDraft, name: cleanName }];
    await saveMembers(next, memberDraft?._id ? 'Stammdaten gespeichert.' : `${memberDraft?.isTrainer ? 'Trainer' : 'Spielerin'} angelegt.`);
  }

  async function deleteMember() {
    const target = players.find(p => String(p._id) === String(memberDraft?._id));
    if (!target) return;
    if (!window.confirm(`${target.name} wirklich aus der Kaderverwaltung löschen?`)) return;
    await saveMembers(players.filter(p => String(p._id) !== String(target._id)), `${target.name} wurde gelöscht.`);
  }

  return <section className="squad-settings">
    <h2>Kaderverwaltung</h2>
    <p>Hier pflegst du Spielerinnen, Gastspielerinnen, Trainer, Rückennummern, Positionen und die Vorgaben für Spiele an einer Stelle. Training, Teamgenerator und Spielplanung greifen auf diese Daten zu.</p>

    {error && <p role="alert" className="login-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="task-toolbar">
      <button className="btn-edit" disabled={busy} onClick={() => run(async () => { await loadAll(); setProfileDraft(null); setMemberDraft(null); })}>Neu laden</button>
      <button className="btn-save-players" disabled={busy} onClick={() => setMemberDraft({ ...emptyMember, isTrainer: false })}>Spielerin anlegen</button>
      <button className="btn-edit" disabled={busy} onClick={() => setMemberDraft({ ...emptyMember, isTrainer: true })}>Trainer anlegen</button>
      <button className="btn-save-players" disabled={busy} onClick={() => setProfileDraft({ ...emptyProfile })}>Gastspielerin anlegen</button>
    </div>

    {memberDraft && <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(saveMember); }}>
      <h3>{memberDraft._id ? 'Stammdaten bearbeiten' : memberDraft.isTrainer ? 'Trainer anlegen' : 'Spielerin anlegen'}</h3>
      <label>Name<input required maxLength={100} value={memberDraft.name} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, name: e.target.value })} /></label>
      <label>Rolle<select value={memberDraft.isTrainer ? 'trainer' : 'player'} disabled={busy || !!memberDraft._id} onChange={e => setMemberDraft({ ...memberDraft, isTrainer: e.target.value === 'trainer' })}><option value="player">Spielerin</option><option value="trainer">Trainer</option></select></label>
      <label>Mitglied seit<input type="text" maxLength={50} value={memberDraft.memberSince || ''} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, memberSince: e.target.value })} /></label>
      <label>Notizen<textarea maxLength={1000} value={memberDraft.note || ''} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, note: e.target.value })} /></label>
      <label><input type="checkbox" checked={!!memberDraft.inactive} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, inactive: e.target.checked })} />Inaktiv</label>
      <div className="task-toolbar">
        <button className="btn-save-players" disabled={busy}>Speichern</button>
        <button type="button" className="btn-edit" disabled={busy} onClick={() => setMemberDraft(null)}>Abbrechen</button>
        {memberDraft._id && <button type="button" className="btn-delete" disabled={busy} onClick={() => run(deleteMember)}>Löschen</button>}
      </div>
    </form>}

    {profileDraft && <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => {
      setData(await call('squads/profiles', 'POST', { ...profileDraft, version: data.version }));
      setPlayers(await call('players'));
      setProfileDraft(null);
      setNotice('Spielerinnenprofil gespeichert.');
      await onProfileSaved?.();
    }); }}>
      <h3>{profileDraft.guest ? 'Gastspielerin' : 'Spielerinnenprofil'}</h3>
      <label>Name<input required maxLength={100} value={profileDraft.name} disabled={busy || (!!profileDraft.playerId && !profileDraft.guest)} onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })} /></label>
      <label>Starker Fuß<select value={profileDraft.foot} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, foot: e.target.value })}>{['unbekannt', 'links', 'rechts', 'beidfüßig'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Stammposition<select value={profileDraft.mainPosition} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, mainPosition: e.target.value })}><option value="">Noch offen</option>{Object.entries(POSITIONS).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label>
      <fieldset><legend>Weitere Positionen</legend><div className="squad-position-options">{Object.entries(POSITIONS).map(([id, name]) => <label key={id}><input type="checkbox" checked={profileDraft.positions.includes(id)} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, positions: e.target.checked ? [...profileDraft.positions, id] : profileDraft.positions.filter(p => p !== id) })} />{id} · {name}</label>)}</div></fieldset>
      <label>Rückennummer<input inputMode="numeric" maxLength={2} value={profileDraft.number} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, number: e.target.value })} /></label>
      <p>Die Rückennummer gilt zentral für Training, Teamverwaltung und Spiele.</p>
      <label>Verein<input maxLength={100} value={profileDraft.club} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, club: e.target.value })} /></label>
      <label>Notizen<textarea maxLength={1000} value={profileDraft.note} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, note: e.target.value })} /></label>
      {profileDraft.guest && <label><input type="checkbox" checked={profileDraft.inactive} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, inactive: e.target.checked })} />Gastspielerin inaktiv</label>}
      <div className="task-toolbar">
        <button className="btn-save-players" disabled={busy}>Profil speichern</button>
        <button type="button" className="btn-edit" disabled={busy} onClick={() => setProfileDraft(null)}>Abbrechen</button>
        {profileDraft.guest && profileDraft.playerId && !profileDraft.legacyGuest && <button type="button" className="btn-delete" disabled={busy} onClick={() => {
          if (!window.confirm(`${profileDraft.name} wirklich als Gastspielerin löschen?`)) return;
          run(async () => {
            setData(await call(`squads/guests/${profileDraft.playerId}`, 'DELETE'));
            setPlayers(await call('players'));
            setProfileDraft(null);
            setNotice('Gastspielerin gelöscht.');
            await onProfileSaved?.();
          });
        }}>Gastspielerin löschen</button>}
      </div>
    </form>}

    {data && <>
      <section className="cash-entry-section">
        <h3>Spielerinnenkader</h3>
        <p>Alle Spielerinnen aus derselben Datenbasis. Gastspielerinnen sind gekennzeichnet und stehen ebenfalls für Training und Spiele zur Verfügung.</p>
        <ul className="squad-profile-list">{roster.map(p => <li key={p.id}>
          <span><strong>{p.number ? `#${p.number} ` : ''}{p.name}{p.guest ? ' · Gast' : ''}</strong><small>{p.mainPosition || 'Position offen'} · {p.foot || 'Fuß unbekannt'}{p.inactive ? ' · Inaktiv' : ''}</small></span>
          <div className="task-toolbar">
            {!p.guest && <button className="btn-edit" disabled={busy} onClick={() => { const base = players.find(row => String(row._id) === String(p.playerId)); if (base) editMember(base); }}>Stammdaten</button>}
            <button className="btn-edit" disabled={busy} onClick={() => editProfile(p)}>Profil</button>
          </div>
        </li>)}</ul>
      </section>

      <section className="cash-entry-section">
        <h3>Trainer</h3>
        <ul className="squad-profile-list">{trainers.map(p => <li key={p._id}><span><strong>{p.name}</strong><small>{p.inactive ? 'Inaktiv' : 'Aktiv'}{p.memberSince ? ` · seit ${p.memberSince}` : ''}</small></span><button className="btn-edit" disabled={busy} onClick={() => editMember(p)}>Bearbeiten</button></li>)}</ul>
      </section>

      <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/settings', 'PUT', { ...data, fieldPlayers: Number(data.fieldPlayers), benchSize: Number(data.benchSize) })); setNotice('Spielvorgaben gespeichert. Bestehende Spiele behalten ihre Aufstellung.'); }); }}>
        <h3>Spielvorgaben</h3>
        <SquadConfigFields value={data} disabled={busy} onChange={values => setData({ ...data, ...values })} />
        <p>Der Spielmodus enthält eine Torhüterin. Die Vorgaben lassen sich bei jedem Spiel ändern.</p>
        {[0, 1, 2].map(index => {
          const values = [data.captainId || '', ...(data.viceCaptainIds || [])];
          return <label key={index}>{index === 0 ? 'Kapitänin' : `${index}. Vizekapitänin`}<select value={values[index] || ''} disabled={busy} onChange={e => { values[index] = e.target.value; setData({ ...data, captainId: values[0], viceCaptainIds: values.slice(1).filter(Boolean) }); }}><option value="">Noch offen</option>{data.candidates.filter(p => !p.inactive || values.includes(p.id)).map(p => <option key={p.id} value={p.id} disabled={values.includes(p.id) && values[index] !== p.id}>{p.name}{p.inactive ? ' (inaktiv)' : ''}</option>)}</select></label>;
        })}
        <button className="btn-save-players" disabled={busy}>Spielvorgaben speichern</button>
      </form>

      <form className="cash-entry-section squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/source', 'PUT', { fussballTeamUrl: data.fussballTeamUrl || '', version: data.version })); setNotice('Mannschaftslink gespeichert. Vorhandene Spiele bleiben unverändert.'); }); }}>
        <h3>FUSSBALL.DE</h3>
        <label className="squad-wide">Mannschaftslink<input type="url" maxLength={600} disabled={busy} value={data.fussballTeamUrl || ''} onChange={e => setData({ ...data, fussballTeamUrl: e.target.value })} placeholder="https://www.fussball.de/mannschaft/…" /></label>
        <p>Ein anderer Mannschaftslink ändert nur den Spielabruf. Kader und bisherige Aufstellungen bleiben erhalten.</p>
        <button className="btn-save-players" disabled={busy}>Mannschaftslink speichern</button>
      </form>
    </>}
  </section>;
}
