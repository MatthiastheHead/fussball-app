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
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g, ' ').trim();
}

const absoluteTeamUrl = href => {
  if (!href) return '';
  if (href.startsWith('https://www.fussball.de/')) return href;
  if (href.startsWith('/')) return `https://www.fussball.de${href}`;
  return '';
};

function cleanVenue(value) {
  return plain(value)
    .replace(/^\d{2}\.\d{2}\.\d{4}\s*(?:-|·)?\s*(?:[0-2]\d:[0-5]\d\s*Uhr?)?\s*/i, '')
    .replace(/^(?:[0-2]\d:[0-5]\d\s*Uhr?)\s*(?:-|·)?\s*/i, '')
    .replace(/\s+(?:\d{2}\.\d{2}\.\d{4})(?:\s*-\s*[0-2]\d:[0-5]\d\s*Uhr?)?.*$/i, '')
    .trim()
    .slice(0, 200);
}

function venueFromBlock(block) {
  const patterns = [
    /<(?:td|div|span)\b[^>]*class="[^"]*(?:venue|location|spielstaette|spielstätte|address)[^"]*"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/i,
    /(?:Spielstätte|Spielstaette|Spielort)\s*:?\s*<[^>]*>([\s\S]*?)<\//i,
  ];
  for (const pattern of patterns) {
    const value = cleanVenue(block.match(pattern)?.[1] || '');
    if (value && value.length <= 200) return value;
  }
  const text = plain(block);
  const match = text.match(/(?:Spielstätte|Spielort)\s*:?\s*(.{3,180}?)(?=\s+(?:Info|Zum Spiel|$))/i);
  return match ? cleanVenue(match[1]) : '';
}

function parseVenue(html) {
  const text = plain(html);
  const index = text.indexOf('Spielstätten');
  if (index < 0) return '';
  const section = text.slice(index, index + 2200);
  const match = section.match(/(?:Von\s*-\s*Bis\s*)?(.{3,90}?)\s*,\s*(.{3,130}?\b\d{5}\b\s+.{2,80}?)\s+Adresse/i);
  if (!match) return '';
  return cleanVenue(`${match[1].trim()}, ${match[2].trim()}`);
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
    results.push({
      opponent,
      date,
      time,
      location: venueFromBlock(block),
      home: own === 0,
      opponentTeamUrl: absoluteTeamUrl(clubs[1 - own][1]),
      homeTeamUrl: absoluteTeamUrl(clubs[0][1]),
      fussballGameId: gameId,
      fussballTeamId: teamId,
    });
    if (results.length >= 50) break;
  }
  if (!results.length) fail('Keine lesbaren Spieltermine gefunden. Bitte den Spielplan direkt öffnen oder das Spiel manuell anlegen.');
  return results;
}

async function readText(response, maxBytes = 2 * 1024 * 1024) {
  if (!response.ok) fail('FUSSBALL.DE ist gerade nicht erreichbar oder erlaubt den Abruf nicht. Bitte später erneut versuchen.');
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) fail('Die Antwort von FUSSBALL.DE ist zu groß.');
    return text;
  }
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) fail('Die Antwort von FUSSBALL.DE ist zu groß.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}

async function getHtml(url, fetcher) {
  const response = await fetcher(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html', 'User-Agent': 'SquadHQ/12.0 (schedule and opponent reader)' },
  });
  return readText(response);
}

const cache = new Map();

async function fetchGames(source, fetcher = fetch) {
  const url = teamUrl(source);
  if (!url) fail('Ein Admin muss zuerst einen Mannschaftslink hinterlegen.');
  const cached = cache.get(`games:${url}`);
  if (cached && Date.now() - cached.at < 60000) return cached.result;
  const teamId = url.split('/').at(-1);
  const matchplanUrl = `https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/show-venues/true/team-id/${teamId}`;
  let html;
  try { html = await getHtml(matchplanUrl, fetcher); }
  catch { html = await getHtml(url, fetcher); }
  const games = parseGames(html, url);
  const venueCache = new Map();
  for (const game of games) {
    if (game.location || !game.homeTeamUrl) continue;
    if (!venueCache.has(game.homeTeamUrl)) {
      try { venueCache.set(game.homeTeamUrl, parseVenue(await getHtml(game.homeTeamUrl, fetcher))); }
      catch { venueCache.set(game.homeTeamUrl, ''); }
    }
    game.location = venueCache.get(game.homeTeamUrl) || '';
  }
  const result = { source: url, fetchedAt: new Date().toISOString(), games };
  if (cache.size >= 20) cache.delete(cache.keys().next().value);
  cache.set(`games:${url}`, { at: Date.now(), result });
  return result;
}

function parsePreviousRefs(html, teamId) {
  const refs = [], seen = new Set();
  const blocks = html.split(/<tr\b[^>]*class="[^"]*row-headline[^"]*"[^>]*>/i).slice(1);
  for (const block of blocks) {
    const link = block.match(/href="(https:\/\/www\.fussball\.de\/spiel\/[^"\s]*\/-\/spiel\/([A-Z0-9]{32}))"/i);
    if (!link || seen.has(link[2])) continue;
    const clubs = [...block.matchAll(/<a\b[^>]*href="([^"]*\/mannschaft\/[^"\s]+)"[^>]*>[\s\S]*?<div\b[^>]*class="club-name"[^>]*>([\s\S]*?)<\/div>/gi)].slice(0, 2);
    if (clubs.length !== 2) continue;
    const own = clubs.findIndex(c => c[1].includes(`/team-id/${teamId}`));
    if (own < 0) continue;
    const header = plain(block.split('</tr>')[0]);
    const dateMatch = header.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    refs.push({
      url: link[1],
      id: link[2],
      date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : '',
      opponent: plain(clubs[1 - own][2]),
      home: own === 0,
    });
    seen.add(link[2]);
    if (refs.length >= 12) break;
  }
  return refs;
}

function decodeAttribute(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function countGoals(value) {
  const raw = decodeAttribute(value);
  let parsed;
  for (const candidate of [raw, raw.replace(/'/g, '"')]) {
    try { parsed = JSON.parse(candidate); break; } catch {}
  }
  let home = 0, away = 0;
  const walk = node => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    if (node.type === 'goal' && node.team === 'home') home++;
    if (node.type === 'goal' && node.team === 'away') away++;
    Object.values(node).forEach(walk);
  };
  if (parsed) walk(parsed);
  return parsed ? { home, away } : null;
}

function scoreFromGamePage(html) {
  const attribute = html.match(/data-match-events=(?:"([^"]*)"|'([^']*)')/i);
  const counted = countGoals(attribute?.[1] || attribute?.[2] || '');
  if (counted && (counted.home || counted.away)) return counted;
  const dataScore = html.match(/(?:data-result|data-score|data-final-score)=(?:"|')(\d{1,2})\s*:\s*(\d{1,2})(?:"|')/i);
  if (dataScore) return { home: Number(dataScore[1]), away: Number(dataScore[2]) };
  const text = plain(html);
  const final = text.match(/(?:Endstand|Ergebnis|Endergebnis)\s*(\d{1,2})\s*:\s*(\d{1,2})/i);
  return final ? { home: Number(final[1]), away: Number(final[2]) } : null;
}

function previousSeasonPosition(html, source) {
  const season = teamUrl(source).match(/\/saison\/(\d{2})(\d{2})\//);
  if (!season) return null;
  const start = Number(season[1]);
  const previous = `${String((start + 99) % 100).padStart(2, '0')}/${String(start).padStart(2, '0')}`;
  const text = plain(html);
  const index = text.indexOf(`Saison ${previous}`);
  if (index < 0) return { season: previous, position: null };
  const section = text.slice(index, index + 800);
  const match = section.match(/(\d{1,2})\.\s*PLATZ/i);
  return { season: previous, position: match ? Number(match[1]) : null };
}

function formSummary(games) {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  for (const game of games) {
    goalsFor += game.goalsFor; goalsAgainst += game.goalsAgainst;
    if (game.goalsFor > game.goalsAgainst) wins++;
    else if (game.goalsFor === game.goalsAgainst) draws++;
    else losses++;
  }
  const score = games.length ? Math.round((wins * 3 + draws) / (games.length * 3) * 100) : null;
  const label = score === null ? 'Keine Daten' : score >= 80 ? 'Sehr stark' : score >= 65 ? 'Stark' : score >= 45 ? 'Solide' : score >= 25 ? 'Durchwachsen' : 'Schwach';
  return { played: games.length, wins, draws, losses, goalsFor, goalsAgainst, score, label };
}

async function fetchOpponentAnalysis(source, fetcher = fetch) {
  const url = teamUrl(source);
  const cached = cache.get(`analysis:${url}`);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.result;
  const teamId = url.split('/').at(-1);
  const [teamHtml, previousHtml] = await Promise.all([
    getHtml(url, fetcher),
    getHtml(`https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`, fetcher),
  ]);
  const refs = parsePreviousRefs(previousHtml, teamId);
  const games = [];
  for (const ref of refs) {
    try {
      const score = scoreFromGamePage(await getHtml(ref.url, fetcher));
      if (!score) continue;
      const goalsFor = ref.home ? score.home : score.away;
      const goalsAgainst = ref.home ? score.away : score.home;
      games.push({ ...ref, goalsFor, goalsAgainst, result: goalsFor > goalsAgainst ? 'S' : goalsFor === goalsAgainst ? 'U' : 'N' });
    } catch {}
    if (games.length >= 10) break;
  }
  const result = {
    source: url,
    fetchedAt: new Date().toISOString(),
    venue: parseVenue(teamHtml),
    lastGames: games.slice(0, 5),
    form: formSummary(games.slice(0, 5)),
    season: formSummary(games),
    previousSeason: previousSeasonPosition(teamHtml, url),
  };
  if (cache.size >= 20) cache.delete(cache.keys().next().value);
  cache.set(`analysis:${url}`, { at: Date.now(), result });
  return result;
}

module.exports = { DEFAULT_TEAM_URL, teamUrl, plain, parseVenue, parseGames, fetchGames, fetchOpponentAnalysis, parsePreviousRefs, scoreFromGamePage };
