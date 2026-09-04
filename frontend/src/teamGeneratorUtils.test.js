import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBalancedTeams,
  selectGeneratorPlayers,
  shufflePlayers,
} from './teamGeneratorUtils.js';

test('übernimmt nur aktive Spielerinnen aus der Mannschaftsliste', () => {
  const players = [
    { name: 'Mia', isTrainer: false, inactive: false },
    { name: 'Anna', isTrainer: false, inactive: false },
    { name: 'Lea', isTrainer: false, inactive: true },
    { name: 'Matthias', isTrainer: true, inactive: false },
  ];

  assert.deepEqual(
    selectGeneratorPlayers(players).map((player) => player.name),
    ['Anna', 'Mia']
  );
});

test('mischt Spielerinnen ohne die ursprüngliche Liste zu verändern', () => {
  const names = ['Anna', 'Mia', 'Lea', 'Paula'];
  const shuffled = shufflePlayers(names, () => 0);

  assert.deepEqual(names, ['Anna', 'Mia', 'Lea', 'Paula']);
  assert.deepEqual([...shuffled].sort(), [...names].sort());
  assert.notDeepEqual(shuffled, names);
});

test('verteilt alle Spielerinnen möglichst gleichmäßig auf zwei bis vier Teams', () => {
  const names = ['Anna', 'Mia', 'Lea', 'Paula', 'Stella', 'Frieda', 'Nele'];

  [2, 3, 4].forEach((teamCount) => {
    const teams = createBalancedTeams(names, teamCount, () => 0.42);
    const sizes = teams.map((team) => team.players.length);
    const assignedNames = teams.flatMap((team) => team.players);

    assert.equal(teams.length, teamCount);
    assert.equal(new Set(assignedNames).size, names.length);
    assert.deepEqual([...assignedNames].sort(), [...names].sort());
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  });
});
