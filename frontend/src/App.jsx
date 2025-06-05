import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com'; // Deine live‐Backend‐URL

// Deutsche Wochentags-Abkürzung
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

// Icon → Text
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

// Datum + Uhrzeit (DD.MM.YYYY HH:MM)
const formatDateTime = (dateObj) => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

export default function App() {
  // === Login-States ===
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // === Admin/Nutzerverwaltung (Users) ===
  const [users, setUsers] = useState([]); // { name, password }
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  // === Team-Verwaltung (Players) ===
  const [players, setPlayers] = useState([]); // { name, isTrainer, joinDate, note }
  const [showTeam, setShowTeam] = useState(false);

  // Neue Felder, um Spieler/Trainer hinzufügen zu können
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newJoinDate, setNewJoinDate] = useState('');
  const [newNote, setNewNote] = useState('');

  // === Trainings-Zustände (Trainings) ===
  const [trainings, setTrainings] = useState([]); // { date, participants, trainerStatus, createdBy, lastEdited, isEditing }
  const [showAdmin, setShowAdmin] = useState(false);

  // Filter-Datum für Trainings
  const [filterDate, setFilterDate] = useState('');

  // === Auswertung (Report) ===
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState(null);

  // === Versionsnummer ===
  const version = '1.7';

  // === Beim Start: Users, Players & Trainings aus MongoDB laden ===
  useEffect(() => {
    // 1) Alle Benutzer laden
    fetch(API + '/users')
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error('Fehler beim Laden der Users:', err));

    // 2) Alle Spieler/Trainer laden
    fetch(API + '/players')
      .then((res) => res.json())
      .then((data) => setPlayers(data))
      .catch((err) => console.error('Fehler beim Laden der Players:', err));

    // 3) Alle Trainings laden
    fetch(API + '/trainings')
      .then((res) => res.json())
      .then((data) => setTrainings(data))
      .catch((err) => console.error('Fehler beim Laden der Trainings:', err));
  }, []);

  // === Login-Handler ===
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

  // === Logout ===
  const handleLogout = () => {
    setLoggedInUser(null);
    setShowTeam(false);
    setShowAdmin(false);
    setLoginError('');
  };

  // === Admin-Funktionen: Benutzer anlegen, Passwort ändern, löschen ===
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
      .then((res) => res.json())
      .then((saved) => {
        setUsers(saved);
        setNewUserName('');
        setNewUserPass('');
        alert('Neuer Benutzer angelegt.');
      })
      .catch((err) => {
        console.error('Fehler POST /users:', err);
        alert('Fehler beim Anlegen des Benutzers.');
      });
  };

  const updateUserPassword = (index, newPass) => {
    const updated = [...users];
    updated[index].password = newPass;
    fetch(API + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((saved) => {
        setUsers(saved);
        alert(`Passwort für ${saved[index].name} geändert.`);
      })
      .catch((err) => {
        console.error('Fehler POST /users (update password):', err);
        alert('Fehler beim Aktualisieren des Passworts.');
      });
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
        .then((res) => res.json())
        .then((saved) => {
          setUsers(saved);
          alert('Benutzer gelöscht.');
        })
        .catch((err) => {
          console.error('Fehler POST /users (delete):', err);
          alert('Fehler beim Löschen des Benutzers.');
        });
    }
  };

  // === Spieler/Trainer anlegen ===
  const addPlayer = () => {
    const trimmed = newName.trim();
    if (trimmed === '') {
      alert('Bitte einen Namen eingeben.');
      return;
    }
    // Falls kein Join-Date ausgewählt, heutiges Datum nehmen
    let joinDateValue = newJoinDate;
    if (!joinDateValue) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      joinDateValue = `${dd}.${mm}.${yyyy}`;
    } else {
      // date input liefert YYYY-MM-DD → umwandeln in DD.MM.YYYY
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
      .then((res) => res.json())
      .then((saved) => {
        setPlayers(saved);
        setNewName('');
        setNewRole('Spieler');
        setNewJoinDate('');
        setNewNote('');
        alert('Team-Mitglied hinzugefügt.');
      })
      .catch((err) => {
        console.error('Fehler POST /players (add):', err);
        alert('Fehler beim Hinzufügen des Team-Mitglieds.');
      });
  };

  // === Spieler/Trainer in der Liste bearbeiten (Name, Rolle, JoinDate, Note) ===
  const updatePlayerField = (index, field, value) => {
    const updated = [...players];
    updated[index][field] = value;
    setPlayers(updated);
    // Änderungen merken, aber erst beim Speichern endgültig in MongoDB übertragen
  };

  // === Allgemeiner Button: Speichern aller Änderungen in Teamverwaltung ===
  const saveAllPlayers = () => {
    // Stelle sicher, dass jedes joinDate‐Feld im Format DD.MM.YYYY vorliegt.
    const validated = players.map((p) => {
      let jd = p.joinDate;
      // Falls aus Datumsauswahl in HTML, könnte es als YYYY-MM-DD stehen → umwandeln:
      if (/^\d{4}-\d{2}-\d{2}$/.test(jd)) {
        const [y, m, d] = jd.split('-');
        jd = `${d}.${m}.${y}`;
      }
      return { ...p, joinDate: jd };
    });
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: validated }),
    })
      .then((res) => res.json())
      .then((saved) => {
        setPlayers(saved);
        alert('Alle Änderungen im Team wurden gespeichert.');
      })
      .catch((err) => {
        console.error('Fehler POST /players (saveAll):', err);
        alert('Fehler beim Speichern der Team-Daten.');
      });
  };

  // === Spieler/Trainer löschen ===
  const deletePlayer = (index) => {
    const playerToDelete = players[index];
    if (window.confirm(`Team-Mitglied "${playerToDelete.name}" wirklich löschen?`)) {
      const updated = [...players];
      updated.splice(index, 1);
      fetch(API + '/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then((res) => res.json())
        .then((saved) => {
          setPlayers(saved);
          alert('Team-Mitglied gelöscht.');
        })
        .catch((err) => {
          console.error('Fehler POST /players (delete):', err);
          alert('Fehler beim Löschen des Team-Mitglieds.');
        });
    }
  };

  // === Neues Training erstellen ===
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
      },
    ];
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert('Neues Training angelegt.');
      })
      .catch((err) => {
        console.error('Fehler POST /trainings (add):', err);
        alert('Fehler beim Anlegen des Trainings.');
      });
  };

  // === Training löschen ===
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
        .then((saved) => {
          setTrainings(saved);
          alert('Training gelöscht.');
        })
        .catch((err) => {
          console.error('Fehler POST /trainings (delete):', err);
          alert('Fehler beim Löschen des Trainings.');
        });
    }
  };

  // === Datum bearbeiten innerhalb eines Trainings ===
  const startEditDate = (tIndex) => {
    const updated = [...trainings];
    updated[tIndex].isEditing = true;
    setTrainings(updated);
  };

  const saveEditedDate = (tIndex, newDateValue) => {
    if (!newDateValue) return;
    // newDateValue ist YYYY-MM-DD → Umwandlung in DD.MM.YYYY mit Wochentag
    const [year, month, day] = newDateValue.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
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
      .then((saved) => {
        setTrainings(saved);
        alert('Datum wurde aktualisiert.');
      })
      .catch((err) => {
        console.error('Fehler POST /trainings (edit date):', err);
        alert('Fehler beim Aktualisieren des Datums.');
      });
  };

  // === Teilnahme-Status (Spieler) aktualisieren ===
  const updateParticipation = (tIndex, name, statusIcon) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    updated[tIndex].participants[name] = statusIcon;
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert(
          `Teilnahme-Status von "${name}" im Training vom "${saved[tIndex].date}" wurde auf "${iconToText(statusIcon).trim()}" gesetzt.`
        );
      })
      .catch((err) => {
        console.error('Fehler POST /trainings (updateParticipation):', err);
        alert('Fehler beim Aktualisieren des Teilnahme-Status.');
      });
  };

  // === Status-Update (Trainer) per Dropdown ===
  const updateTrainerStatus = (tIndex, name, newStatus) => {
    const now = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    const ts = updated[tIndex].trainerStatus || {};
    ts[name] = newStatus;
    updated[tIndex].trainerStatus = { ...ts };
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then((res) => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert(
          `Trainer-Status von "${name}" im Training vom "${saved[tIndex].date}" wurde auf "${newStatus}" gesetzt.`
        );
      })
      .catch((err) => {
        console.error('Fehler POST /trainings (updateTrainerStatus):', err);
        alert('Fehler beim Aktualisieren des Trainer-Status.');
      });
  };

  // === Sortierung: Trainer zuerst, dann alphabetisch ===
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = [...sortedPlayers].sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0));

  // === Filterfunktion: Trainings nach einem Datum filtern ===
  const trainingsToShow = filterDate
    ? trainings.filter((t) => {
        const datePart = t.date.split(', ')[1]; // z.B. "29.05.2025"
        const [y, m, d] = filterDate.split('-'); // "2025-05-29"
        const comp = `${d}.${m}.${y}`;
        return datePart === comp;
      })
    : trainings;

  // === Auswertung (Report) ===
  const parseGermanDate = (str) => {
    const datePart = str.includes(', ') ? str.split(', ')[1] : str; // "29.05.2025"
    const [d, m, y] = datePart.split('.');
    return new Date(Number(y), Number(m) - 1, Number(d));
  };

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
          const icon = t.participants[player.name] || '—';
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
          note: player.note || '',
        };
      });

    setReportData({ totalTrainings: totalCount, data: report });
  };

  // === Rendering ===
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

  return (
    <div className="App">
      <header>
        <h1>⚽ Fußball‐App {version} Trainingsteilnahme</h1>
        <button
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            backgroundColor: '#c62828',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <div className="controls">
        <button onClick={addTraining}>➕ Training hinzufügen</button>
        <button onClick={() => setShowTeam(!showTeam)}>👥 Team verwalten</button>
        {loggedInUser === 'Matthias' && (
          <button onClick={() => setShowAdmin(!showAdmin)}>👤 Adminverwaltung</button>
        )}
      </div>

      {/* === Admin-Sektion (nur für Matthias) === */}
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
                <span style={{ color: '#e0e0e0' }}>{u.name}</span>
                <input
                  type="text"
                  value={u.password}
                  onChange={(e) => updateUserPassword(idx, e.target.value)}
                  style={{
                    marginLeft: '0.5rem',
                    backgroundColor: '#2a2a2a',
                    color: '#f1f1f1',
                    border: '1px solid #444',
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

      {/* === Teamverwaltung (Spieler & Trainer) === */}
      {showTeam && (
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
            {trainersFirst.map((p, i) => (
              <li key={i}>
                {/* Name bearbeiten */}
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updatePlayerField(i, 'name', e.target.value)}
                  className="edit-input-name"
                />

                {/* Join-Date bearbeiten als date-Input */}
                <input
                  type="date"
                  value={
                    // Falls p.joinDate im Format "DD.MM.YYYY" vorliegt, umwandeln zu "YYYY-MM-DD"
                    /^\d{2}\.\d{2}\.\d{4}$/.test(p.joinDate || '')
                      ? (() => {
                          const [d, m, y] = p.joinDate.split('.');
                          return `${y}-${m}-${d}`;
                        })()
                      : p.joinDate
                  }
                  onChange={(e) => updatePlayerField(i, 'joinDate', e.target.value)}
                  className="edit-input-date"
                  title="Beitrittsdatum bearbeiten"
                />

                {/* Note (Probetraining etc.) bearbeiten */}
                <input
                  type="text"
                  placeholder="Vermerk (Probetraining)"
                  value={p.note}
                  onChange={(e) => updatePlayerField(i, 'note', e.target.value)}
                  className="edit-input-note"
                />

                {/* Rolle bearbeiten */}
                <select
                  className="role-dropdown"
                  value={p.isTrainer ? 'Trainer' : 'Spieler'}
                  onChange={(e) => updatePlayerField(i, 'isTrainer', e.target.value === 'Trainer')}
                >
                  <option value="Spieler">Spieler</option>
                  <option value="Trainer">Trainer</option>
                </select>

                <button className="btn-delete" onClick={() => deletePlayer(i)}>
                  ❌ Löschen
                </button>
              </li>
            ))}
          </ul>

          <button className="btn-save-players" onClick={saveAllPlayers}>
            💾 Speichern
          </button>
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
          <button onClick={() => setFilterDate('')}>Filter zurücksetzen</button>
        </div>

        {trainingsToShow.map((t, tIndex) => (
          <div key={tIndex} className="training">
            <h3
              className="training-header"
              onClick={() => {
                const updated = [...trainings];
                updated[tIndex].expanded = !updated[tIndex].expanded;
                if (!updated[tIndex].expanded) {
                  updated[tIndex].isEditing = false;
                }
                setTrainings(updated);
              }}
            >
              📅 {t.date} {t.expanded ? '🔽' : '▶️'}
            </h3>

            {t.expanded && (
              <>
                <div className="created-by">
                  Ersteller: <strong>{t.createdBy}</strong>
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
                        const parts = t.date.split(', ')[1].split('.');
                        return `${parts[2]}-${parts[1]}-${parts[0]}`;
                      }}
                      onChange={(e) => saveEditedDate(tIndex, e.target.value)}
                    />
                    <button
                      className="btn-save-date"
                      onClick={() => {
                        const updated = [...trainings];
                        updated[tIndex].isEditing = false;
                        setTrainings(updated);
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="edit-date-row">
                    <button className="btn-edit-date" onClick={() => startEditDate(tIndex)}>
                      ✏️ Datum anpassen
                    </button>
                  </div>
                )}

                {!t.isEditing &&
                  players
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
                    .map((p, pIndex) => {
                      if (p.isTrainer) {
                        const trainerStatus = t.trainerStatus?.[p.name] || 'Abgemeldet';
                        return (
                          <div key={pIndex} className="participant">
                            <span>
                              {p.name} <em>({trainerStatus})</em>
                            </span>
                            <select
                              className="trainer-status-dropdown"
                              value={trainerStatus}
                              onChange={(e) =>
                                updateTrainerStatus(tIndex, p.name, e.target.value)
                              }
                            >
                              <option value="Zugesagt">Zugesagt</option>
                              <option value="Abgemeldet">Abgemeldet</option>
                            </select>
                          </div>
                        );
                      } else {
                        const statusIcon = t.participants?.[p.name] || '—';
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
                                  onClick={() => updateParticipation(tIndex, p.name, icon)}
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
                    onClick={() => deleteTraining(tIndex)}
                  >
                    🗑️ Training löschen
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        {trainingsToShow.length === 0 && (
          <p className="no-trainings">Keine Trainings gefunden{filterDate ? ' für dieses Datum.' : '.'}</p>
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
                  <React.Fragment key={idx}>
                    <tr className="report-row">
                      <td
                        className="clickable"
                        onClick={() => {
                          const updatedReport = { ...reportData };
                          updatedReport.data[idx].showDetails = !(
                            updatedReport.data[idx].showDetails
                          );
                          setReportData(updatedReport);
                        }}
                      >
                        {row.name}
                        {row.note && <span className="note-report"> ({row.note})</span>}
                      </td>
                      <td>{row.joinDate}</td>
                      <td>{row.percent}%</td>
                    </tr>
                    {row.showDetails && (
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

      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
      </footer>
    </div>
  );
}
