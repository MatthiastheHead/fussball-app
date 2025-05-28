import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

export default function App() {
  const [players, setPlayers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [showPlayers, setShowPlayers] = useState(false);
  const [newPlayer, setNewPlayer] = useState('');
  const [newTraining, setNewTraining] = useState({ date: '', participants: {}, trainer: [] });

  useEffect(() => {
    fetch(API + '/players').then(res => res.json()).then(setPlayers);
    fetch(API + '/trainings').then(res => res.json()).then(setTrainings);
  }, []);

  const saveAll = () => {
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: players })
    });

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: trainings })
    });
  };

  const addPlayer = () => {
    if (newPlayer.trim() !== '') {
      setPlayers([...players, { name: newPlayer.trim(), isTrainer: false }]);
      setNewPlayer('');
    }
  };

  const toggleTrainer = (index) => {
    const updated = [...players];
    updated[index].isTrainer = !updated[index].isTrainer;
    setPlayers(updated);
  };

  const deletePlayer = (index) => {
    if (window.confirm('Spieler wirklich löschen?')) {
      const updated = [...players];
      updated.splice(index, 1);
      setPlayers(updated);
    }
  };

  const addTraining = () => {
    const date = new Date().toISOString().split('T')[0];
    const week = `KW ${Math.ceil((new Date().getDate() - new Date(date).getDay() + 10) / 7)}`;
    const formatted = `${date} (${week})`;
    setTrainings([...trainings, { date: formatted, participants: {}, trainer: [] }]);
  };

  const deleteTraining = (index) => {
    if (window.confirm('Training wirklich löschen?')) {
      const updated = [...trainings];
      updated.splice(index, 1);
      setTrainings(updated);
    }
  };

  const updateParticipation = (tIndex, name, status) => {
    const updated = [...trainings];
    updated[tIndex].participants[name] = status;
    setTrainings(updated);
  };

  const toggleTrainerInTraining = (tIndex, name) => {
    const updated = [...trainings];
    const current = updated[tIndex].trainer || [];
    updated[tIndex].trainer = current.includes(name)
      ? current.filter(n => n !== name)
      : [...current, name];
    setTrainings(updated);
  };

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = sortedPlayers.sort((a, b) => b.isTrainer - a.isTrainer);

  return (
    <div className="App">
      <h1>⚽ Fußball Training</h1>

      <button onClick={addTraining}>➕ Training hinzufügen</button>
      <button onClick={() => setShowPlayers(!showPlayers)}>👥 Spieler verwalten</button>
      <button onClick={saveAll}>💾 Alles speichern</button>

      {showPlayers && (
        <div>
          <h2>Spieler & Trainer</h2>
          <input
            value={newPlayer}
            onChange={e => setNewPlayer(e.target.value)}
            placeholder="Neuer Name"
          />
          <button onClick={addPlayer}>➕</button>
          <ul>
            {trainersFirst.map((p, i) => (
              <li key={i}>
                {p.name}
                <button onClick={() => toggleTrainer(i)}>
                  {p.isTrainer ? '👔 Trainer' : '🧒 Spieler'}
                </button>
                <button onClick={() => deletePlayer(i)}>❌</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trainings.map((t, tIndex) => (
        <div key={tIndex} className="training">
          <h3 onClick={() => {
            const updated = [...trainings];
            updated[tIndex].expanded = !updated[tIndex].expanded;
            setTrainings(updated);
          }}>
            📅 {t.date} {t.expanded ? '🔽' : '▶️'}
          </h3>
          {t.expanded && (
            <div>
              {trainersFirst.map((p, pIndex) => (
                <div key={pIndex} className="participant">
                  <span>{p.name}</span>
                  {p.isTrainer ? (
                    <button onClick={() => toggleTrainerInTraining(tIndex, p.name)}>
                      {t.trainer?.includes(p.name) ? '✅ Trainer' : '👔'}
                    </button>
                  ) : (
                    ['✅', '❌', '⏳', ''].map(status => (
                      <button
                        key={status}
                        onClick={() => updateParticipation(tIndex, p.name, status)}
                      >
                        {status || '—'}
                      </button>
                    ))
                  )}
                </div>
              ))}
              <button onClick={() => deleteTraining(tIndex)}>🗑️ Training löschen</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
