import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

const iconToText = (icon) => {
  switch (icon) {
    case '✅': return ' TEILNEHMEND';
    case '❌': return ' ABGEMELDET';
    case '⏳': return ' KEINE RÜCKMELDUNG';
    case '⁉️': return ' KEINE RÜCKMELDUNG, ABER ERSCHIENEN';
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
  // STATES
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [players, setPlayers] = useState([]);
  const [showTeam, setShowTeam] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [playerDraft, setPlayerDraft] = useState({});
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newNote, setNewNote] = useState('');
  const [newMemberSince, setNewMemberSince] = useState('');
  const [trainings, setTrainings] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [expandedTraining, setExpandedTraining] = useState(null);
  const [editDateIdx, setEditDateIdx] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState(null);
  const [expandedReportRow, setExpandedReportRow] = useState(null);
  const [showTrainings, setShowTrainings] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const version = '2.1';

  // Daten laden
  useEffect(() => {
    fetch(API + '/users').then(res => res.json()).then(setUsers).catch(() => setUsers([]));
    fetch(API + '/players').then(res => res.json()).then(setPlayers).catch(() => setPlayers([]));
    fetch(API + '/trainings').then(res => res.json()).then(data => {
      setTrainings(Array.isArray(data) ? data.map(t => ({
        ...t,
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {},
        note: typeof t.note === 'string' ? t.note : '',
        playerNotes: t.playerNotes || {},
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

  const handleLogout = () => {
    setLoggedInUser(null);
    setShowTeam(false);
    setShowAdmin(false);
    setLoginError('');
  };

  // Nutzer anlegen
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

  // Teamverwaltung (mit Bearbeiten & Notiz speichern onBlur)
  const startEditPlayer = (player) => {
    setEditPlayerId(player.name);
    setPlayerDraft({ ...player, note: player.note || '', memberSince: player.memberSince || '' });
  };
  const saveEditPlayer = () => {
    const idx = players.findIndex(p => p.name === editPlayerId);
    if (idx === -1) return;
    const updated = [...players];
    updated[idx] = {
      ...playerDraft,
      note: typeof playerDraft.note === 'string' ? playerDraft.note : '',
      memberSince: typeof playerDraft.memberSince === 'string' ? playerDraft.memberSince : ''
    };
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(playersFromServer => {
        setPlayers(playersFromServer);
        alert('Änderung gespeichert.');
      })
      .catch(() => alert('Fehler beim Bearbeiten.'));
    setEditPlayerId(null);
    setPlayerDraft({});
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
    const isTrainer = newRole === 'Trainer';
    const updated = [
      ...players,
      {
        name: trimmed,
        isTrainer,
        note: typeof newNote === 'string' ? newNote : '',
        memberSince: typeof newMemberSince === 'string' ? newMemberSince : ''
      },
    ];
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(playersFromServer => {
        setPlayers(playersFromServer);
        alert('Team-Mitglied hinzugefügt.');
      })
      .catch(() => alert('Fehler beim Hinzufügen des Team-Mitglieds.'));
    setNewName('');
    setNewRole('Spieler');
    setNewNote('');
    setNewMemberSince('');
  };

  // Notiz in der Teamverwaltung – SPEICHERT DAUERHAFT onBlur
  const handlePlayerNoteBlur = (player, noteValue) => {
    const idx = players.findIndex(p => p.name === player.name);
    if (idx === -1) return;
    const updated = [...players];
    updated[idx].note = noteValue;
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(playersFromServer => {
        setPlayers(playersFromServer);
        alert('Spieler-Notiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Mitglied seit in der Teamverwaltung – SPEICHERT DAUERHAFT onBlur
  const handlePlayerMemberSinceBlur = (player, memberSinceValue) => {
    const idx = players.findIndex(p => p.name === player.name);
    if (idx === -1) return;
    const updated = [...players];
    updated[idx].memberSince = memberSinceValue;
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(playersFromServer => {
        setPlayers(playersFromServer);
        alert('Mitglied seit gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern des Mitglied seit.'));
  };

  // Rolle ändern
  const changeRole = (player, role) => {
    const idx = players.findIndex(p => p.name === player.name);
    if (idx === -1) return;
    const updated = [...players];
    updated[idx].isTrainer = role === 'Trainer';
    fetch(API + '/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(playersFromServer => {
        setPlayers(playersFromServer);
        alert('Rolle geändert.');
      })
      .catch(() => alert('Fehler beim Ändern der Rolle.'));
  };

  // Spieler/Trainer löschen
  const deletePlayer = (player) => {
    if (window.confirm(`Team-Mitglied "${player.name}" wirklich löschen?`)) {
      const idx = players.findIndex(p => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated.splice(idx, 1);
      fetch(API + '/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then(res => res.json())
        .then(playersFromServer => {
          setPlayers(playersFromServer);
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

  // Neues Training (mit Notizfeld & playerNotes)
  const addTraining = () => {
    if (!loggedInUser) {
      alert('Bitte zuerst einloggen.');
      return;
    }
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const weekday = ['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const formatted = `${weekday}, ${dd}.${mm}.${yyyy}`;
    const timestamp = formatDateTime(now);

    const updated = [
      ...trainings,
      {
        date: formatted,
        participants: {},
        trainerStatus: {},
        note: '',
        playerNotes: {},
        createdBy: loggedInUser,
        lastEdited: { by: loggedInUser, at: timestamp },
      },
    ];
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
        })));
        alert('Neues Training angelegt.');
      })
      .catch(() => alert('Fehler beim Anlegen des Trainings.'));
  };

  // Spielerinnen-Notiz für ein Training speichern
  const savePlayerNote = (training, playerName, noteValue) => {
    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].playerNotes = { ...updated[idx].playerNotes, [playerName]: noteValue };
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
        })));
        // alert('Spielerinnen-Notiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Notiz Training – SPEICHERT DAUERHAFT onBlur
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
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
        })));
        // alert('Trainingsnotiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Trainingsdatum editieren (Abbrechen robust)
  const saveEditedDate = (training, newDateValue) => {
    if (!newDateValue) return;
    const [year, month, day] = newDateValue.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const weekday = ['So','Mo','Di','Mi','Do','Fr','Sa'][dateObj.getDay()];
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
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
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
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
        })));
        alert(
          `Teilnahme-Status von "${name}" im Training vom "${updated[idx].date}" wurde auf "${iconToText(statusIcon).trim()}" gesetzt.`
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
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          note: typeof t.note === 'string' ? t.note : '',
          playerNotes: t.playerNotes || {},
        })));
        alert(
          `Trainer-Status von "${name}" im Training vom "${updated[idx].date}" wurde auf "${newStatus}" gesetzt.`
        );
      })
      .catch(() => alert('Fehler beim Aktualisieren des Trainer-Status.'));
  };

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
          // Beachte: ⁉️ zählt wie ✅
          if (icon === '✅' || icon === '⁉️') attendCount += 1;
          return { date: t.date, statusText: text };
        });
        const percent = Math.round((attendCount / totalCount) * 100);
        return {
          name: player.name,
          percent,
          details,
          showDetails: false,
          note: player.note || '',
        };
      });
    setReportData({ totalTrainings: totalCount, data: report });
    alert("Auswertung aktualisiert.");
  };

  // RENDERING
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

      <div className="controls mobile-controls">
        <button className="main-func-btn" onClick={addTraining}>➕ Training hinzufügen</button>
        <button className="main-func-btn" onClick={() => setShowTeam(!showTeam)}>👥 Team verwalten</button>
        <button className="main-func-btn" onClick={() => setShowTrainings(!showTrainings)}>
          {showTrainings ? "Trainingsliste verbergen" : "Gespeicherte Trainings anzeigen"}
        </button>
        <button className="main-func-btn" onClick={() => setShowReport(!showReport)}>
          {showReport ? "Auswertung verbergen" : "Auswertung anzeigen"}
        </button>
        {loggedInUser === 'Matthias' && (
          <button className="main-func-btn" onClick={() => setShowAdmin(!showAdmin)}>👤 Adminverwaltung</button>
        )}
      </div>

      {/* === Adminbereich (nur für Matthias) === */}
      {loggedInUser === 'Matthias' && showAdmin && (
        <section className="admin-section">
          {/* ... (unverändert) ... */}
        </section>
      )}

      {/* === Teamverwaltung für alle === */}
      {showTeam && (
        <section className="player-management">
          {/* ... (unverändert) ... */}
        </section>
      )}

      {/* === Trainings-Liste === */}
      {showTrainings && (
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

          {trainingsToShow.map((t, idx) => (
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

                  {editDateIdx === idx ? (
                    <div className="edit-date-row">
                      <input
                        type="date"
                        className="edit-date-input"
                        value={editDateValue}
                        onChange={e => setEditDateValue(e.target.value)}
                      />
                      <button
                        className="btn-save-date"
                        onClick={() => {
                          saveEditedDate(t, editDateValue);
                          setEditDateIdx(null);
                          setEditDateValue('');
                        }}
                      >
                        Speichern
                      </button>
                      <button
                        className="btn-save-date"
                        onClick={() => {
                          setEditDateIdx(null);
                          setEditDateValue('');
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <div className="edit-date-row">
                      <button
                        className="btn-edit-date"
                        onClick={() => {
                          const parts = (t.date || '').split(', ')[1]?.split('.') || [];
                          setEditDateValue(parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '');
                          setEditDateIdx(idx);
                        }}
                      >
                        ✏️ Datum anpassen
                      </button>
                    </div>
                  )}

                  {/* Notizfeld Training */}
                  <div className="note-field">
                    <textarea
                      rows={2}
                      placeholder="Notiz zum Training (z.B. was gemacht wurde...)"
                      value={typeof t.note === 'string' ? t.note : ''}
                      onChange={(e) => {
                        const idx2 = trainings.findIndex(tr => tr.date + (tr.createdBy || '') === t.date + (t.createdBy || ''));
                        if (idx2 === -1) return;
                        const updated = [...trainings];
                        updated[idx2].note = e.target.value;
                        setTrainings(updated);
                      }}
                      onBlur={(e) => saveTrainingNote(t, e.target.value)}
                    />
                  </div>

                  {/* Spieler/Trainer Liste inkl. Notiz pro Spielerin */}
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
                              {/* Trainer-Notiz optional */}
                              <input
                                type="text"
                                placeholder="Notiz zur Trainerin"
                                value={t.playerNotes?.[p.name] || ""}
                                onChange={e => {
                                  const idx2 = trainings.findIndex(tr => tr.date + (tr.createdBy || '') === t.date + (t.createdBy || ''));
                                  if (idx2 === -1) return;
                                  const updated = [...trainings];
                                  updated[idx2].playerNotes = { ...updated[idx2].playerNotes, [p.name]: e.target.value };
                                  setTrainings(updated);
                                }}
                                onBlur={e => savePlayerNote(t, p.name, e.target.value)}
                                style={{marginLeft: 10, minWidth: 120, background:'#222c', color:'#fff', border:'1px solid #226', borderRadius:'4px', padding:'0.2rem'}}
                              />
                            </div>
                          );
                        } else {
                          const statusIcon = (t.participants && t.participants[p.name]) || '—';
                          return (
                            <div key={p.name} className="participant">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%' }}>
                                <span>
                                  {p.name}
                                  <em className="status-text">{iconToText(statusIcon)}</em>
                                </span>
                                <div className="btn-part-status">
                                  {['✅', '❌', '⏳', '—', '⁉️'].map((icon, idx) => (
                                    <button
                                      key={idx}
                                      className={statusIcon === icon ? 'active' : ''}
                                      onClick={() => updateParticipation(t, p.name, icon)}
                                    >
                                      {icon}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Notiz zur Spielerin"
                                  value={t.playerNotes?.[p.name] || ""}
                                  onChange={e => {
                                    const idx2 = trainings.findIndex(tr => tr.date + (tr.createdBy || '') === t.date + (t.createdBy || ''));
                                    if (idx2 === -1) return;
                                    const updated = [...trainings];
                                    updated[idx2].playerNotes = { ...updated[idx2].playerNotes, [p.name]: e.target.value };
                                    setTrainings(updated);
                                  }}
                                  onBlur={e => savePlayerNote(t, p.name, e.target.value)}
                                  style={{marginLeft: 10, minWidth: 120, background:'#222c', color:'#fff', border:'1px solid #226', borderRadius:'4px', padding:'0.2rem'}}
                                />
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
      )}

      {/* === Auswertung === */}
      {showReport && (
        <section className="report-section">
          {/* ... (unverändert, nur iconToText/Teilnahmewertung wie oben!) ... */}
        </section>
      )}

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
