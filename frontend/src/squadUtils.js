export const POSITIONS = { TW: 'Tor', LV: 'Linke Abwehr', IV: 'Innenverteidigung', RV: 'Rechte Abwehr', LWB: 'Linker Flügelverteidiger', RWB: 'Rechter Flügelverteidiger', DM: 'Defensives Mittelfeld', ZM: 'Zentrales Mittelfeld', OM: 'Offensives Mittelfeld', LM: 'Linkes Mittelfeld', RM: 'Rechtes Mittelfeld', LA: 'Linker Angriff', RA: 'Rechter Angriff', ST: 'Sturm' };
export function slots(formation) {
  const rows = formation.split('-').map(Number);
  return [{ role: 'keeper', position: 'TW', x: 50, y: 89 }, ...rows.flatMap((count, line) => Array.from({ length: count }, (_, i) => ({
    role: 'field', x: 100 * (i + 1) / (count + 1), y: 70 - line * (52 / Math.max(1, rows.length - 1)),
    position: line === 0 ? (count > 1 && i === 0 ? 'LV' : count > 1 && i === count - 1 ? 'RV' : 'IV') : line === rows.length - 1 ? (count >= 3 ? i === 0 ? 'LA' : i === count - 1 ? 'RA' : 'ST' : 'ST') : (count >= 3 ? i === 0 ? 'LM' : i === count - 1 ? 'RM' : 'ZM' : 'ZM'),
  })))];
}
export function score(stat) {
  if (!stat || !stat.total) return null;
  return Math.round(100 * (stat.average === null ? stat.attendance : .6 * stat.attendance + .4 * stat.average / 3));
}
const family = position => position === 'TW' ? 'keeper' : ['LV', 'IV', 'RV', 'LWB', 'RWB'].includes(position) ? 'defense' : ['LA', 'RA', 'ST'].includes(position) ? 'attack' : 'midfield';
export function suggest(people, stats, formation, benchSize) {
  const value = person => {
    const rated = score(stats.find(s => s.id === person.id));
    return rated === null ? 50 : rated;
  };
  const pool = people.filter(p => !p.inactive)
    .sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, 'de'));
  const lineup = [];
  for (const slot of slots(formation)) {
    const suitable = p => {
      const positions = [p.mainPosition, ...(p.positions || [])].filter(Boolean);
      if (slot.role === 'keeper') return positions.includes('TW');
      return !positions.length || positions.some(pos => pos !== 'TW' && family(pos) === family(slot.position));
    };
    const index = pool.findIndex(suitable);
    if (index < 0) continue;
    const [person] = pool.splice(index, 1);
    lineup.push({ ...slot, personId: person.id, name: person.name, guest: person.guest === true });
  }
  return [...lineup, ...pool.slice(0, benchSize).map(p => ({ personId: p.id, name: p.name, guest: p.guest === true, role: 'bench', position: p.mainPosition || '', x: 50, y: 50 }))];
}
export function movePlayer(lineup, id, x, y) {
  return lineup.map(row => row.personId === id ? { ...row, x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) } : row);
}

export function transferPlayer(lineup, id, target, config) {
  const source = lineup.find(p => p.personId === id);
  if (!source) throw new Error('Bitte zuerst eine Spielerin auswählen.');
  const other = target.personId && lineup.find(p => p.personId === target.personId);
  if (target.personId && !other) throw new Error('Die Zielspielerin ist nicht mehr im Kader.');
  if (other) {
    if (other.personId === id) return lineup;
    const place = p => ({ role: p.role, position: p.role === 'bench' ? '' : p.position, x: p.x, y: p.y });
    return lineup.map(p => p.personId === id ? { ...p, ...place(other) } : p.personId === other.personId ? { ...p, ...place(source) } : p);
  }
  const role = target.role;
  if (!['field', 'keeper', 'bench'].includes(role)) throw new Error('Ungültiger Zielbereich.');
  const limit = role === 'keeper' ? 1 : Number(role === 'field' ? config.fieldPlayers : config.benchSize);
  if (lineup.filter(p => p.personId !== id && p.role === role).length >= limit) throw new Error('Dieser Bereich ist voll. Ziehe auf eine Spielerin oder tippe sie an, um die Plätze zu tauschen.');
  const spot = slots(config.formation).find(s => s.role === role && !lineup.some(p => p.personId !== id && p.role !== 'bench' && Math.hypot(p.x - s.x, p.y - s.y) < 10));
  const position = role === 'keeper' ? 'TW' : role === 'bench' ? '' : source.role === 'field' ? source.position : spot?.position || 'ZM';
  const x = Number.isFinite(target.x) ? target.x : spot?.x ?? source.x;
  const y = Number.isFinite(target.y) ? target.y : spot?.y ?? source.y;
  return movePlayer(lineup.map(p => p.personId === id ? { ...p, role, position } : p), id, x, y);
}

export const FORMATIONS = {
  2: ['1-1'],
  3: ['2-1', '1-2'],
  4: ['2-2', '1-2-1', '2-1-1'],
  5: ['2-2-1', '2-1-2', '1-3-1', '3-1-1', '1-2-2'],
  6: ['3-2-1', '2-3-1', '2-2-2', '3-1-2', '2-1-2-1'],
  7: ['3-3-1', '3-2-2', '2-3-2', '2-4-1', '4-2-1', '2-2-2-1'],
  8: ['3-3-2', '3-2-3', '2-4-2', '4-3-1', '3-4-1', '2-3-2-1'],
  9: ['4-3-2', '3-4-2', '3-3-3', '4-2-3', '4-4-1', '3-2-3-1'],
  10: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1', '4-5-1', '3-3-3-1'],
};
export function leadership(lineup, captainId, viceCaptainIds = []) {
  const ids = lineup.map(p => p.personId);
  const order = [captainId, ...viceCaptainIds].filter(id => id && ids.includes(id));
  return { captainId: order[0] || '', viceCaptainIds: order.slice(1, 3) };
}
export function reconfigure(lineup, config) {
  if (lineup.filter(p => p.role === 'field').length > Number(config.fieldPlayers) || lineup.filter(p => p.role === 'bench').length > Number(config.benchSize)) {
    throw new Error('Bitte zuerst überzählige Spielerinnen aus Feld oder Ersatzbank entfernen.');
  }
  const places = slots(config.formation); let fieldIndex = 1;
  return lineup.map(p => p.role === 'bench' ? p : { ...p, ...(p.role === 'keeper' ? places[0] : places[fieldIndex++]) });
}
