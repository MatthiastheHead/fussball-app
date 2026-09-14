import React, { useRef, useState } from 'react';
import { POSITIONS, movePlayer, transferPlayer } from './squadUtils.js';

export default function SquadPitch({ draft, candidates, busy, onChange, onError }) {
  const [selected, setSelected] = useState(''), [ghost, setGhost] = useState(null);
  const root = useRef(null), pitch = useRef(null), drag = useRef(null), suppressClick = useRef(false);
  const chosen = draft.lineup.find(p => p.personId === selected);
  function transfer(id, target) {
    if (busy) return;
    try { onChange(transferPlayer(draft.lineup, id, target, draft)); onError(''); setSelected(''); }
    catch (e) { onError(e.message); }
  }
  function tap(id) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (chosen && selected !== id) transfer(selected, { personId: id });
    else setSelected(selected === id ? '' : id);
  }
  function pointerUp(e) {
    const active = drag.current;
    drag.current = null; setGhost(null);
    if (!active?.moved || busy) return;
    suppressClick.current = true;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (!hit || !root.current.contains(hit)) return;
    const player = hit.closest('[data-player-id]');
    if (player && player.dataset.playerId !== active.id) { transfer(active.id, { personId: player.dataset.playerId }); return; }
    const zone = hit.closest('[data-squad-zone]')?.dataset.squadZone;
    if (zone === 'bench') transfer(active.id, { role: 'bench' });
    if (zone === 'pitch') {
      const rect = pitch.current.getBoundingClientRect();
      const source = draft.lineup.find(p => p.personId === active.id);
      transfer(active.id, { role: source?.role === 'keeper' ? 'keeper' : 'field', x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 });
    }
  }
  function playerButton(p, bench = false) {
    return <button type="button" key={p.personId} disabled={busy} data-player-id={p.personId}
      aria-label={`${p.name}, ${bench ? 'Ersatzbank' : POSITIONS[p.position] || 'Feld'}`} aria-pressed={selected === p.personId}
      className={`${bench ? 'bench-player' : 'pitch-player'} ${p.role} ${selected === p.personId ? 'selected' : ''}`}
      style={bench ? undefined : { left: `${p.x}%`, top: `${p.y}%` }}
      onClick={e => { e.stopPropagation(); tap(p.personId); }}
      onPointerDown={e => { if (busy || e.button !== 0) return; suppressClick.current = false; drag.current = { id: p.personId, name: p.name, x: e.clientX, y: e.clientY, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (!d || d.id !== p.personId) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true; if (d.moved) { setGhost({ name: d.name, x: e.clientX, y: e.clientY }); if (e.clientY < 70) window.scrollBy(0, -18); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 18); } }}
      onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setGhost(null); }} onLostPointerCapture={() => { drag.current = null; setGhost(null); }}
      onKeyDown={e => { if (e.key === 'Escape') { setSelected(''); return; } const delta = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (delta && !bench) { e.preventDefault(); onChange(movePlayer(draft.lineup, p.personId, p.x + delta[0], p.y + delta[1])); } }}>
      <span className="player-shirt">{candidates.find(c => c.id === p.personId)?.number || p.position || '·'}{(draft.captainId === p.personId || draft.viceCaptainIds?.includes(p.personId)) && <b>{draft.captainId === p.personId ? 'C' : 'V'}</b>}</span>
      <span className="player-name">{p.name}{p.guest ? ' · Gast' : ''}</span>
    </button>;
  }
  return <div ref={root} className="squad-board">
    <p className="squad-help">Ziehe zwischen Feld und Bank. Auf eine Spielerin ziehen tauscht die Plätze. Alternativ beide Spielerinnen nacheinander antippen.</p>
    {chosen && <div className="squad-transfer-controls" role="group" aria-label={`Ziel für ${chosen.name}`}><strong>{chosen.name}</strong>{[['field', 'Aufs Feld'], ['keeper', 'Ins Tor'], ['bench', 'Auf die Bank']].map(([role, label]) => <button type="button" className="btn-edit" key={role} disabled={busy} onClick={() => transfer(selected, { role })}>{label}</button>)}<button type="button" className="btn-edit" onClick={() => setSelected('')}>Auswahl aufheben</button></div>}
    <div ref={pitch} className="squad-pitch" data-squad-zone="pitch" aria-label="Grafische Aufstellung" onClick={e => { if (suppressClick.current) { suppressClick.current = false; return; } if (!chosen || busy) return; const rect = pitch.current.getBoundingClientRect(); transfer(selected, { role: chosen.role === 'keeper' ? 'keeper' : 'field', x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 }); }}>
      <div className="pitch-center" /><div className="pitch-box top" /><div className="pitch-box bottom" /><span className="pitch-direction">ANGRIFF ↑</span>
      {draft.lineup.filter(p => p.role !== 'bench').map(p => playerButton(p))}
    </div>
    <h3>Ersatzbank · {draft.lineup.filter(p => p.role === 'bench').length}/{draft.benchSize}</h3>
    <div className="squad-bench" data-squad-zone="bench">{draft.lineup.filter(p => p.role === 'bench').map(p => playerButton(p, true))}<button type="button" className="bench-drop" disabled={busy || !chosen || chosen.role === 'bench'} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } transfer(selected, { role: 'bench' }); }}>Hier auf die Bank setzen</button></div>
    {ghost && <div className="squad-drag-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}>{ghost.name}</div>}
  </div>;
}
