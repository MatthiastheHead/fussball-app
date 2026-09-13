import React from 'react';
import { FORMATIONS } from './squadUtils.js';
export default function SquadConfigFields({ value, onChange, disabled }) {
  const presets = FORMATIONS[value.fieldPlayers] || [];
  return <>
    <label>Spielmodus<select disabled={disabled} value={value.fieldPlayers} onChange={e => { const fieldPlayers = Number(e.target.value); onChange({ fieldPlayers, formation: FORMATIONS[fieldPlayers][0] }); }}>{Object.keys(FORMATIONS).map(n => <option key={n} value={n}>{n}+1 · {Number(n) + 1} Spielerinnen</option>)}</select></label>
    <label>Standardaufstellung<select disabled={disabled} value={value.formation} onChange={e => onChange({ formation: e.target.value })}>{[...new Set([...presets, value.formation])].map(f => <option key={f} value={f}>{f}</option>)}</select></label>
    <label>Maximale Ersatzspielerinnen<input type="number" required min="0" max="15" step="1" disabled={disabled} value={value.benchSize} onChange={e => onChange({ benchSize: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
  </>;
}
