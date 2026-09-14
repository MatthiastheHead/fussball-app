import test from 'node:test';
import assert from 'node:assert/strict';
import { transferPlayer, suggest } from './squadUtils.js';
const config = { fieldPlayers: 2, benchSize: 1, formation: '1-1' };
const lineup = [
  { personId: 'k', name: 'Keeper', role: 'keeper', position: 'TW', x: 50, y: 89 },
  { personId: 'a', name: 'A', role: 'field', position: 'IV', x: 50, y: 70 },
  { personId: 'b', name: 'B', role: 'field', position: 'ST', x: 50, y: 18 },
  { personId: 'c', name: 'C', role: 'bench', position: '', x: 50, y: 50 },
];
test('swaps full bench and field in both directions preserving identity and slot', () => {
  const swapped = transferPlayer(lineup, 'c', { personId: 'a' }, config);
  assert.deepEqual(swapped.find(p => p.personId === 'c'), { ...lineup[3], role: 'field', position: 'IV', x: 50, y: 70 });
  assert.equal(swapped.find(p => p.personId === 'a').role, 'bench');
  assert.deepEqual(transferPlayer(swapped, 'c', { personId: 'a' }, config), lineup);
  assert.equal(lineup[3].role, 'bench');
});
test('keeper swaps retain exactly one goalkeeper and limits reject unmatched moves', () => {
  const swapped = transferPlayer(lineup, 'c', { personId: 'k' }, config);
  assert.equal(swapped.find(p => p.personId === 'c').position, 'TW');
  assert.equal(swapped.filter(p => p.role === 'keeper').length, 1);
  for (const [id, role] of [['c', 'field'], ['a', 'bench'], ['a', 'keeper']]) assert.throws(() => transferPlayer(lineup, id, { role }, config), /voll/);
});
test('moves into free zones, clamps coordinates, and keeps teammates unchanged', () => {
  const moved = transferPlayer(lineup.filter(p => p.personId !== 'a'), 'c', { role: 'field', x: -10, y: 120 }, config);
  assert.equal(moved.find(p => p.personId === 'c').x, 5);
  assert.equal(moved.find(p => p.personId === 'c').y, 95);
  assert.equal(moved.find(p => p.personId === 'c').role, 'field');
  assert.deepEqual(moved.find(p => p.personId === 'k'), lineup[0]);
  const bench = transferPlayer(lineup.filter(p => p.personId !== 'c'), 'a', { role: 'bench' }, config);
  assert.equal(bench.find(p => p.personId === 'a').role, 'bench');
});
test('generated proposals support the same bench swaps without losing anyone', () => {
  const people = lineup.map(p => ({ id: p.personId, name: p.name, mainPosition: p.position }));
  const proposed = suggest(people, people.map(p => ({ id: p.id, total: 5, attendance: 1, average: 3 })), '1-1', 1);
  const bench = proposed.find(p => p.role === 'bench'), field = proposed.find(p => p.role === 'field');
  const changed = transferPlayer(proposed, bench.personId, { personId: field.personId }, config);
  assert.equal(changed.find(p => p.personId === bench.personId).role, 'field');
  assert.deepEqual(changed.map(p => p.personId), proposed.map(p => p.personId));
});
