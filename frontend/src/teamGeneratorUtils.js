export const TEAM_DEFINITIONS = [
  { name: 'Team Blau', color: '#247dc7' },
  { name: 'Team Rot', color: '#c94851' },
  { name: 'Team Grün', color: '#238e5b' },
  { name: 'Team Orange', color: '#c66d18' },
];

export function selectGeneratorPlayers(players) {
  return [...players]
    .filter((player) => !player.isTrainer && !player.inactive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function shufflePlayers(playerNames, random = Math.random) {
  const shuffled = [...playerNames];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function createBalancedTeams(playerNames, requestedTeamCount, random = Math.random) {
  const teamCount = Math.max(
    2,
    Math.min(TEAM_DEFINITIONS.length, Math.trunc(Number(requestedTeamCount)) || 2)
  );
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    ...TEAM_DEFINITIONS[index],
    players: [],
  }));

  shufflePlayers(playerNames, random).forEach((name, index) => {
    teams[index % teamCount].players.push(name);
  });

  return teams;
}
