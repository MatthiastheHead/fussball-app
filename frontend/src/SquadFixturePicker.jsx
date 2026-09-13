import React, { useState } from 'react';
export default function SquadFixturePicker({ request, source, games, disabled, onSelect }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(''); setResult(null);
    try { const res = await request('squads/fixtures', { cache: 'no-store' }); const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Abruf fehlgeschlagen.'); setResult(json); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  return <section className="cash-entry-section">
    <h2>Spieltermine übernehmen</h2>
    <p>Ruft die auf der Mannschaftsseite sichtbaren Termine ab, nicht zwingend den gesamten Saisonspielplan. Spielort und Termin vor dem Speichern prüfen. Keine automatische Aktualisierung bereits angelegter Spiele.</p>
    <div className="task-toolbar"><button className="btn-edit" disabled={disabled || loading || !source} onClick={load}>{loading ? 'Termine werden abgerufen …' : 'Spiele abrufen'}</button>{source && <a href={result?.source || source} target="_blank" rel="noopener noreferrer">Mannschaftsseite öffnen</a>}</div>
    {!source && <p>Ein Admin kann den Mannschaftslink in den Einstellungen hinterlegen.</p>}
    {error && <p role="alert" className="login-error">{error}</p>}
    {result && <><p className="squad-help">Abgerufen: {new Date(result.fetchedAt).toLocaleString('de-DE')}. Auch vorläufige Termine sind möglich.</p><div className="squad-games">{result.games.map(f => {
      const existing = games.find(g => g.fussballGameId === f.fussballGameId && g.fussballTeamId === f.fussballTeamId);
      return <button className="squad-game" key={f.fussballGameId} disabled={disabled || loading} onClick={() => onSelect(existing, f)}><strong>{f.opponent}</strong><span>{f.date.split('-').reverse().join('.')} · {f.time}</span><small>{f.home ? 'Heimspiel' : 'Auswärtsspiel'}</small><span>{existing ? 'Angelegtes Spiel öffnen' : 'Als Entwurf übernehmen'}</span></button>;
    })}</div></>}
  </section>;
}
