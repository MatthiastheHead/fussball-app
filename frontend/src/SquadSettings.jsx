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
  const teamPlayers = useMemo(() => roster.filter(p => !p.guest), [roster]);
  const guests = useMemo(() => roster.filter(p => p.guest), [roster]);
  const activeCount = useMemo(() => roster.filter(p => !p.inactive).length, [roster]);

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

  async function deletePerson(personId, name) {
    if (!window.confirm(`${name} wirklich löschen? Vergangene Spiele bleiben als Historie erhalten.`)) return;
    setData(await call(`squads/people/${personId}`, 'DELETE'));
    setPlayers(await call('players'));
    setProfileDraft(null);
    setMemberDraft(null);
    setNotice(`${name} wurde gelöscht.`);
    await onProfileSaved?.();
  }

  async function deleteMember() {
    const target = players.find(p => String(p._id) === String(memberDraft?._id));
    if (!target) return;
    await deletePerson(`p:${target._id}`, target.name);
  }

  const personRow = p => <li key={p.id} className="roster-person-row">
    <span className="roster-person-main">
      <strong>{p.number ? `#${p.number} ` : ''}{p.name}</strong>
      <small>{p.mainPosition || 'Position offen'} · {p.foot || 'Fuß unbekannt'}{p.inactive ? ' · Inaktiv' : ''}</small>
    </span>
    <div className="roster-person-actions">
      {!p.guest && <button className="btn-edit" disabled={busy} onClick={() => { const base = players.find(row => String(row._id) === String(p.playerId)); if (base) editMember(base); }}>Stammdaten</button>}
      <button className="btn-edit" disabled={busy} onClick={() => editProfile(p)}>Profil</button>
      <button className="btn-delete" disabled={busy} onClick={() => run(() => deletePerson(p.id, p.name))}>Löschen</button>
    </div>
  </li>;

  return <section className="squad-settings roster-admin">
    <div className="roster-admin-head">
      <div>
        <h2>Kaderverwaltung</h2>
        <p>Eine zentrale Verwaltung für Training, Teamgenerator und Spiele.</p>
      </div>
      <button className="btn-edit" disabled={busy} onClick={() => run(async () => { await loadAll(); setProfileDraft(null); setMemberDraft(null); })}>Neu laden</button>
    </div>

    {error && <p role="alert" className="login-error">{error}</p>}
    {notice && <p role="status" className="roster-notice">{notice}</p>}

    <div className="roster-summary">
      <div><strong>{teamPlayers.length}</strong><span>Teamspielerinnen</span></div>
      <div><strong>{guests.length}</strong><span>Gastspielerinnen</span></div>
      <div><strong>{trainers.length}</strong><span>Trainer</span></div>
      <div><strong>{activeCount}</strong><span>Aktiv im Kader</span></div>
    </div>

    <div className="roster-add-actions">
      <button className="btn-save-players" disabled={busy} onClick={() => setMemberDraft({ ...emptyMember, isTrainer: false })}>+ Spielerin</button>
      <button className="btn-save-players" disabled={busy} onClick={() => setProfileDraft({ ...emptyProfile })}>+ Gastspielerin</button>
      <button className="btn-edit" disabled={busy} onClick={() => setMemberDraft({ ...emptyMember, isTrainer: true })}>+ Trainer</button>
    </div>

    {memberDraft && <form className="cash-entry-section squad-fields roster-editor" onSubmit={e => { e.preventDefault(); run(saveMember); }}>
      <h3>{memberDraft._id ? 'Stammdaten bearbeiten' : memberDraft.isTrainer ? 'Trainer anlegen' : 'Spielerin anlegen'}</h3>
      <label>Name<input required maxLength={100} value={memberDraft.name} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, name: e.target.value })} /></label>
      <label>Rolle<select value={memberDraft.isTrainer ? 'trainer' : 'player'} disabled={busy || !!memberDraft._id} onChange={e => setMemberDraft({ ...memberDraft, isTrainer: e.target.value === 'trainer' })}><option value="player">Spielerin</option><option value="trainer">Trainer</option></select></label>
      <label>Mitglied seit<input type="text" maxLength={50} value={memberDraft.memberSince || ''} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, memberSince: e.target.value })} /></label>
      <label>Notizen<textarea maxLength={1000} value={memberDraft.note || ''} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, note: e.target.value })} /></label>
      <label><input type="checkbox" checked={!!memberDraft.inactive} disabled={busy} onChange={e => setMemberDraft({ ...memberDraft, inactive: e.target.checked })} />Inaktiv</label>
      <div className="task-toolbar squad-wide">
        <button className="btn-save-players" disabled={busy}>Speichern</button>
        <button type="button" className="btn-edit" disabled={busy} onClick={() => setMemberDraft(null)}>Abbrechen</button>
        {memberDraft._id && <button type="button" className="btn-delete" disabled={busy} onClick={() => run(deleteMember)}>Löschen</button>}
      </div>
    </form>}

    {profileDraft && <form className="cash-entry-section squad-fields roster-editor" onSubmit={e => { e.preventDefault(); run(async () => {
      setData(await call('squads/profiles', 'POST', { ...profileDraft, version: data.version }));
      setPlayers(await call('players'));
      setProfileDraft(null);
      setNotice('Spielerinnenprofil gespeichert.');
      await onProfileSaved?.();
    }); }}>
      <h3>{profileDraft.guest ? 'Gastspielerin bearbeiten' : 'Spielerinnenprofil bearbeiten'}</h3>
      <label>Name<input required maxLength={100} value={profileDraft.name} disabled={busy || (!!profileDraft.playerId && !profileDraft.guest)} onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })} /></label>
      <label>Rückennummer<input inputMode="numeric" maxLength={2} value={profileDraft.number} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, number: e.target.value })} /></label>
      <label>Starker Fuß<select value={profileDraft.foot} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, foot: e.target.value })}>{['unbekannt', 'links', 'rechts', 'beidfüßig'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Stammposition<select value={profileDraft.mainPosition} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, mainPosition: e.target.value })}><option value="">Noch offen</option>{Object.entries(POSITIONS).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label>
      <fieldset><legend>Weitere Positionen</legend><div className="squad-position-options">{Object.entries(POSITIONS).map(([id, name]) => <label key={id}><input type="checkbox" checked={profileDraft.positions.includes(id)} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, positions: e.target.checked ? [...profileDraft.positions, id] : profileDraft.positions.filter(p => p !== id) })} />{id} · {name}</label>)}</div></fieldset>
      <label>Verein<input maxLength={100} value={profileDraft.club} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, club: e.target.value })} /></label>
      <label className="squad-wide">Notizen<textarea maxLength={1000} value={profileDraft.note} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, note: e.target.value })} /></label>
      {profileDraft.guest && <label><input type="checkbox" checked={profileDraft.inactive} disabled={busy} onChange={e => setProfileDraft({ ...profileDraft, inactive: e.target.checked })} />Gastspielerin inaktiv</label>}
      <div className="task-toolbar squad-wide">
        <button className="btn-save-players" disabled={busy}>Profil speichern</button>
        <button type="button" className="btn-edit" disabled={busy} onClick={() => setProfileDraft(null)}>Abbrechen</button>
        {profileDraft.id && <button type="button" className="btn-delete" disabled={busy} onClick={() => run(() => deletePerson(profileDraft.id, profileDraft.name))}>Löschen</button>}
      </div>
    </form>}

    {data && <>
      <section className="roster-section">
        <div className="roster-section-title"><div><h3>Teamspielerinnen</h3><p>Fester Mannschaftskader</p></div><strong>{teamPlayers.length}</strong></div>
        {teamPlayers.length ? <ul className="squad-profile-list">{teamPlayers.map(personRow)}</ul> : <p className="roster-empty">Noch keine Spielerinnen angelegt.</p>}
      </section>

      <section className="roster-section">
        <div className="roster-section-title"><div><h3>Gastspielerinnen</h3><p>Temporäre Spielerinnen, die trotzdem in Training und Spielplanung genutzt werden können.</p></div><strong>{guests.length}</strong></div>
        {guests.length ? <ul className="squad-profile-list">{guests.map(personRow)}</ul> : <p className="roster-empty">Keine Gastspielerinnen angelegt.</p>}
      </section>

      <section className="roster-section">
        <div className="roster-section-title"><div><h3>Trainer</h3><p>Trainerteam separat vom Spielerinnenkader</p></div><strong>{trainers.length}</strong></div>
        {trainers.length ? <ul className="squad-profile-list">{trainers.map(p => <li key={p._id} className="roster-person-row"><span className="roster-person-main"><strong>{p.name}</strong><small>{p.inactive ? 'Inaktiv' : 'Aktiv'}{p.memberSince ? ` · seit ${p.memberSince}` : ''}</small></span><div className="roster-person-actions"><button className="btn-edit" disabled={busy} onClick={() => editMember(p)}>Bearbeiten</button><button className="btn-delete" disabled={busy} onClick={() => run(() => deletePerson(`p:${p._id}`, p.name))}>Löschen</button></div></li>)}</ul> : <p className="roster-empty">Noch keine Trainer angelegt.</p>}
      </section>

      <details className="squad-disclosure roster-settings-block">
        <summary>Spielvorgaben und Kapitäninnen</summary>
        <form className="squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/settings', 'PUT', { ...data, fieldPlayers: Number(data.fieldPlayers), benchSize: Number(data.benchSize) })); setNotice('Spielvorgaben gespeichert. Bestehende Spiele behalten ihre Aufstellung.'); }); }}>
          <SquadConfigFields value={data} disabled={busy} onChange={values => setData({ ...data, ...values })} />
          {[0, 1, 2].map(index => {
            const values = [data.captainId || '', ...(data.viceCaptainIds || [])];
            return <label key={index}>{index === 0 ? 'Kapitänin' : `${index}. Vizekapitänin`}<select value={values[index] || ''} disabled={busy} onChange={e => { values[index] = e.target.value; setData({ ...data, captainId: values[0], viceCaptainIds: values.slice(1).filter(Boolean) }); }}><option value="">Noch offen</option>{data.candidates.filter(p => !p.inactive || values.includes(p.id)).map(p => <option key={p.id} value={p.id} disabled={values.includes(p.id) && values[index] !== p.id}>{p.name}{p.inactive ? ' (inaktiv)' : ''}</option>)}</select></label>;
          })}
          <button className="btn-save-players squad-wide" disabled={busy}>Spielvorgaben speichern</button>
        </form>
      </details>

      <details className="squad-disclosure roster-settings-block">
        <summary>FUSSBALL.DE Anbindung</summary>
        <form className="squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { setData(await call('squads/source', 'PUT', { fussballTeamUrl: data.fussballTeamUrl || '', version: data.version })); setNotice('Mannschaftslink gespeichert. Vorhandene Spiele bleiben unverändert.'); }); }}>
          <label className="squad-wide">Mannschaftslink<input type="url" maxLength={600} disabled={busy} value={data.fussballTeamUrl || ''} onChange={e => setData({ ...data, fussballTeamUrl: e.target.value })} placeholder="https://www.fussball.de/mannschaft/…" /></label>
          <p>Der Link steuert nur den Spielabruf. Kader und bisherige Aufstellungen bleiben erhalten.</p>
          <button className="btn-save-players squad-wide" disabled={busy}>Mannschaftslink speichern</button>
        </form>
      </details>
    </>}
  </section>;
}
