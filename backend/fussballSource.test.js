const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TEAM_URL, teamUrl, parseGames, fetchGames } = require('./fussballSource');
const own = DEFAULT_TEAM_URL.split('/').at(-1), other = 'A'.repeat(32), gameId = 'B'.repeat(32);
function fixture({ date = '27.09.2026', time = '10:00', home = other, away = own } = {}) {
  return `<tr class="row-headline visible-small"><td>Sonntag, ${date} - ${time} Uhr | Verbandsliga</td></tr><tr><td><a href="https://www.fussball.de/mannschaft/gast/-/saison/2627/team-id/${home}"><div class="club-name">Gast &amp; Verein</div></a></td><td><a href="https://www.fussball.de/mannschaft/team/-/saison/2627/team-id/${away}"><div class="club-name">Heimverein</div></a></td><td><a href="https://www.fussball.de/spiel/test/-/spiel/${gameId}">Zum Spiel</a></td></tr>`;
}
test('Mannschaftslink wird normalisiert; fremde Hosts, Zugangsdaten und falsche Pfade werden abgewiesen', () => {
  assert.equal(teamUrl(DEFAULT_TEAM_URL + '#!/'), DEFAULT_TEAM_URL);
  assert.equal(teamUrl(DEFAULT_TEAM_URL.replace('www.', '')), DEFAULT_TEAM_URL);
  assert.equal(teamUrl(''), '');
  for (const value of ['http://localhost', DEFAULT_TEAM_URL.replace('www.fussball.de','www.fussball.de.evil.test'), DEFAULT_TEAM_URL.replace('https://','https://user:pass@'), DEFAULT_TEAM_URL+'?redirect=localhost', 'javascript:alert(1)', DEFAULT_TEAM_URL.replace('team-id','club-id')]) assert.throws(() => teamUrl(value));
});
test('Spielabruf erkennt Heim/Gast und Datumswerte ohne Ergebnisse zu entschlüsseln', () => {
  const result = parseGames(fixture() + fixture(), DEFAULT_TEAM_URL);
  assert.equal(result.length, 1); assert.equal(result[0].opponent, 'Gast & Verein'); assert.equal(result[0].home, false);
  assert.equal(result[0].date, '2026-09-27'); assert.equal(result[0].time, '10:00'); assert.equal(result[0].location, '');
  assert.equal(parseGames(fixture({home:own,away:other}),DEFAULT_TEAM_URL)[0].home,true);
  for (const html of ['<html>Technische Störung</html>', fixture({date:'31.02.2026'}), fixture({time:'29:00'}), fixture({home:other,away:other})]) assert.throws(() => parseGames(html,DEFAULT_TEAM_URL), /Keine lesbaren/);
});
test('Abruf begrenzt Antwortgröße und lehnt Fehlerseiten ab, erfolgreiche Daten werden kurz zwischengespeichert', async () => {
  await assert.rejects(fetchGames(DEFAULT_TEAM_URL, async () => new Response('Nicht erlaubt', {status:403})), /erreichbar/);
  await assert.rejects(fetchGames(DEFAULT_TEAM_URL, async () => new Response('{}', {headers:{'content-type':'application/json'}})), /lesbaren/);
  await assert.rejects(fetchGames(DEFAULT_TEAM_URL, async () => new Response('x'.repeat(2100000), {headers:{'content-type':'text/html'}})), /groß/);
  let calls=0;
  const result=await fetchGames(DEFAULT_TEAM_URL,async (url,options)=>{calls++;assert.equal(url,DEFAULT_TEAM_URL);assert.equal(options.redirect,'error');return new Response(fixture(),{headers:{'content-type':'text/html'}});});
  assert.equal(result.games.length,1);assert.equal(result.source,DEFAULT_TEAM_URL);
  await fetchGames(DEFAULT_TEAM_URL,async()=>{calls++;throw new Error('should not fetch');});assert.equal(calls,1);
});
