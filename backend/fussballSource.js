const DEFAULT_TEAM_URL = 'https://www.fussball.de/mannschaft/vfb-werther-1920-vfb-werther-1920-thueringen/-/saison/2627/team-id/02VC42N92C000000VS5489BRVVAJ17OC';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function teamUrl(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 600) fail('Bitte einen gültigen FUSSBALL.DE-Mannschaftslink eingeben.');
  let url; try { url = new URL(value.trim()); } catch { fail('Ungültiger Mannschaftslink.'); }
  if (url.protocol !== 'https:' || !['www.fussball.de', 'fussball.de'].includes(url.hostname) || url.port || url.username || url.password || url.search || !/^\/mannschaft\/[a-z0-9-]+\/-\/saison\/\d{4}\/team-id\/[A-Z0-9]{32}\/?$/.test(url.pathname)) fail('Bitte den HTTPS-Mannschaftslink von FUSSBALL.DE einschließlich Saison und Team-ID verwenden.');
  return `https://www.fussball.de${url.pathname.replace(/\/$/, '')}`;
}
function plain(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g, ' ').trim();
}
function parseGames(html, source) {
  const url = teamUrl(source), teamId = url.split('/').at(-1), results = [], seen = new Set();
  const blocks = html.split(/<tr\b[^>]*class="[^"]*row-headline[^"]*"[^>]*>/i).slice(1);
  for (const block of blocks) {
    const header = plain(block.split('</tr>')[0]);
    const dateMatch = header.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*([0-2]\d:[0-5]\d)\s*Uhr/);
    const clubs = [...block.matchAll(/<a\b[^>]*href="([^"]*\/mannschaft\/[^"\s]+)"[^>]*>[\s\S]*?<div\b[^>]*class="club-name"[^>]*>([\s\S]*?)<\/div>/gi)].slice(0, 2);
    const gameId = block.match(/href="https:\/\/www\.fussball\.de\/spiel\/[^"\s]*\/-\/spiel\/([A-Z0-9]{32})"/i)?.[1];
    if (!dateMatch || clubs.length !== 2 || !gameId || seen.has(gameId)) continue;
    const own = clubs.findIndex(c => c[1].includes(`/team-id/${teamId}`));
    if (own < 0) continue;
    const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, time = dateMatch[4];
    if (!require('./squadUtils').validDate(date) || Number(time.slice(0, 2)) > 23) continue;
    const opponent = plain(clubs[1 - own][2]);
    if (!opponent || opponent.length > 100) continue;
    seen.add(gameId);
    results.push({ opponent, date, time, location: '', home: own === 0, fussballGameId: gameId, fussballTeamId: teamId });
    if (results.length >= 50) break;
  }
  if (!results.length) fail('Keine lesbaren Spieltermine gefunden. Bitte den Spielplan direkt öffnen oder das Spiel manuell anlegen.');
  return results;
}
const cache = new Map();
async function fetchGames(source, fetcher = fetch) {
  const url = teamUrl(source);
  if (!url) fail('Ein Admin muss zuerst einen Mannschaftslink hinterlegen.');
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < 60000) return cached.result;
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html', 'User-Agent': 'SquadHQ/10.1 (team schedule reader)' } });
  if (!response.ok) fail('FUSSBALL.DE ist gerade nicht erreichbar oder erlaubt den Abruf nicht. Bitte später erneut versuchen.');
  if (!response.headers.get('content-type')?.includes('text/html')) fail('FUSSBALL.DE hat keinen lesbaren Spielplan geliefert.');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) fail('Der Spielplan ist zu groß.'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  const result = { source: url, fetchedAt: new Date().toISOString(), games: parseGames(Buffer.concat(chunks).toString('utf8'), url) };
  if (cache.size >= 10) cache.delete(cache.keys().next().value);
  cache.set(url, { at: Date.now(), result }); return result;
}
module.exports = { DEFAULT_TEAM_URL, teamUrl, parseGames, fetchGames };
