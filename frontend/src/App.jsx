import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

export default function App() {
  /* --- States für Spieler und Trainings --- */
  const [players, setPlayers] = useState([]);
  const [trainings, setTrainings] = useState([]);

  /* Toggle, ob die Spieler-Verwaltung sichtbar ist */
  const [showPlayers, setShowPlayers] = useState(false);

  /* Eingabefelder für neue Nutzer */
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler'); // Standard: Spieler

  /* --- API-Aufrufe beim Mounten --- */
  useEffect(() => {
    fetch(API + '/players')
      .then((res) => res.json())
      .then(setPlayers)
      .catch((err) => console.error('Fehler beim Laden der Spieler:', err));

    fetch(API + '/trainings')
      .then((res) => res.json())
      .then(setTrainings)
      .catch((err) => console.error('Fehler beim Laden der Trainings:', err));
  }, []);

  /* --- Alle Änderungen speichern (POST /players, /trainings) --- */
  const saveAll = () => {
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: players }),
    }).catch((err) => console.error('Fehler /players POST:', err));

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: trainings }),
    }).catch((err) => console.error('Fehler /trainings POST:', err));
  };

  /* --- Neuen Spieler/Trainer hinzufügen --- */
  const addPlayer = () => {
    const trimmed = newName.trim();
    if (trimmed !== '') {
      const isTrainer = newRole === 'Trainer';
      setPlayers([...players, { name: trimmed, isTrainer }]);
      setNewName('');
      setNewRole('Spieler');
    }
  };

  /* --- Rolle zwischen Spieler/Trainer umschalten --- */
  const toggleTrainer = (index) => {
    const updated = [...players];
    updated[index].isTrainer = !updated[index].isTrainer;
    setPlayers(updated);
  };

  /* --- Spieler/Trainer löschen --- */
  const deletePlayer = (index) => {
    if (window.confirm('Nutzer wirklich löschen?')) {
      const updated = [...players];
      updated.splice(index, 1);
      setPlayers(updated);
    }
  };

  /* --- Neues Training hinzufügen (nur deutsches Datum, kein KW) --- */
  const addTraining = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const formatted = `${day}.${month}.${year}`; // deutsches Format
    setTrainings([...trainings, { date: formatted, participants: {}, trainer: [] }]);
  };

  /* --- Training löschen --- */
  const deleteTraining = (index) => {
    if (window.confirm('Training wirklich löschen?')) {
      const updated = [...trainings];
      updated.splice(index, 1);
      setTrainings(updated);
    }
  };

  /* --- Teilnahme-Status aktualisieren (Icon wird in Text umgewandelt beim Rendern) --- */
  const updateParticipation = (tIndex, name, statusIcon) => {
    const updated = [...trainings];
    updated[tIndex].participants[name] = statusIcon;
    setTrainings(updated);
  };

  /* --- Trainer im Training markieren bzw. abwählen --- */
  const toggleTrainerInTraining = (tIndex, name) => {
    const updated = [...trainings];
    const current = updated[tIndex].trainer || [];
    updated[tIndex].trainer = current.includes(name)
      ? current.filter((n) => n !== name)
      : [...current, name];
    setTrainings(updated);
  };

  /* --- Spieler sortieren: Trainer zuerst, dann alphabetisch --- */
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = sortedPlayers.sort((a, b) => b.isTrainer - a.isTrainer);

  /* --- Hilfsfunktion: Icon → Text (deutsch, Großschreibung) --- */
  const iconToText = (icon) => {
    switch (icon) {
      case '✅':
        return ' TEILNEHMEND';
      case '❌':
        return ' ABWESEND';
      case '⏳':
        return ' ENTSCHULDIGT';
      default:
        return '';
    }
  };

  return (
    <div className="App">
      <header>
        <h1>⚽ Fußball Training</h1>
      </header>

      {/* --- Obere Buttons: Training hinzufügen, Spieler/Trainer verwalten, Speichern --- */}
      <div className="controls">
        <button onClick={addTraining}>➕ Training hinzufügen</button>
        <button onClick={() => setShowPlayers(!showPlayers)}>👥 Nutzer verwalten</button>
        <button onClick={saveAll}>💾 Änderungen speichern</button>
      </div>

      {/* --- Spieler- und Trainer-Verwaltung (Dropdown und Liste) --- */}
      {showPlayers && (
        <section className="player-management">
          <h2>Spieler &amp; Trainer verwalten</h2>
          <div className="add-player-form">
            <input
              type="text"
              placeholder="Name eingeben"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="Spieler">Spieler</option>
              <option value="Trainer">Trainer</option>
            </select>
            <button onClick={addPlayer}>➕ Hinzufügen</button>
          </div>

          <ul className="player-list">
            {trainersFirst.map((p, i) => (
              <li key={i}>
                <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>
                  {p.name}
                </span>
                <div>
                  <button className="btn-toggle" onClick={() => toggleTrainer(i)}>
                    {p.isTrainer ? '🧒 Als Spieler markieren' : '👔 Als Trainer markieren'}
                  </button>
                  <button className="btn-delete" onClick={() => deletePlayer(i)}>
                    ❌ Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Liste aller Trainings --- */}
      <section className="trainings-list">
        {trainings.map((t, tIndex) => (
          <div key={tIndex} className="training">
            <h3
              className="training-header"
              onClick={() => {
                const updated = [...trainings];
                updated[tIndex].expanded = !updated[tIndex].expanded;
                setTrainings(updated);
              }}
            >
              📅 {t.date} {t.expanded ? '🔽' : '▶️'}
            </h3>

            {t.expanded && (
              <div className="training-details">
                {trainersFirst.map((p, pIndex) => {
                  const statusIcon = t.participants[p.name] || '';
                  return (
                    <div key={pIndex} className="participant">
                      <span>
                        {p.name}
                        <em className="status-text">{iconToText(statusIcon)}</em>
                      </span>
                      {p.isTrainer ? (
                        <button
                          className={
                            t.trainer?.includes(p.name)
                              ? 'btn-part-trainer active'
                              : 'btn-part-trainer'
                          }
                          onClick={() => toggleTrainerInTraining(tIndex, p.name)}
                        >
                          {t.trainer?.includes(p.name) ? '✅ Trainer' : '👔 Trainer'}
                        </button>
                      ) : (
                        <div className="btn-part-status">
                          {['✅', '❌', '⏳', '—'].map((icon) => (
                            <button
                              key={icon}
                              className={statusIcon === icon ? 'active' : ''}
                              onClick={() => updateParticipation(tIndex, p.name, icon)}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="btn-delete-training" onClick={() => deleteTraining(tIndex)}>
                  🗑️ Training löschen
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* --- Dropdown mit Ersteller-Info --- */}
      <div className="creator-dropdown">
        <label htmlFor="creatorInfo">Ersteller Info: </label>
        <select id="creatorInfo" onChange={() => {}} defaultValue="info">
          <option disabled value="info">
            Ersteller: Matthias Kopf – matthias@head-mail.com
          </option>
          <option value="mail">E-Mail kopieren &rarr;</option>
        </select>
      </div>

      {/* --- Footer mit Kontakt-Info --- */}
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> &nbsp;|&nbsp; Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
      </footer>
    </div>
  );
}
