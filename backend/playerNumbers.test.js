const test = require('node:test');
const assert = require('node:assert/strict');
const { withPlayerNumbers } = require('./playerNumbers');

test('numbers follow permanent player IDs without exposing profile data or changing names', () => {
  const players = [{ _id: 'a', name: 'Player renamed' }, { _id: 'b', name: 'Player B' }];
  const result = withPlayerNumbers(players, [{ playerId: 'a', number: '15', note: 'private' }, { playerId: '', number: '99', name: 'Player B' }]);
  assert.deepEqual(result, [{ _id: 'a', name: 'Player renamed', number: '15' }, { _id: 'b', name: 'Player B', number: '' }]);
  assert.equal(players[0].number, undefined);
});

test('missing profiles, trainers and invalid numbers remain empty; zero is supported', () => {
  assert.equal(withPlayerNumbers([{ _id: 'a' }])[0].number, '');
  assert.equal(withPlayerNumbers([{ _id: 'a', isTrainer: true }], [{ playerId: 'a', number: '3' }])[0].number, '');
  for (const number of ['100', '<b>', null, undefined]) assert.equal(withPlayerNumbers([{ _id: 'a' }], [{ playerId: 'a', number }])[0].number, '');
  assert.equal(withPlayerNumbers([{ _id: 'a' }], [{ playerId: 'a', number: '0' }])[0].number, '0');
});
