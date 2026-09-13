import React, { useEffect, useRef, useState } from 'react';
import SquadModuleBrand from './SquadModuleBrand.jsx';
import SquadConfigFields from './SquadConfigFields.jsx';
import SquadFixturePicker from './SquadFixturePicker.jsx';
import { POSITIONS, slots, suggest, movePlayer, score, leadership, reconfigure } from './squadUtils.js';
const dateInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export default function SquadPanel({ request, onBack, username }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [stats, setStats] = useState([]), [selected, setSelected] = useState('');
  const pitch = useRef(null), drag = useRef(null);
  async function call(path, body) {
    const res = await request(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Spielkader konnte nicht geladen werden.'); return json;
  }
  async function run(fn) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  useEffect(() => { run(async () => setData(await call('squads'))); }, []);
  useEffect(() => { const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const leave = () => !dirty || window.confirm('Ungespeicherte Änderungen verwerfen?');
  function open(game, fixture) { if (!leave()) return; const now = new Date(), from = new Date(); from.setDate(from.getDate() - 56);
    if (!game && fixture?.date) { const end = fixture.date < dateInput(now) ? fixture.date : dateInput(now); from.setTime(new Date(`${end}T12:00:00`).getTime()); from.setDate(from.getDate() - 56); }
    setDraft(game ? { ...structuredClone(game), availableIds: game.availableIds || game.lineup.map(p => p.personId), viceCaptainIds: game.viceCaptainIds || [] } : { opponent: '', location: '', date: dateInput(now), time: '10:00', from: dateInput(from), to: fixture?.date && fixture.date < dateInput(now) ? fixture.date : dateInput(now), fieldPlayers: data.fieldPlayers, benchSize: data.benchSize, formation: data.formation, lineup: [], captainId: '', viceCaptainIds: [], availableIds: [], ...(fixture || {}) });
    setDirty(!game && !!fixture); setStats([]); setSelected(''); setError(''); setNotice(!game && fixture ? 'Termin als Entwurf übernommen. Bitte Spielort ergänzen, Daten prüfen und speichern.' : '');
  }
  function leadersFor(lineup) {
    const captainId = draft.captainId || data.captainId;
    const deputies = [...new Set([...(draft.viceCaptainIds || []), data.captainId, ...(data.viceCaptainIds || [])])].filter(id => id && id !== captainId);
    return leadership(lineup, captainId, deputies);
  }
  function configure(values) {
    if (values.benchSize === '') { change(values); return; }
    const config = { ...draft, ...values };
    try {
      const repositioned = reconfigure(draft.lineup, config);
      const lineup = values.formation !== undefined || values.fieldPlayers !== undefined ? repositioned : draft.lineup;
      change({ ...values, lineup }); setError('');
    } catch (e) { setError(e.message); }
  }
  function availability(personId, present) {
    const lineup = present ? draft.lineup : draft.lineup.filter(p => p.personId !== personId);
    change({ availableIds: present ? [...draft.availableIds, personId] : draft.availableIds.filter(id => id !== personId), lineup, ...leadersFor(lineup) });
    if (!present && selected === personId) setSelected('');
  }
  function change(values) { setDraft(d => ({ ...d, ...values })); setDirty(true); }
  const count = role => draft.lineup.filter(p => p.role === role).length;
  function add(p, role) {
    if (!draft.availableIds.includes(p.id)) { setError('Bitte die Spielerin zuerst als verfügbar markieren.'); return; }
    const limit = role === 'keeper' ? 1 : role === 'field' ? draft.fieldPlayers : draft.benchSize;
    if (count(role) >= limit) { setError('Für diesen Bereich sind alle Plätze belegt.'); return; }
    const spots = slots(draft.formation).filter(s => s.role === role);
    const spot = spots.find(s => !draft.lineup.some(p => p.role !== 'bench' && Math.hypot(p.x - s.x, p.y - s.y) < 10)) || spots[count(role)] || { x: 50, y: 50, position: p.mainPosition || '' };
    const lineup = [...draft.lineup, { ...spot, personId: p.id, name: p.name, guest: p.guest, role }];
    change({ lineup, ...leadersFor(lineup) }); setError('');
  }
  function roleChange(row, role) {
    if (role === row.role) return;
    const limit = role === 'keeper' ? 1 : role === 'field' ? draft.fieldPlayers : draft.benchSize;
    if (count(role) >= limit) { setError('Für diesen Bereich sind alle Plätze belegt.'); return; }
    change({ lineup: draft.lineup.map(p => p.personId === row.personId ? { ...p, role, position: role === 'keeper' ? 'TW' : p.position === 'TW' ? '' : p.position } : p) }); setError('');
  }
  function move(id, event) { const rect = pitch.current.getBoundingClientRect(); setDraft(d => ({ ...d, lineup: movePlayer(d.lineup, id, (event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100) })); setDirty(true); }
  return <div className="App squad-panel"><SquadModuleBrand /><div className="squad-heading"><h1>Spielkader</h1><button className="btn-back" disabled={busy} onClick={() => { if (leave()) onBack(); }}>Zurück</button></div>
    {error && <p className="login-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="task-toolbar"><button className="btn-save-players" disabled={busy || !data} onClick={() => open(null)}>＋ Spiel anlegen</button><button className="btn-edit" disabled={busy} onClick={() => { if (leave()) run(async () => { setData(await call('squads')); setDraft(null); setDirty(false); }); }}>Neu laden</button></div>
    {!data && <p>Lädt …</p>}
    {data && <SquadFixturePicker request={request} source={data.fussballTeamUrl} games={data.games} disabled={busy} onSelect={(game, fixture) => open(game, fixture)} />}
    {data && <><div className="squad-games">{[...data.games].sort((a, b) => b.date.localeCompare(a.date)).map(g => <button key={g._id} disabled={busy} className={`squad-game ${draft?._id === g._id ? 'active' : ''}`} onClick={() => open(g)}><strong>{g.opponent}</strong><span>{new Date(g.date + 'T12:00:00').toLocaleDateString('de-DE')} · {g.time}</span><small>{g.lineup.length} im Kader · {g.fieldPlayers}+1</small></button>)}{!data.games.length && <p>Noch kein Spiel angelegt.</p>}</div>
    {draft && <section className="squad-editor">
      <form className="squad-fields" onSubmit={e => { e.preventDefault(); run(async () => { const result = await call('squads/games', { ...draft, id: draft._id, version: data.version }); setData(result); setDraft(result.games.find(g => g._id === draft._id) || result.games.at(-1)); setDirty(false); setNotice('Spiel und Aufstellung gespeichert.'); }); }}>
        <label>Gegner<input required maxLength={100} disabled={busy} value={draft.opponent} onChange={e => change({ opponent: e.target.value })} /></label>
        <label>Spieltag<input type="date" required disabled={busy} value={draft.date} onChange={e => change({ date: e.target.value })} /></label>
        <label>Anstoß<input type="time" required disabled={busy} value={draft.time} onChange={e => change({ time: e.target.value })} /></label>
        <label>Spielort<input maxLength={200} disabled={busy} value={draft.location} onChange={e => change({ location: e.target.value })} /></label>
        <SquadConfigFields value={draft} disabled={busy} onChange={configure} />
        <p className="squad-wide">Änderungen gelten nur für dieses Spiel. Bei einer neuen Formation werden die Feldpositionen neu verteilt. Überzählige Spielerinnen bitte vorher entfernen.</p>
        <label>Trainingsauswertung ab<input type="date" required max={draft.to} value={draft.from} disabled={busy} onChange={e => { change({ from: e.target.value }); setStats([]); }} /></label>
        <label>Trainingsauswertung bis<input type="date" required min={draft.from} max={draft.date} value={draft.to} disabled={busy} onChange={e => { change({ to: e.target.value }); setStats([]); }} /></label>
        <label>Kapitänin<select disabled={busy} value={draft.captainId} onChange={e => change({ captainId: e.target.value })}><option value="">Noch offen</option>{draft.lineup.map(p => <option key={p.personId} value={p.personId} disabled={(draft.viceCaptainIds || []).includes(p.personId)}>{p.name}</option>)}</select></label>
        {[0, 1].map(index => <label key={index}>{index + 1}. Vizekapitänin<select disabled={busy} value={draft.viceCaptainIds?.[index] || ''} onChange={e => { const ids = [...draft.viceCaptainIds]; ids[index] = e.target.value; change({ viceCaptainIds: ids.filter(Boolean) }); }}><option value="">Noch offen</option>{draft.lineup.map(p => <option key={p.personId} value={p.personId} disabled={p.personId === draft.captainId || (draft.viceCaptainIds.includes(p.personId) && draft.viceCaptainIds[index] !== p.personId)}>{p.name}</option>)}</select></label>)}
        <button className="btn-save-players" disabled={busy}>{busy ? 'Bitte warten …' : dirty ? 'Spiel und Aufstellung speichern *' : 'Spiel und Aufstellung speichern'}</button>
      </form>
      <div className="task-toolbar"><button className="btn-edit" disabled={busy || dirty || !draft._id} onClick={() => run(async () => { const { createSquadPdf } = await import('./squadPdf.js'); createSquadPdf(draft, { generatedBy: username, generatedAt: new Date().toISOString() }).save(`Spielkader-${draft.date}.pdf`); })}>Als PDF exportieren</button>{(dirty || !draft._id) && <small>Vor dem Export bitte speichern.</small>}</div>
      <div className="squad-suggestion"><h2>Kader zusammenstellen</h2><p>Vorschlag: 60 % Anwesenheit und 40 % Sterne-Durchschnitt, passend zu den hinterlegten Positionen. Ohne Sterne zählt die Anwesenheit. Gastspielerinnen und Spielerinnen ohne Trainingsdaten ergänzt du von Hand.</p><button className="btn-edit" disabled={busy || !draft.from || !draft.to || draft.from > draft.to || draft.to > draft.date} onClick={() => { if (draft.lineup.length && !window.confirm('Aktuelle Aufstellung durch einen neuen Vorschlag ersetzen?')) return; run(async () => { const values = await call(`squads/statistics?from=${encodeURIComponent(draft.from)}&to=${encodeURIComponent(draft.to)}`); setStats(values); const lineup = suggest(data.candidates.filter(p => draft.availableIds.includes(p.id)), values, draft.formation, draft.benchSize); change({ lineup, ...leadership(lineup, data.captainId, data.viceCaptainIds) }); setSelected(''); setNotice('Vorschlag erstellt. Freie Plätze kannst du manuell besetzen. Bitte anschließend speichern.'); }); }}>Vorschlag generieren</button></div>
      <div className="squad-layout"><section><h2>Aufstellung · {count('field') + count('keeper')}/{draft.fieldPlayers + 1}</h2><p className="squad-help">Spielerin ziehen oder antippen und anschließend ihre Zielposition antippen. Mit den Pfeiltasten kannst du sie ebenfalls verschieben.</p>
        <div ref={pitch} className="squad-pitch" aria-label="Grafische Aufstellung" onClick={e => { if (!busy && selected) move(selected, e); }}>
          <div className="pitch-center" /><div className="pitch-box top" /><div className="pitch-box bottom" /><span className="pitch-direction">ANGRIFF ↑</span>
          {draft.lineup.filter(p => p.role !== 'bench').map(p => <button type="button" key={p.personId} disabled={busy} aria-label={`${p.name}, ${POSITIONS[p.position] || 'Feld'}, mit Pfeiltasten verschieben`} aria-pressed={selected === p.personId} className={`pitch-player ${p.role} ${selected === p.personId ? 'selected' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={e => { e.stopPropagation(); setSelected(p.personId); }}
            onPointerDown={e => { if (busy) return; drag.current = { id: p.personId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); setSelected(p.personId); }}
            onPointerMove={e => { const d = drag.current; if (d?.id === p.personId && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) move(p.personId, e); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onKeyDown={e => { const delta = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (delta) { e.preventDefault(); change({ lineup: movePlayer(draft.lineup, p.personId, p.x + delta[0], p.y + delta[1]) }); } }}>
            <span className="player-shirt">{data.candidates.find(c => c.id === p.personId)?.number || p.position || '·'}{(draft.captainId === p.personId || draft.viceCaptainIds.includes(p.personId)) && <b>{draft.captainId === p.personId ? 'C' : 'V'}</b>}</span><span className="player-name">{p.name}{p.guest ? ' · Gast' : ''}</span></button>)}
        </div><h3>Ersatzbank · {count('bench')}/{draft.benchSize}</h3><div className="squad-bench">{draft.lineup.filter(p => p.role === 'bench').map(p => <span key={p.personId}>{p.name}{p.guest ? ' · Gast' : ''}{draft.captainId === p.personId ? ' · C' : draft.viceCaptainIds.includes(p.personId) ? ' · V' : ''}</span>)}{!count('bench') && <p>Noch unbesetzt</p>}</div>
        <div className="squad-roster">{draft.lineup.map(p => <div key={p.personId} className="squad-roster-row"><strong>{p.name}{p.guest ? ' · Gast' : ''}</strong><label>Bereich<select disabled={busy} value={p.role} onChange={e => roleChange(p, e.target.value)}><option value="keeper">Tor</option><option value="field">Feld</option><option value="bench">Ersatzbank</option></select></label><label>Position<select disabled={busy || p.role === 'keeper'} value={p.position} onChange={e => change({ lineup: draft.lineup.map(row => row.personId === p.personId ? { ...row, position: e.target.value } : row) })}><option value="">Offen</option>{Object.entries(POSITIONS).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label><button className="btn-edit" disabled={busy} onClick={() => { const lineup = draft.lineup.filter(row => row.personId !== p.personId); change({ lineup, ...leadersFor(lineup) }); if (selected === p.personId) setSelected(''); }}>Entfernen</button></div>)}</div>
      </section><section><h2>Wer ist dabei? · {draft.availableIds.length}</h2>{draft.availableIds.some(id => !data.candidates.some(p => p.id === id && !p.inactive)) && <button disabled={busy} className="btn-edit" onClick={() => { const availableIds = draft.availableIds.filter(id => data.candidates.some(p => p.id === id && !p.inactive)); const lineup = draft.lineup.filter(p => availableIds.includes(p.personId)); change({ availableIds, lineup, ...leadersFor(lineup) }); }}>Inaktive oder entfernte Spielerinnen aus Auswahl nehmen</button>}<p>Nur angehakte Spielerinnen stehen für den Kader und den Vorschlag zur Verfügung. Die Auswahl wird pro Spiel gespeichert.</p>{data.candidates.filter(p => !p.inactive).map(p => { const s = stats.find(s => s.id === p.id), inTeam = draft.lineup.some(row => row.personId === p.id); return <article className="squad-candidate" key={p.id}><strong>{p.name}{p.guest ? ' · Gast' : ''}</strong><small>{POSITIONS[p.mainPosition] || 'Stammposition offen'} · Fuß: {p.foot || 'unbekannt'}{p.positions?.length ? ` · Auch: ${p.positions.join(', ')}` : ''}{p.club ? ` · ${p.club}` : ''}</small>{p.note && <small>{p.note}</small>}<label><input type="checkbox" disabled={busy} checked={draft.availableIds.includes(p.id)} onChange={e => availability(p.id, e.target.checked)} />Ist verfügbar</label>{s && <small>{s.total ? `${s.attended}/${s.total} Trainings · ${Math.round(s.attendance * 100)} % · Sterne: ${s.average === null ? 'unbewertet' : s.average.toFixed(1)} · Wert ${score(s)}/100` : 'Keine Trainingsdaten im Zeitraum'}</small>}<div className="task-toolbar">{inTeam ? <span>Im Kader</span> : [['keeper', 'Tor'], ['field', 'Feld'], ['bench', 'Bank']].map(([role, title]) => <button className="btn-edit" key={role} disabled={busy || !draft.availableIds.includes(p.id)} onClick={() => add(p, role)}>＋ {title}</button>)}</div></article>; })}</section></div>
      {draft.updatedBy && <p className="squad-help">Zuletzt gespeichert von {draft.updatedBy} · {new Date(draft.updatedAt).toLocaleString('de-DE')}</p>}
    </section>}</>}
  </div>;
}
