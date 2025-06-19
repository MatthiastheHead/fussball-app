import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

const iconToText = (icon) => {
  switch (icon) {
    case '✅': return ' Teilnehmend';
    case '❌': return ' Abgemeldet';
    case '⏳': return ' Keine Rückmeldung';
    case '⁉️': return ' Keine Rückmeldung-teilnehmend';
    case '—': return '';
    default: return ' Zugesagt aber Abwesend';
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
  const [newHinweis, setNewHinweis] = useState('');
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

  // NEU: Menü-States
  const [showStartMenu, setShowStartMenu] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const version = '2.8';

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
      setShowStartMenu(true);
      setShowSettings(false);
    } else {
      setLoginError('Falscher Benutzername oder Passwort.');
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setShowStartMenu(true);
    setShowSettings(false);
    setShowTeam(false);
    setShowAdmin(false);
    setLoginError('');
  };

  // ...restliche States und Funktionen wie gehabt...

  // ------------- NEU: RENDERING: Login, Startmenü, Settings ------------

  // 1. Login
  if (!loggedInUser) {
    return (
      <div className="login-screen modern-dark-blue">
        <div className="login-icon-row">
          <span className="login-icon" role="img" aria-label="fußball">⚽</span>
        </div>
        <h1 className="login-headline">Fußball-App</h1>
        <div className="login-version">Version {version}</div>
        <div className="login-hint">
          Nach längerer Inaktivität muss der Server aktiviert werden. Dies dauert einen Moment. Beim Start des Servers ist kein Login möglich.
        </div>
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

  // 2. Startmenü (nach Login)
  if (showStartMenu) {
    return (
      <div className="start-menu modern-dark-blue">
        <h2 style={{color:'#7dc4ff', marginTop:'1.3em'}}>Willkommen, {loggedInUser}!</h2>
        <button
          className="main-func-btn"
          style={{margin:'2.2em auto 0 auto', fontSize:'1.3rem', minWidth:260}}
          onClick={() => { setShowStartMenu(false); setShowSettings(false); }}
        >
          ⚽ Trainingsteilnahme
        </button>
        <button
          className="main-func-btn"
          style={{margin:'0.9em auto 0 auto', fontSize:'1.13rem', minWidth:260}}
          onClick={() => { setShowSettings(true); setShowStartMenu(false); }}
        >
          ⚙️ Einstellungen
        </button>
        <div style={{marginTop:'3.5em', textAlign:'center', color:'#8bb2f4', fontSize:'1.04rem'}}>© 2025 Matthias Kopf</div>
        <button
          style={{
            margin: '2.5em auto 0 auto',
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
      </div>
    );
  }

  // 3. Einstellungen (Settings-Menü)
  if (showSettings) {
    return (
      <div className="App">
        <header>
          <h1>⚙️ Einstellungen</h1>
        </header>
        {/* Teamverwaltung */}
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
              type="text"
              placeholder="Notiz"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <input
              type="text"
              placeholder="Hinweis"
              value={newHinweis}
              onChange={(e) => setNewHinweis(e.target.value)}
            />
            <button onClick={addPlayer}>➕ Hinzufügen</button>
          </div>
          <ul className="player-list">
            {players
              .sort((a, b) => a.name.localeCompare(b.name))
              .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
              .map((p) =>
                editPlayerId === p.name ? (
                  <li key={p.name} className="edit-player-row">
                    <input
                      type="text"
                      value={playerDraft.name}
                      onChange={e => setPlayerDraft(draft => ({ ...draft, name: e.target.value }))}
                    />
                    <input
                      type="text"
                      value={playerDraft.note}
                      onChange={e => setPlayerDraft(draft => ({ ...draft, note: e.target.value }))}
                      onBlur={e => handlePlayerNoteBlur(playerDraft, e.target.value)}
                      placeholder="Notiz"
                    />
                    <input
                      type="text"
                      value={playerDraft.hinweis}
                      onChange={e => setPlayerDraft(draft => ({ ...draft, hinweis: e.target.value }))}
                      onBlur={e => handlePlayerHinweisBlur(playerDraft, e.target.value)}
                      placeholder="Hinweis"
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
                  <li key={p.name}>
                    <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>
                      {p.name}
                    </span>
                    <input
                      type="text"
                      value={p.note || ""}
                      placeholder="Notiz"
                      style={{marginLeft: '1rem', background:'#222c', color:'#fff', border:'1px solid #226', borderRadius:'4px', padding:'0.2rem'}}
                      onChange={e => {
                        const idx = players.findIndex(x => x.name === p.name);
                        const updated = [...players];
                        updated[idx].note = e.target.value;
                        setPlayers(updated);
                      }}
                      onBlur={e => handlePlayerNoteBlur(p, e.target.value)}
                    />
                    <input
                      type="text"
                      value={p.hinweis || ""}
                      placeholder="Hinweis"
                      style={{marginLeft: '1rem', background:'#222c', color:'#fff', border:'1px solid #226', borderRadius:'4px', padding:'0.2rem', minWidth: '90px'}}
                      onChange={e => {
                        const idx = players.findIndex(x => x.name === p.name);
                        const updated = [...players];
                        updated[idx].hinweis = e.target.value;
                        setPlayers(updated);
                      }}
                      onBlur={e => handlePlayerHinweisBlur(p, e.target.value)}
                    />
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
        {/* Admin-Bereich nur für Matthias */}
        {loggedInUser === 'Matthias' && (
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
        <button
          className="main-func-btn"
          style={{margin:'2em auto 0 auto', width:'260px'}}
          onClick={() => { setShowSettings(false); setShowStartMenu(true); }}
        >
          Zurück zum Startmenü
        </button>
        <footer>
          <div style={{marginTop:'2.5em', color:'#8bb2f4', fontSize:'0.97rem'}}>
            © 2025 Matthias Kopf
          </div>
        </footer>
      </div>
    );
  }
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
    const weekday = ['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const formatted = `${weekday}, ${dd}.${mm}.${yyyy}`;
    const timestamp = formatDateTime(now);

    const updated = [
      ...trainings,
      {
        date: formatted,
        participants: {},
        trainerStatus: {},
        playerNotes: {},
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
      .then(trainingsFromServer => {
        setTrainings(trainingsFromServer.map(t => ({
          ...t,
          participants: t.participants || {},
          trainerStatus: t.trainerStatus || {},
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
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
        .then(trainingsFromServer => {
          setTrainings(trainingsFromServer.map(t => ({
            ...t,
            participants: t.participants || {},
            trainerStatus: t.trainerStatus || {},
            playerNotes: t.playerNotes || {},
            note: typeof t.note === 'string' ? t.note : '',
          })));
          alert('Training gelöscht.');
        })
        .catch(() => alert('Fehler beim Löschen des Trainings.'));
    }
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
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
        })));
        alert('Trainingsnotiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Spieler-Notiz (im Training) – SPEICHERT DAUERHAFT onBlur
  const savePlayerNote = (training, playerName, noteValue) => {
    const idx = trainings.findIndex(t => t.date + (t.createdBy || '') === training.date + (training.createdBy || ''));
    if (idx === -1) return;
    const updated = [...trainings];
    updated[idx].playerNotes = {
      ...updated[idx].playerNotes,
      [playerName]: noteValue
    };
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
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
        })));
        alert('Spieler-Notiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Spieler-Notiz.'));
  };

  // Trainingsdatum editieren
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
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
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
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
        })));
        alert(
          `Teilnahmestatus von "${name}" im Training vom "${updated[idx].date}" wurde auf "${iconToText(statusIcon).trim()}" gesetzt.`
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
          playerNotes: t.playerNotes || {},
          note: typeof t.note === 'string' ? t.note : '',
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

  // === RENDERING: Hauptansicht ===
  return (
    <div className="App">
      <header>
        <h1>⚽ Fußball‐App <span className="blue-version">{version}</span> Trainingsteilnahme</h1>
      </header>

      <div className="controls mobile-controls">
        <button className="main-func-btn" onClick={addTraining}>➕ Training hinzufügen</button>
        <button className="main-func-btn" onClick={() => setShowStartMenu(true)}>
          Zurück zum Startmenü
        </button>
        <button className="main-func-btn" onClick={() => setShowTrainings(!showTrainings)}>
          {showTrainings ? "Trainingsliste verbergen" : "Gespeicherte Trainings anzeigen"}
        </button>
        <button className="main-func-btn" onClick={() => setShowReport(!showReport)}>
          {showReport ? "Auswertung verbergen" : "Auswertung anzeigen"}
        </button>
      </div>

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
                          // Setze das Datumsfeld für dieses Training
                          const parts = (t.date || '').split(', ')[1]?.split('.') || [];
                          setEditDateValue(parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '');
                          setEditDateIdx(idx);
                        }}
                      >
                        ✏️ Datum anpassen
                      </button>
                    </div>
                  )}

                  {/* Notizfeld zum Training */}
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
                  {/* Teilnehmerliste als Card */}
                  {players
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
                    .map((p) => {
                      const isTrainer = !!p.isTrainer;
                      // Hinweis aus Teamverwaltung holen:
                      const teamHinweis = p.hinweis || "";

                      // Trainingsnotiz für diesen Spieler
                      const playerNote = (t.playerNotes && t.playerNotes[p.name]) || "";

                      if (isTrainer) {
                        const trainerStatus = (t.trainerStatus && t.trainerStatus[p.name]) || 'Abgemeldet';
                        return (
                          <div key={p.name + 'trainer'} className="player-card">
                            <div className="participant-col">
                              <span>
                                <b>{p.name}</b> <em style={{color:"#ffe548", fontWeight:500}}>(Trainer:in)</em>
                              </span>
                              {teamHinweis && (
                                <div style={{ fontSize: "0.93em", color: "#9cc6ff", marginBottom: "0.2em" }}>
                                  Hinweis: {teamHinweis}
                                </div>
                              )}
                              <div style={{margin: "0.3em 0"}}>
                                <span>Status: </span>
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
                            </div>
                          </div>
                        );
                      } else {
                        const statusIcon = (t.participants && t.participants[p.name]) || '—';
                        return (
                          <div key={p.name} className="player-card">
                            <div className="participant-col">
                              <span><b>{p.name}</b></span>
                              {teamHinweis && (
                                <div style={{ fontSize: "0.93em", color: "#9cc6ff", marginBottom: "0.2em" }}>
                                  Hinweis: {teamHinweis}
                                </div>
                              )}
                              <div style={{margin: "0.3em 0"}}>
                                <span>Status:</span>
                                <div className="btn-part-status status-btn-row">
                                  {['✅', '❌', '⏳', '⁉️', '—'].map((icon, idx) => (
                                    <button
                                      key={idx}
                                      className={statusIcon === icon ? 'active' : ''}
                                      onClick={() => updateParticipation(t, p.name, icon)}
                                    >
                                      {icon}
                                    </button>
                                  ))}
                                  <span className="status-text">{iconToText(statusIcon)}</span>
                                </div>
                              </div>
                              {/* Notizfeld zum Spieler für dieses Training */}
                              <div style={{ margin: "0.35em 0 0.1em 0" }}>
                                <textarea
                                  rows={1}
                                  placeholder="Notiz zum Spieler (Training)"
                                  style={{
                                    width: "99%",
                                    minHeight: "38px",
                                    maxHeight: "60px",
                                    fontSize: "1em",
                                    background: "#232942",
                                    color: "#96ffc4",
                                    border: "1.2px solid #2d385b",
                                    borderRadius: "5px",
                                    resize: "vertical",
                                    overflowY: "auto"
                                  }}
                                  value={playerNote}
                                  onChange={e => {
                                    // Sofort lokal, dann DB bei Blur:
                                    const idxT = trainings.findIndex(tr => tr.date + (tr.createdBy || '') === t.date + (t.createdBy || ''));
                                    if (idxT === -1) return;
                                    const updatedTrainings = [...trainings];
                                    updatedTrainings[idxT].playerNotes = {
                                      ...updatedTrainings[idxT].playerNotes,
                                      [p.name]: e.target.value
                                    };
                                    setTrainings(updatedTrainings);
                                  }}
                                  onBlur={e => savePlayerNote(t, p.name, e.target.value)}
                                />
                              </div>
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
          {/* ...wie gehabt, ggf. von vorher übernehmen... */}
        </section>
      )}

      {/* Footer und Logout ganz unten */}
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
        <p style={{
          fontSize: "0.93rem", color: "#8bb2f4", marginTop: "0.4rem", marginBottom: "1.3rem"
        }}>
          © 2025 Matthias Kopf. Alle Rechte vorbehalten.
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
