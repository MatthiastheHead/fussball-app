export const TEAM_DEFINITIONS = [
  { name: 'Team Orange', color: '#c66d18', secondaryColor: '#e7a13f', theme: 'orange' },
  { name: 'Team Grau', color: '#596775', secondaryColor: '#87929d', theme: 'gray' },
  { name: 'Team Bunt', color: '#7651c9', secondaryColor: '#1797a5', theme: 'mixed' },
  { name: 'Team Bunt 2', color: '#b4458d', secondaryColor: '#287fcc', theme: 'mixed' },
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
    name:
      teamCount === 4 && index === 2
        ? 'Team Bunt 1'
        : TEAM_DEFINITIONS[index].name,
    players: [],
  }));

  shufflePlayers(playerNames, random).forEach((name, index) => {
    teams[index % teamCount].players.push(name);
  });

  return teams;
}
