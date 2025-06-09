// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

// Hilfsfunktionen
const getGermanWeekday = (dateObj) => {
  switch (dateObj.getDay()) {
    case 1: return 'Mo';
    case 2: return 'Di';
    case 3: return 'Mi';
    case 4: return 'Do';
    case 5: return 'Fr';
    case 6: return 'Sa';
    default: return 'So';
  }
};
const iconToText = (icon) => {
  switch (icon) {
    case '✅': return ' TEILNEHMEND';
    case '❌': return ' ABGEMELDET';
    case '⏳': return ' KEINE RÜCKMELDUNG';
    default: return ' ZUGESAGT ABER NICHT ERSCHIENEN';
  }
};
const formatDateTime = (dateObj) => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};
const parseGermanDate = (str) => {
  const datePart = str && str.includes(',') ? str.split(', ')[1] : str;
  if (!datePart) return new Date(0);
  const [d, m, y] = datePart.split('.');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

export default function App() {
  // === STATES ===
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Teamverwaltung/Admin
  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  // Team
  const [players, setPlayers] = useState([]);
  const [showTeam, setShowTeam] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [playerDraft, setPlayerDraft] = useState({});

  // Spieler-Hinzufügen-Formular
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newJoinDate, setNewJoinDate] = useState('');
  const [newNote, setNewNote] = useState('');

  // Trainings
  const [trainings, setTrainings] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [expandedTraining, setExpandedTraining] = useState(null);

  // Filter/Suche Trainings
  const [filterDate, setFilterDate] = useState('');
  const [searchText, setSearchText] = useState('');

  // Auswertung
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState(null);
  const [expandedReportRow, setExpandedReportRow] = useState(null);

  // Version
  const version = '1.3';

  // === Initialdaten laden, robust gegen fehlende Felder ===
  useEffect(() => {
    fetch(API + '/users').then(res => res.json()).then(setUsers).catch(() => setUsers([]));
    fetch(API + '/players').then(res => res.json()).then(setPlayers).catch(() => setPlayers([]));
    fetch(API + '/trainings').then(res => res.json()).then(data => {
      setTrainings(Array.isArray(data) ? data.map(t => ({
        ...t,
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {},
        note: t.note || '',
        createdBy: t.createdBy || '',
        lastEdited: t.lastEdited || null,
      })) : []);
    }).catch(() => setTrainings([]));
  }, []);

  // Login-Handler
  const handleLogin = () => {
    const trimmedName = loginName.trim();
    const user = users.find((u) => u.name === trimmedName && u.password === loginPass);
    if (user) {
      setLoggedInUser(user.name);
      setLoginError('');
      setLoginName('');
      setLoginPass('');
    } else {
      setLoginError('Falscher Benutzername oder Passwort.');
    }
  };

  // Logout (ganz unten)
  const handleLogout = () => {
    setLoggedInUser(null);
    setShowTeam(false);
    setShowAdmin(false);
    setLoginError('');
  };

  // Nutzer anlegen (Teamverwaltung)
  const addNewUser = () => {
    const name = newUserName.trim();
    if (!name || !newUserPass) {
      alert('Bitte Benutzername und Passwort eingeben.');
      return;
    }
    if (users.some((u) => u.name === name)) {
      alert('Dieser Benutzername existiert bereits.');
      return;
    }
    const updated = [...users, { name, password: newUserPass }];
    fetch(API + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setUsers(saved);
        setNewUserName('');
        setNewUserPass('');
        alert('Neuer Benutzer angelegt.');
      })
      .catch(() => alert('Fehler beim Anlegen des Benutzers.'));
  };

  const updateUserPassword = (index, newPass) => {
    const updated = [...users];
    updated[index].password = newPass;
    fetch(API + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setUsers(saved);
        alert(`Passwort für ${saved[index].name} geändert.`);
      })
      .catch(() => alert('Fehler beim Aktualisieren des Passworts.'));
  };

  const deleteUser = (index) => {
    const userToDelete = users[index];
    if (userToDelete.name === 'Matthias') {
      alert('Den Administrator kann man nicht löschen.');
      return;
    }
    if (window.confirm(`Benutzer "${userToDelete.name}" wirklich löschen?`)) {
      const updated = [...users];
      updated.splice(index, 1);
      fetch(API + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then(res => res.json())
        .then((saved) => {
          setUsers(saved);
          alert('Benutzer gelöscht.');
        })
        .catch(() => alert('Fehler beim Löschen des Benutzers.'));
    }
  };

  // Teamverwaltung (mit Bearbeiten)
  const startEditPlayer = (player) => {
    setEditPlayerId(player.name + (player.joinDate || ''));
    setPlayerDraft({ ...player, note: player.note || '', joinDate: player.joinDate || '' });
  };
  const saveEditPlayer = () => {
    const idx = players.findIndex(
      p => p.name + (p.joinDate || '') === editPlayerId
    );
    if (idx === -1) return;
    const updated = [...players];
    updated[idx] = { ...playerDraft, note: playerDraft.note || '', joinDate: playerDraft.joinDate || '' };
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setPlayers(saved);
        setEditPlayerId(null);
        setPlayerDraft({});
        alert('Änderung gespeichert.');
      })
      .catch(() => alert('Fehler beim Bearbeiten.'));
  };
  const cancelEditPlayer = () => {
    setEditPlayerId(null);
    setPlayerDraft({});
  };

  // Spieler/Trainer anlegen (Teamverwaltung)
  const addPlayer = () => {
    const trimmed = newName.trim();
    if (trimmed === '') {
      alert('Bitte einen Namen eingeben.');
      return;
    }
    let joinDateValue = newJoinDate;
    if (!joinDateValue) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      joinDateValue = `${dd}.${mm}.${yyyy}`;
    } else {
      const [y, m, d] = newJoinDate.split('-');
      joinDateValue = `${d}.${m}.${y}`;
    }
    const isTrainer = newRole === 'Trainer';
    const updated = [
      ...players,
      { name: trimmed, isTrainer, joinDate: joinDateValue, note: newNote || '' },
    ];
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setPlayers(saved);
        setNewName('');
        setNewRole('Spieler');
        setNewJoinDate('');
        setNewNote('');
        alert('Team-Mitglied hinzugefügt.');
      })
      .catch(() => alert('Fehler beim Hinzufügen des Team-Mitglieds.'));
  };

  // Rolle ändern
  const changeRole = (player, role) => {
    const idx = players.findIndex(p => p.name + (p.joinDate || '') === player.name + (player.joinDate || ''));
    if (idx === -1) return;
    const updated = [...players];
    updated[idx].isTrainer = role === 'Trainer';
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(setPlayers)
      .catch(() => alert('Fehler beim Ändern der Rolle.'));
  };

  // Spieler/Trainer löschen
  const deletePlayer = (player) => {
    if (window.confirm(`Team-Mitglied "${player.name}" wirklich löschen?`)) {
      const idx = players.findIndex(
        p => p.name + (p.joinDate || '') === player.name + (player.joinDate || '')
      );
      if (idx === -1) return;
      const updated = [...players];
      updated.splice(idx, 1);
      fetch(API + '/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then(res => res.json())
        .then((saved) => {
          setPlayers(saved);
          alert('Team-Mitglied gelöscht.');
        })
        .catch(() => alert('Fehler beim Löschen des Team-Mitglieds.'));
    }
  };

  // Trainings nach Datum absteigend sortieren
  function sortTrainings(arr) {
    return [...arr].sort((a, b) => {
      const ad = (a.date || '').split(', ')[1]?.split('.').reverse().join('') || '';
      const bd = (b.date || '').split(', ')[1]?.split('.').reverse().join('') || '';
      return bd.localeCompare(ad);
    });
  }

  // Neues Training (mit Notizfeld)
  const addTraining = () => {
    if (!loggedInUser) {
      alert('Bitte zuerst einloggen.');
      return;
    }
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const weekday = getGermanWeekday(now);
    const formatted = `${weekday}, ${dd}.${mm}.${yyyy}`;
    const timestamp = formatDateTime(now);

    const updated = [
      ...trainings,
      {
        date: formatted,
        participants: {},
        trainerStatus: {},
        createdBy: loggedInUser,
        lastEdited: { by: loggedInUser, at: timestamp },
        note: '',
      },
    ];
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: t.note || '',
        })));
        alert('Neues Training angelegt.');
      })
      .catch(() => alert('Fehler beim Anlegen des Trainings.'));
  };

  // Training löschen
  const deleteTraining = (training) => {
    if (window.confirm('Training wirklich löschen?')) {
      const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
      if (idx === -1) return;
      const updated = [...trainings];
      updated.splice(idx, 1);
      fetch(API + '/trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then(res => res.json())
        .then((saved) => {
          setTrainings(saved.map(t => ({
            ...t,
            participants: t.participants || {},
            trainerStatus: t.trainerStatus || {},
            note: t.note || '',
          })));
          alert('Training gelöscht.');
        })
        .catch(() => alert('Fehler beim Löschen des Trainings.'));
    }
  };

  // Trainingsnotiz speichern
  const saveTrainingNote = (training, noteValue) => {
    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].note = noteValue;
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: t.note || '',
        })));
        alert('Notiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Trainingsdatum editieren
  const startEditDate = (training) => {
    setExpandedTraining(training.date + (training.createdBy || ''));
    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx !== -1) {
      trainings[idx].isEditing = true;
      setTrainings([...trainings]);
    }
  };
  const saveEditedDate = (training, newDateValue) => {
    if (!newDateValue) return;
    const [year, month, day] = newDateValue.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const weekday = getGermanWeekday(dateObj);
    const formatted = `${weekday}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    const now = new Date();
    const timestamp = formatDateTime(now);

    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].date = formatted;
    updated[idx].isEditing = false;
    updated[idx].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: t.note || '',
        })));
        alert('Datum wurde aktualisiert.');
      })
      .catch(() => alert('Fehler beim Aktualisieren des Datums.'));
  };

  // Teilnahme-Status (Spieler)
  const updateParticipation = (training, name, statusIcon) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].participants = updated[idx].participants || {};
    updated[idx].participants[name] = statusIcon;
    updated[idx].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: t.note || '',
        })));
        alert(
          `Teilnahme-Status von "${name}" im Training vom "${saved[idx].date}" wurde auf "${iconToText(statusIcon).trim()}" gesetzt.`
        );
      })
      .catch(() => alert('Fehler beim Aktualisieren des Teilnahme-Status.'));
  };

  // Trainer-Status (Dropdown)
  const updateTrainerStatus = (training, name, newStatus) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].trainerStatus = updated[idx].trainerStatus || {};
    updated[idx].trainerStatus[name] = newStatus;
    updated[idx].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: t.note || '',
        })));
        alert(
          `Trainer-Status von "${name}" im Training vom "${saved[idx].date}" wurde auf "${newStatus}" gesetzt.`
        );
      })
      .catch(() => alert('Fehler beim Aktualisieren des Trainer-Status.'));
  };

  // Team-Sortierung: Trainer zuerst, dann alphabetisch
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = [...sortedPlayers].sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0));

  // Such-/Filterfunktion für Trainings
  const trainingsToShow = sortTrainings(
    trainings.filter((t) => {
      let dateOk = true;
      if (filterDate && t.date) {
        const datePart = t.date.split(', ')[1];
        const [y, m, d] = filterDate.split('-');
        const comp = `${d}.${m}.${y}`;
        dateOk = datePart === comp;
      }
      let searchOk = true;
      if (searchText.trim()) {
        const search = searchText.trim().toLowerCase();
        searchOk =
          (t.date && t.date.toLowerCase().includes(search)) ||
          (t.note && t.note.toLowerCase().includes(search));
      }
      return dateOk && searchOk;
    })
  );

  // === Auswertung
  const computeReport = () => {
    if (!fromDate || !toDate) {
      alert('Bitte Start- und Enddatum auswählen.');
      return;
    }
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (end < start) {
      alert('Enddatum muss nach dem Startdatum liegen.');
      return;
    }
    const trainingsInRange = trainings.filter((t) => {
      const d = parseGermanDate(t.date);
      return d >= start && d <= end;
    });
    const totalCount = trainingsInRange.length;
    if (totalCount === 0) {
      alert('In diesem Zeitraum wurden keine Trainings gefunden.');
      setReportData(null);
      return;
    }
    const report = trainersFirst
      .filter((p) => !p.isTrainer)
      .map((player) => {
        let attendCount = 0;
        const details = trainingsInRange.map((t) => {
          const icon = (t.participants && t.participants[player.name]) || '—';
          const text = iconToText(icon);
          if (icon === '✅') attendCount += 1;
          return { date: t.date, statusText: text };
        });
        const percent = Math.round((attendCount / totalCount) * 100);
        return {
          name: player.name,
          percent,
          details,
          showDetails: false,
          joinDate: player.joinDate || '',
        };
      });
    setReportData({ totalTrainings: totalCount, data: report });
  };

  // === RENDERING ===
  if (!loggedInUser) {
    return (
      <div className="login-screen modern-dark-blue">
        <div className="login-icon-row">
          <span className="login-icon" role="img" aria-label="fußball">⚽</span>
        </div>
        <h1 className="login-headline">Fußball-App</h1>
        <div className="login-version">Version {version}</div>
        <input
          type="text"
          placeholder="Benutzername"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Passwort"
          value={loginPass}
          onChange={(e) => setLoginPass(e.target.value)}
        />
        <button onClick={handleLogin}>Einloggen</button>
        {loginError && <p className="login-error">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>⚽ Fußball‐App <span className="blue-version">{version}</span> Trainingsteilnahme</h1>
      </header>

      <div className="controls">
        <button onClick={addTraining}>➕ Training hinzufügen</button>
        <button onClick={() => setShowTeam(!showTeam)}>👥 Team verwalten</button>
        {loggedInUser === 'Matthias' && (
          <button onClick={() => setShowAdmin(!showAdmin)}>👤 Adminverwaltung</button>
        )}
      </div>

      {/* === Adminbereich (nur für Matthias) === */}
      {loggedInUser === 'Matthias' && showAdmin && (
        <section className="admin-section">
          <h2>Adminbereich</h2>
          <div className="add-player-form">
            <input
              type="text"
              placeholder="Neuer Benutzername"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Passwort"
              value={newUserPass}
              onChange={(e) => setNewUserPass(e.target.value)}
            />
            <button onClick={addNewUser}>➕ Erstellen</button>
          </div>
          <ul className="player-list">
            {users.map((u, idx) => (
              <li key={u.name}>
                <span style={{ color: '#e0e0e0' }}>{u.name}</span>
                <input
                  type="text"
                  value={u.password}
                  onChange={(e) => updateUserPassword(idx, e.target.value)}
                  style={{
                    marginLeft: '0.5rem',
                    backgroundColor: '#232942',
                    color: '#f1f1f1',
                    border: '1px solid #2d385b',
                    borderRadius: '4px',
                    padding: '0.3rem 0.6rem',
                  }}
                />
                <button className="btn-delete" onClick={() => deleteUser(idx)}>
                  ❌ Löschen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* === Teamverwaltung für alle === */}
      {showTeam && (
        <section className="player-management">
          <h2>Teamverwaltung</h2>
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
            <input
              type="date"
              value={newJoinDate}
              onChange={(e) => setNewJoinDate(e.target.value)}
              title="Beitrittsdatum"
            />
            <input
              type="text"
              placeholder="Vermerk (z.B. Probetraining)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button onClick={addPlayer}>➕ Hinzufügen</button>
          </div>
          <ul className="player-list">
            {trainersFirst.map((p) =>
              editPlayerId === p.name + (p.joinDate || '') ? (
                <li key={p.name + (p.joinDate || '')} className="edit-player-row">
                  <input
                    type="text"
                    value={playerDraft.name}
                    onChange={e => setPlayerDraft(draft => ({ ...draft, name: e.target.value }))}
                  />
                  <input
                    type="text"
                    value={playerDraft.joinDate}
                    onChange={e => setPlayerDraft(draft => ({ ...draft, joinDate: e.target.value }))}
                    placeholder="Im Team seit"
                  />
                  <input
                    type="text"
                    value={playerDraft.note}
                    onChange={e => setPlayerDraft(draft => ({ ...draft, note: e.target.value }))}
                    placeholder="Vermerk"
                  />
                  <select
                    className="role-dropdown"
                    value={playerDraft.isTrainer ? 'Trainer' : 'Spieler'}
                    onChange={e => setPlayerDraft(draft => ({
                      ...draft,
                      isTrainer: e.target.value === 'Trainer',
                    }))}
                  >
                    <option value="Spieler">Spieler</option>
                    <option value="Trainer">Trainer</option>
                  </select>
                  <button className="btn-save-players" onClick={saveEditPlayer}>💾 Speichern</button>
                  <button className="btn-delete" onClick={cancelEditPlayer}>Abbrechen</button>
                </li>
              ) : (
                <li key={p.name + (p.joinDate || '')}>
                  <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>
                    {p.name}
                  </span>
                  <span className="join-date"> (Im Team seit: {p.joinDate || '-'})</span>
                  {p.note && <span className="note"> [{p.note}]</span>}
                  <div>
                    <select
                      className="role-dropdown"
                      value={p.isTrainer ? 'Trainer' : 'Spieler'}
                      onChange={e => changeRole(p, e.target.value)}
                    >
                      <option value="Spieler">Spieler</option>
                      <option value="Trainer">Trainer</option>
                    </select>
                    <button className="btn-edit" onClick={() => startEditPlayer(p)}>✏️ Bearbeiten</button>
                    <button className="btn-delete" onClick={() => deletePlayer(p)}>❌ Löschen</button>
                  </div>
                </li>
              )
            )}
          </ul>
        </section>
      )}

      {/* === Trainings-Liste === */}
      <section className="trainings-list">
        <div className="training-filter">
          <label>
            Nach Datum filtern:{' '}
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </label>
          <label>
            Suchen:{' '}
            <input
              type="text"
              placeholder="Datum oder Text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ minWidth: 140 }}
            />
          </label>
          <button onClick={() => { setFilterDate(''); setSearchText(''); }}>Filter zurücksetzen</button>
        </div>

        {trainingsToShow.map((t) => (
          <div key={t.date + (t.createdBy || '')} className="training">
            <h3
              className={`training-header ${expandedTraining === t.date + (t.createdBy || '') ? 'expanded' : ''}`}
              onClick={() => setExpandedTraining(expandedTraining === t.date + (t.createdBy || '') ? null : t.date + (t.createdBy || ''))}
            >
              📅 {t.date} {expandedTraining === t.date + (t.createdBy || '') ? '🔽' : '▶️'}
            </h3>

            {expandedTraining === t.date + (t.createdBy || '') && (
              <>
                <div className="created-by">
                  Ersteller: <strong>{t.createdBy || ''}</strong>
                </div>
                {t.lastEdited && (
                  <div className="last-edited">
                    Zuletzt bearbeitet: <strong>{t.lastEdited.at}</strong> von{' '}
                    <strong>{t.lastEdited.by}</strong>
                  </div>
                )}

                {t.isEditing ? (
                  <div className="edit-date-row">
                    <input
                      type="date"
                      className="edit-date-input"
                      defaultValue={() => {
                        const parts = (t.date || '').split(', ')[1]?.split('.') || [];
                        return `${parts[2] || ''}-${parts[1] || ''}-${parts[0] || ''}`;
                      }}
                      onChange={(e) => saveEditedDate(t, e.target.value)}
                    />
                    <button
                      className="btn-save-date"
                      onClick={() => {
                        t.isEditing = false;
                        setTrainings([...trainings]);
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="edit-date-row">
                    <button className="btn-edit-date" onClick={() => startEditDate(t)}>
                      ✏️ Datum anpassen
                    </button>
                  </div>
                )}

                {/* Notizfeld */}
                <div className="note-field">
                  <textarea
                    rows={2}
                    placeholder="Notiz zum Training (z.B. was gemacht wurde...)"
                    value={t.note || ''}
                    onChange={(e) => {
                      const idx = trainings.findIndex(tr => tr.date + (tr.createdBy || '') === t.date + (t.createdBy || ''));
                      if (idx === -1) return;
                      const updated = [...trainings];
                      updated[idx].note = e.target.value;
                      setTrainings(updated);
                    }}
                  />
                  <button
                    style={{ marginLeft: '1rem', marginTop: '0.3rem' }}
                    onClick={() => saveTrainingNote(t, t.note || '')}
                  >
                    💾 Notiz speichern
                  </button>
                </div>

                {/* Spieler/Trainer Liste */}
                {!t.isEditing &&
                  players
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
                    .map((p) => {
                      if (p.isTrainer) {
                        const trainerStatus = (t.trainerStatus && t.trainerStatus[p.name]) || 'Abgemeldet';
                        return (
                          <div key={p.name + 'trainer'} className="participant">
                            <span>
                              {p.name} <em>({trainerStatus})</em>
                            </span>
                            <select
                              className="trainer-status-dropdown"
                              value={trainerStatus}
                              onChange={(e) =>
                                updateTrainerStatus(t, p.name, e.target.value)
                              }
                            >
                              <option value="Zugesagt">Zugesagt</option>
                              <option value="Abgemeldet">Abgemeldet</option>
                            </select>
                          </div>
                        );
                      } else {
                        const statusIcon = (t.participants && t.participants[p.name]) || '—';
                        return (
                          <div key={p.name} className="participant">
                            <span>
                              {p.name}
                              <em className="status-text">{iconToText(statusIcon)}</em>
                            </span>
                            <div className="btn-part-status">
                              {['✅', '❌', '⏳', '—'].map((icon, idx) => (
                                <button
                                  key={idx}
                                  className={statusIcon === icon ? 'active' : ''}
                                  onClick={() => updateParticipation(t, p.name, icon)}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    })}

                {!t.isEditing && (
                  <button
                    className="btn-save-training"
                    onClick={() => alert('Änderungen im Training wurden gespeichert.')}
                  >
                    💾 Speichern
                  </button>
                )}

                {!t.isEditing && (
                  <button
                    className="btn-delete-training"
                    onClick={() => deleteTraining(t)}
                  >
                    🗑️ Training löschen
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        {trainingsToShow.length === 0 && (
          <p className="no-trainings">Keine Trainings gefunden{filterDate || searchText ? ' für diesen Filter.' : '.'}</p>
        )}
      </section>

      {/* === Auswertung === */}
      <section className="report-section">
        <h2>Auswertung</h2>
        <div className="report-form">
          <label>
            Von:{' '}
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            Bis:{' '}
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <button onClick={computeReport}>Auswertung anzeigen</button>
        </div>

        {reportData && (
          <div className="report-results">
            <p>
              {reportData.totalTrainings} Training
              {reportData.totalTrainings !== 1 ? 's' : ''} im Zeitraum.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Spieler</th>
                  <th>Im Team seit</th>
                  <th>Teilnahme (%)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.data.map((row, idx) => (
                  <React.Fragment key={row.name + (row.joinDate || '')}>
                    <tr
                      className={`report-row ${expandedReportRow === row.name + (row.joinDate || '') ? 'expanded' : ''}`}
                      onClick={() => setExpandedReportRow(
                        expandedReportRow === row.name + (row.joinDate || '') ? null : row.name + (row.joinDate || '')
                      )}
                    >
                      <td className="clickable">{row.name}</td>
                      <td>{row.joinDate}</td>
                      <td>{row.percent}%</td>
                    </tr>
                    {expandedReportRow === row.name + (row.joinDate || '') && (
                      <tr className="report-details-row">
                        <td colSpan="3">
                          <ul>
                            {row.details.map((d, dIdx) => (
                              <li key={dIdx}>
                                {d.date}: <strong>{d.statusText.trim()}</strong>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer und Logout ganz unten */}
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
        <button
          style={{
            margin: '2rem auto 0 auto',
            display: 'block',
            backgroundColor: '#1363d2',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.7rem 1.4rem',
            cursor: 'pointer',
            fontSize: '1.05rem',
            boxShadow: '0 2px 10px #222a4477',
          }}
          onClick={handleLogout}
        >
          Logout
        </button>
      </footer>
    </div>
  );
}
