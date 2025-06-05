// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import './App.css';

// === Konstanten für Local-Storage-Keys (nach und nach ersetzen wir Lo­calStorage durch API) ===
const LOCAL_STORAGE_USERS_KEY = 'fussballAppUsers';
const LOCAL_STORAGE_PLAYERS_KEY = 'fussballAppPlayers';
const LOCAL_STORAGE_TRAININGS_KEY = 'fussballAppTrainings';

// === Default-Admin (wird nur noch bei erster Installation in die Datenbank geschrieben) ===
const DEFAULT_ADMIN = { name: 'Matthias', password: 'pksqS2^c%Pi2D5' };

// === Utility: Deutsche Wochentags-Abkürzung für Datum ===
const getGermanWeekday = (dateObj) => {
  switch (dateObj.getDay()) {
    case 1:
      return 'Mo';
    case 2:
      return 'Di';
    case 3:
      return 'Mi';
    case 4:
      return 'Do';
    case 5:
      return 'Fr';
    case 6:
      return 'Sa';
    default:
      return 'So';
  }
};

// === Utility: Icon → Text für Teilnahmestatus ===
const iconToText = (icon) => {
  switch (icon) {
    case '✅':
      return ' TEILNEHMEND';
    case '❌':
      return ' ABGEMELDET';
    case '⏳':
      return ' KEINE RÜCKMELDUNG';
    default:
      return ' ZUGESAGT ABER NICHT ERSCHIENEN';
  }
};

// === Utility: Datum & Uhrzeit formatiert (DD.MM.YYYY HH:MM) für lastEdited ===
const formatDateTime = (dateObj) => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

// === Base-URL zum Backend (Production) ===
const API = 'https://fussball-api.onrender.com';

export default function App() {
  /* ================================
     === 1) Login-States ============
     ================================ */
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  /* ================================
     === 2) Nutzerverwaltung-States ==
     ================================ */
  const [users, setUsers] = useState([]); // Liste der User { name, password }
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  /* ================================
     === 3) App-States (nach Login) ==
     ================================ */
  const [players, setPlayers] = useState([]);       // { name, isTrainer }
  const [trainings, setTrainings] = useState([]);   // Trainings-Objekte
  const [showPlayers, setShowPlayers] = useState(false); // Toggle Team-Verwaltung
  const [showAdmin, setShowAdmin] = useState(false);     // Toggle Admin-Verwaltung

  /* Für “Team verwalten” (Spieler/Trainer neu anlegen) */
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');

  /* Für Suchfunktion (Trainings nach Datum filtern) */
  const [searchDate, setSearchDate] = useState('');

  /* ================================
     === 4) Beim Start: Daten laden ==
     ================================ */
  useEffect(() => {
    // === 4.1) Nutzer aus Datenbank holen ===
    fetch(API + '/users')
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.length === 0) {
          // Wenn noch kein User in DB, lege DEFAULT_ADMIN an
          fetch(API + '/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true, list: [DEFAULT_ADMIN] }),
          })
            .then(() => fetch(API + '/users'))
            .then((res2) => res2.json())
            .then(setUsers)
            .catch((err) => console.error('Fehler beim Anlegen Default-Admin:', err));
        } else {
          setUsers(data);
        }
      })
      .catch((err) => {
        console.error('Fehler beim Laden von /users:', err);
        // notfalls auf leere Liste fallbacken
        setUsers([]);
      });

    // === 4.2) Spieler/Trainer (Players) laden ===
    fetch(API + '/players')
      .then((res) => res.json())
      .then(setPlayers)
      .catch((err) => {
        console.error('Fehler beim Laden von /players:', err);
        setPlayers([]);
      });

    // === 4.3) Trainings laden ===
    fetch(API + '/trainings')
      .then((res) => res.json())
      .then(setTrainings)
      .catch((err) => {
        console.error('Fehler beim Laden von /trainings:', err);
        setTrainings([]);
      });
  }, []);

  /* ================================
     === 5) Login-Handler ============
     ================================ */
  const handleLogin = () => {
    const trimmedName = loginName.trim();
    // Prüfen, ob Nutzer in der geladenen Liste existiert
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

  /* ================================
     === 6) Logout ===================
     ================================ */
  const handleLogout = () => {
    setLoggedInUser(null);
    setShowPlayers(false);
    setShowAdmin(false);
    setLoginError('');
  };

  /* ================================
     === 7) Admin-Funktionen ========
     ================================ */

  // 7.1 Neuen Benutzer anlegen (Admin-only)
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
    // Direkt an DB schicken:
    fetch(API + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setNewUserName('');
        setNewUserPass('');
        alert('Neuer Benutzer angelegt und in DB gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler beim Speichern neuer User:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 7.2 Passwort ändern (Admin-only)
  const updateUserPassword = (index, newPass) => {
    const updated = [...users];
    updated[index].password = newPass;
    fetch(API + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        alert(`Passwort für ${data[index].name} geändert.`);
      })
      .catch((err) => {
        console.error('Fehler beim Update User-Pass:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 7.3 Benutzer löschen (Admin-only)
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
        .then((res) => res.json())
        .then((data) => {
          setUsers(data);
          alert('Benutzer gelöscht.');
        })
        .catch((err) => {
          console.error('Fehler beim Löschen User:', err);
          alert('Fehler beim Löschen. Bitte erneut versuchen.');
        });
    }
  };

  /* ================================
     === 8) Speichern-Funktion =======
     ================================ */

  // Alles (Players + Trainings) in DB schreiben
  const saveAll = () => {
    // 8.1) Players in DB schreiben
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: players }),
    })
      .then((res) => res.json())
      .then((savedPlayers) => {
        setPlayers(savedPlayers);
        // 8.2) Trainings in DB schreiben
        return fetch(API + '/trainings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true, list: trainings }),
        });
      })
      .then((res) => res.json())
      .then((savedTrainings) => {
        setTrainings(savedTrainings);
        alert('💾 Alle Änderungen wurden gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler beim Speichern aller Daten:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  /* ================================
     === 9) Team verwalten (Spieler/Trainer) ==
     ================================ */

  // 9.1 Neuen Spieler/Trainer hinzufügen
  const addPlayer = () => {
    const trimmed = newName.trim();
    if (trimmed === '') {
      alert('Bitte einen Namen eingeben.');
      return;
    }
    const isTrainer = newRole === 'Trainer';
    const updated = [...players, { name: trimmed, isTrainer }];
    // Direkt nach der Änderung speichern:
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setPlayers(data);
        setNewName('');
        setNewRole('Spieler');
        alert('Nutzer hinzugefügt und gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler beim Anlegen neuer Spieler:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 9.2 Rolle ändern (Spieler ↔ Trainer)
  const changeRole = (index, role) => {
    const updated = [...players];
    updated[index].isTrainer = role === 'Trainer';
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setPlayers(data);
        // keine extra alert
      })
      .catch((err) => {
        console.error('Fehler beim Ändern der Rolle:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 9.3 Spieler/Trainer löschen
  const deletePlayer = (index) => {
    if (window.confirm('Nutzer wirklich löschen?')) {
      const updated = [...players];
      updated.splice(index, 1);
      fetch(API + '/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then((res) => res.json())
        .then((data) => {
          setPlayers(data);
          alert('Nutzer gelöscht und DB aktualisiert.');
        })
        .catch((err) => {
          console.error('Fehler beim Löschen Spieler:', err);
          alert('Fehler beim Speichern. Bitte erneut versuchen.');
        });
    }
  };

  /* ================================
     === 10) Trainings-Funktionen ====
     ================================ */

  // 10.1 Neues Training anlegen
  const addTraining = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const weekday = getGermanWeekday(now);
    const formatted = `${weekday}, ${day}.${month}.${year}`;
    const timestamp = formatDateTime(now);

    const newT = {
      date: formatted,
      participants: {},
      trainerStatus: {},
      expanded: false,
      isEditing: false,
      createdBy: loggedInUser,
      lastEdited: { by: loggedInUser, at: timestamp },
    };
    const updated = [...trainings, newT];

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setTrainings(data);
        alert('Neues Training angelegt und in DB gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler beim Anlegen Training:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 10.2 Training löschen
  const deleteTraining = (index) => {
    if (window.confirm('Training wirklich löschen?')) {
      const updated = [...trainings];
      updated.splice(index, 1);
      fetch(API + '/trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then((res) => res.json())
        .then((data) => {
          setTrainings(data);
          alert('Training gelöscht und DB aktualisiert.');
        })
        .catch((err) => {
          console.error('Fehler beim Löschen Training:', err);
          alert('Fehler beim Speichern. Bitte erneut versuchen.');
        });
    }
  };

  // 10.3 Start Datum-Edit-Modus
  const startEditDate = (tIndex) => {
    const updated = [...trainings];
    updated[tIndex].isEditing = true;
    setTrainings(updated);
  };

  // 10.4 Datum speichern (nach Bearbeitung)
  const saveEditedDate = (tIndex, newDateValue) => {
    if (!newDateValue) return;
    const [year, month, day] = newDateValue.split('-');
    const dateObj = new Date(+year, +month - 1, +day);
    const weekday = getGermanWeekday(dateObj);
    const formatted = `${weekday}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    const now = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    updated[tIndex].date = formatted;
    updated[tIndex].isEditing = false;
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((data) => {
        setTrainings(data);
        alert('Datum wurde aktualisiert und in DB gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler beim Speichern Datum:', err);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
      });
  };

  // 10.5 Teilnahme-Status aktualisieren (Spieler)
  const updateParticipation = (tIndex, name, statusIcon) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    updated[tIndex].participants[name] = statusIcon;
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    setTrainings(updated); // Direkte UI-Aktualisierung

    // Hinweis: Die Änderung wird erst beim Klick auf den Save-Button endgültig in DB geschrieben.
    // Wir könnten hier aber optional direkt speichern lassen, wenn du möchtest:
    // fetch(API + '/trainings', { ... }).then(…).catch(…);
  };

  // 10.6 Status-Update (Trainer) per Dropdown
  const updateTrainerStatus = (tIndex, name, newStatus) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    const ts = updated[tIndex].trainerStatus || {};
    ts[name] = newStatus;
    updated[tIndex].trainerStatus = { ...ts };
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    setTrainings(updated);
    // Änderung wird beim Speichern (Save-Button) in DB übernommen
  };

  /* ================================
     === 11) Suchfunktion (Trainings) ===
     ================================ */
  // Trainings filtern nach einem genauen Datum (z.B. "2025-05-28")
  const filteredTrainings = searchDate
    ? trainings.filter((t) => {
        // t.date hat Format "Di, 28.05.2025"
        const parts = t.date.split(', ')[1].split('.');
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        // Vergleichsformat "YYYY-MM-DD"
        const formatted = `${year}-${month}-${day}`;
        return formatted === searchDate;
      })
    : trainings;

  /* ================================
     === 12) Sortierung: Trainer zuerst, alphabetisch ===
     ================================ */
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = sortedPlayers.sort((a, b) => b.isTrainer - a.isTrainer);

  /* ================================
     === 13) Rendering beginnen =======
     ================================ */

  // 13.1) Wenn nicht eingeloggt → Login-Screen rendern
  if (!loggedInUser) {
    return (
      <div className="login-screen">
        <h2>Bitte einloggen</h2>
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

  // 13.2) Sobald eingeloggt → komplette App
  return (
    <div className="App">
      {/* ================================
         === Header ====================
         ================================ */}
      <header>
        <h1>⚽ Fußball‐App 1.7  Trainingsteilnahme</h1>
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {/* ================================
         === Steuer-Buttons ============
         ================================ */}
      <div className="controls">
        <button onClick={addTraining}>➕ Training hinzufügen</button>
        <button onClick={() => setShowPlayers(!showPlayers)}>👥 Team verwalten</button>
        {loggedInUser === 'Matthias' && (
          <button onClick={() => setShowAdmin(!showAdmin)}>👤 Adminverwaltung</button>
        )}
      </div>

      {/* ================================
         === Adminverwaltung (nur Matthias) ==
         ================================ */}
      {loggedInUser === 'Matthias' && showAdmin && (
        <section className="admin-section">
          <h2>Benutzerverwaltung (Admin)</h2>
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
              <li key={idx}>
                <span className="user-name">{u.name}</span>
                <input
                  type="text"
                  value={u.password}
                  onChange={(e) => updateUserPassword(idx, e.target.value)}
                  className="user-pass-input"
                />
                <button className="btn-delete" onClick={() => deleteUser(idx)}>
                  ❌
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ================================
         === Team verwalten (Spieler/Trainer) ==
         ================================ */}
      {showPlayers && (
        <section className="player-management">
          <h2>Team verwalten</h2>
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
            {players
              .slice() // Kopie erstellen
              .sort((a, b) => a.name.localeCompare(b.name))
              .sort((a, b) => b.isTrainer - a.isTrainer)
              .map((p, i) => (
                <li key={i} className="player-item">
                  <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>
                    {p.name}
                  </span>
                  <div className="player-item-controls">
                    <select
                      className="role-dropdown"
                      value={p.isTrainer ? 'Trainer' : 'Spieler'}
                      onChange={(e) => changeRole(i, e.target.value)}
                    >
                      <option value="Spieler">Spieler</option>
                      <option value="Trainer">Trainer</option>
                    </select>
                    <button className="btn-delete" onClick={() => deletePlayer(i)}>
                      ❌
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          <button className="btn-save-players" onClick={saveAll}>
            💾 Speichern
          </button>
        </section>
      )}

      {/* ================================
         === Such-Input (Datum) =========
         ================================ */}
      <section className="search-section">
        <label>
          Trainings‐Suche Datum:{' '}
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
          />
        </label>
        <button onClick={() => setSearchDate('')}>Zurücksetzen</button>
      </section>

      {/* ================================
         === Trainings-Liste =============
         ================================ */}
      <section className="trainings-list">
        {filteredTrainings.length === 0 && (
          <p className="no-trainings">Keine Trainings gefunden.</p>
        )}
        {filteredTrainings.map((t, tIndex) => (
          <div key={tIndex} className="training">
            {/* Header: Datum + Toggle */}
            <h3
              className="training-header"
              onClick={() => {
                const updated = [...trainings];
                // tIndex bezieht sich hier auf gefilterte Liste. Wir müssen index im Original-Array finden:
                const originalIndex = trainings.findIndex(
                  (orig) => orig === filteredTrainings[tIndex]
                );
                updated[originalIndex].expanded = !updated[originalIndex].expanded;
                if (!updated[originalIndex].expanded) {
                  updated[originalIndex].isEditing = false;
                }
                setTrainings(updated);
              }}
            >
              📅 {t.date} {t.expanded ? '🔽' : '▶️'}
            </h3>

            {t.expanded && (
              <div className="training-details">
                <div className="created-by">
                  Ersteller: <strong>{t.createdBy}</strong>
                </div>
                {t.lastEdited && t.lastEdited.by && (
                  <div className="last-edited">
                    Zuletzt bearbeitet: <strong>{t.lastEdited.at}</strong> von{' '}
                    <strong>{t.lastEdited.by}</strong>
                  </div>
                )}

                {/* Datum bearbeiten */}
                {t.isEditing ? (
                  <div className="edit-date-row">
                    <input
                      type="date"
                      className="edit-date-input"
                      defaultValue={() => {
                        const parts = t.date.split(', ')[1].split('.');
                        return `${parts[2]}-${parts[1]}-${parts[0]}`;
                      }}
                      onChange={(e) => {
                        // Neuer Wert speichern
                        const originalIndex = trainings.findIndex(
                          (orig) => orig === t
                        );
                        saveEditedDate(originalIndex, e.target.value);
                      }}
                    />
                    <button
                      className="btn-cancel-edit"
                      onClick={() => {
                        const updated = [...trainings];
                        const originalIndex = trainings.findIndex(
                          (orig) => orig === t
                        );
                        updated[originalIndex].isEditing = false;
                        setTrainings(updated);
                      }}
                    >
                      ❌ Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="edit-date-row">
                    <button
                      className="btn-edit-date"
                      onClick={() => {
                        const updated = [...trainings];
                        const originalIndex = trainings.findIndex(
                          (orig) => orig === t
                        );
                        updated[originalIndex].isEditing = true;
                        setTrainings(updated);
                      }}
                    >
                      ✏️ Datum anpassen
                    </button>
                  </div>
                )}

                {/* Trainer-Status & Spieler-Anwesenheit */}
                {players
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .sort((a, b) => b.isTrainer - a.isTrainer)
                  .map((p, pIndex) => {
                    const originalIndex = trainings.findIndex((orig) => orig === t);
                    // Wähle tIndexOriginal aus:
                    const tIndexOriginal = originalIndex;
                    if (p.isTrainer) {
                      const trainerStatus = t.trainerStatus[p.name] || 'Abgemeldet';
                      return (
                        <div key={pIndex} className="participant">
                          <span>
                            {p.name} <em>({trainerStatus})</em>
                          </span>
                          <select
                            className="trainer-status-dropdown"
                            value={trainerStatus}
                            onChange={(e) =>
                              updateTrainerStatus(tIndexOriginal, p.name, e.target.value)
                            }
                          >
                            <option value="Zugesagt">Zugesagt</option>
                            <option value="Abgemeldet">Abgemeldet</option>
                          </select>
                        </div>
                      );
                    } else {
                      const statusIcon = t.participants[p.name] || '—';
                      return (
                        <div key={pIndex} className="participant">
                          <span>
                            {p.name}
                            <em className="status-text">{iconToText(statusIcon)}</em>
                          </span>
                          <div className="btn-part-status">
                            {['✅', '❌', '⏳', '—'].map((icon, idx) => (
                              <button
                                key={idx}
                                className={statusIcon === icon ? 'active' : ''}
                                onClick={() =>
                                  updateParticipation(tIndexOriginal, p.name, icon)
                                }
                              >
                                {icon}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  })}

                {/* Save & Delete Buttons für dieses Training */}
                <div className="training-buttons">
                  <button
                    className="btn-save-training"
                    onClick={() => {
                      saveAll();
                      // Speichern aus saveAll löst bereits Alert aus
                    }}
                  >
                    💾 Speichern
                  </button>
                  <button
                    className="btn-delete-training"
                    onClick={() => {
                      const originalIndex = trainings.findIndex((orig) => orig === t);
                      deleteTraining(originalIndex);
                    }}
                  >
                    🗑️ Training löschen
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ================================
         === 14) Auswertung (unchanged) ==
         ================================ */}
      <section className="report-section">
        <h2>Auswertung</h2>
        <div className="report-form">
          <label>
            Von:{' '}
            <input
              type="date"
              value={''} // in dieser Version noch keine separate Auswertung nötig
              readOnly
            />
          </label>
          <label>
            Bis:{' '}
            <input type="date" value={''} readOnly />
          </label>
          <button disabled>Auswertung (in 1.8)</button>
        </div>
      </section>

      {/* ================================
         === 15) Footer ==================
         ================================ */}
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
      </footer>
    </div>
  );
}
