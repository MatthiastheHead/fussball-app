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
  const pool = people.filter(p => !p.inactive && !p.guest && score(stats.find(s => s.id === p.id)) !== null)
    .sort((a, b) => score(stats.find(s => s.id === b.id)) - score(stats.find(s => s.id === a.id)) || a.name.localeCompare(b.name, 'de'));
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
    lineup.push({ ...slot, personId: person.id, name: person.name, guest: false });
  }
  return [...lineup, ...pool.slice(0, benchSize).map(p => ({ personId: p.id, name: p.name, guest: false, role: 'bench', position: p.mainPosition || '', x: 50, y: 50 }))];
}
export function movePlayer(lineup, id, x, y) {
  return lineup.map(row => row.personId === id ? { ...row, x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) } : row);
}
