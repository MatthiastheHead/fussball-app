// The persisted profile is the single source of truth for shirt numbers.
// Link by player ID, never by name, and expose no other profile information.
function withPlayerNumbers(players, profiles = []) {
  const numbers = new Map(profiles.filter(p => p.playerId).map(p => [String(p.playerId), p.number]));
  return players.map(player => {
    const number = numbers.get(String(player._id));
    return { ...player, number: !player.isTrainer && typeof number === 'string' && /^\d{1,2}$/.test(number) ? number : '' };
  });
}
module.exports = { withPlayerNumbers };
