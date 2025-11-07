// Version 5.1: Erweiterungen
// - Integration der "Inaktiv"-Funktion: Spieler und Trainer können deaktiviert werden.
//   Inaktive Mitglieder werden in den Listen grau dargestellt und erscheinen nicht mehr in Auswertungen.
// - Anpassungen für Version 5.1 (Versionsnummer aktualisiert).
// - Die API-Basisadresse wird weiterhin zuerst aus ENV gelesen, ansonsten Fallback.

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './App.css';

// API-Basis: zuerst ENV, ansonsten abhängig vom Hostname
const API = import.meta.env.VITE_API_BASE ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001/'
    : 'https://fussball-api.onrender.com/');

// Icons für den Teilnahme‑Status
const STATUS_ICONS = ['✅', '❌', '⏳'];

// Icon zu Text
const iconToText = (icon) => {
  switch (icon) {
    case '✅':
      return ' Teilnehmend';
    case '❌':
      return ' Abgemeldet';
    case '⏳':
      return ' Keine Rückmeldung';
    default:
      return ' Keine Rückmeldung';
  }
};

// Datum/Zeit formatieren: DD.MM.YYYY HHMM
const formatDateTime = (dateObj) => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}${minutes}`;
};

// Deutsches Datum (Wochentag, DD.MM.YYYY) in Date konvertieren
const parseGermanDate = (str) => {
  const datePart = str && str.includes(',') ? str.split(', ')[1] : str;
  if (!datePart) return new Date(0);
  const [d, m, y] = datePart.split('.');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthcheck() {
  try {
    const res = await fetch(API + 'health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBackendAwake() {
  for (let i = 0; i < 3; i++) {
    const ok = await healthcheck();
    if (ok) return true;
    await wait(1500 * (i + 1));
  }
  return false;
}

export default function App() {
  // State-Definitionen
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);

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
  const [checklists, setChecklists] = useState([]);
  const [showChecklists, setShowChecklists] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [expandedChecklist, setExpandedChecklist] = useState(null);
  const [showStartMenu, setShowStartMenu] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const version = '5.1';

  async function runOnce(fn) {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function refetchAll() {
    try {
      const [u, p, t, c] = await Promise.all([
        fetch(API + 'users').then((r) => (r.ok ? r.json() : [])),
        fetch(API + 'players').then((r) => (r.ok ? r.json() : [])),
        fetch(API + 'trainings').then((r) => (r.ok ? r.json() : [])),
        fetch(API + 'checklists').then((r) => (r.ok ? r.json() : [])),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setPlayers(
        Array.isArray(p)
          ? p.map((x) => ({
              ...x,
              inactive: !!x.inactive,
            }))
          : []
      );
      setTrainings(
        Array.isArray(t)
          ? t.map((x) => ({
              ...x,
              participants: x.participants || {},
              trainerStatus: x.trainerStatus || {},
              playerNotes: x.playerNotes || {},
              note: typeof x.note === 'string' ? x.note : '',
              createdBy: x.createdBy || '',
              lastEdited: x.lastEdited || null,
            }))
          : []
      );
      setChecklists(Array.isArray(c) ? c : []);
    } catch {
      // ignorieren
    }
  }

  useEffect(() => {
    (async () => {
      await ensureBackendAwake();
      await refetchAll();
    })();
  }, []);

  const handleLogin = () => {
    const trimmedName = loginName.trim();
    const user = users.find(
      (u) => u.name === trimmedName && u.password === loginPass
    );
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
    setShowChecklists(false);
    setLoginError('');
  };

  // Neue Benutzerverwaltung
  const addNewUser = () =>
    runOnce(async () => {
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
      const res = await fetch(API + 'users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Anlegen des Benutzers.');
        return;
      }
      await refetchAll();
      setNewUserName('');
      setNewUserPass('');
      alert('Neuer Benutzer angelegt.');
    });

  const updateUserPassword = (index, newPass) =>
    runOnce(async () => {
      const updated = [...users];
      updated[index].password = newPass;
      const res = await fetch(API + 'users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Aktualisieren des Passworts.');
        return;
      }
      await refetchAll();
      alert(`Passwort für ${updated[index].name} geändert.`);
    });

  const deleteUser = (index) =>
    runOnce(async () => {
      const userToDelete = users[index];
      if (userToDelete.name === 'Matthias') {
        alert('Den Administrator kann man nicht löschen.');
        return;
      }
      if (!window.confirm(`Benutzer ${userToDelete.name} wirklich löschen?`)) return;
      const updated = [...users];
      updated.splice(index, 1);
      const res = await fetch(API + 'users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Löschen des Benutzers.');
        return;
      }
      await refetchAll();
      alert('Benutzer gelöscht.');
    });

  // Spieler bearbeiten
  const startEditPlayer = (player) => {
    setEditPlayerId(player.name);
    setPlayerDraft({
      ...player,
      note: player.note || '',
      memberSince: player.memberSince || '',
      inactive: !!player.inactive,
    });
  };

  const saveEditPlayer = () =>
    runOnce(async () => {
      const idx = players.findIndex((p) => p.name === editPlayerId);
      if (idx === -1) return;
      const updated = [...players];
      updated[idx] = {
        ...playerDraft,
        note: typeof playerDraft.note === 'string' ? playerDraft.note : '',
        memberSince:
          typeof playerDraft.memberSince === 'string'
            ? playerDraft.memberSince
            : '',
        inactive: !!playerDraft.inactive,
      };
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      setEditPlayerId(null);
      setPlayerDraft({});
      if (!res.ok) {
        alert('Fehler beim Bearbeiten.');
        return;
      }
      await refetchAll();
      alert('Änderung gespeichert.');
    });

  const cancelEditPlayer = () => {
    setEditPlayerId(null);
    setPlayerDraft({});
  };

  const addPlayer = () =>
    runOnce(async () => {
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
          memberSince: typeof newMemberSince === 'string' ? newMemberSince : '',
          inactive: false,
        },
      ];
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Hinzufügen des Team-Mitglieds.');
        return;
      }
      await refetchAll();
      setNewName('');
      setNewRole('Spieler');
      setNewNote('');
      setNewMemberSince('');
      alert('Team-Mitglied hinzugefügt.');
    });

  const handlePlayerNoteBlur = (player, noteValue) =>
    runOnce(async () => {
      const idx = players.findIndex((p) => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated[idx].note = noteValue;
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Speichern der Notiz.');
        return;
      }
      await refetchAll();
      alert('Notiz gespeichert.');
    });

  const handlePlayerMemberSinceBlur = (player, memberSinceValue) =>
    runOnce(async () => {
      const idx = players.findIndex((p) => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated[idx].memberSince = memberSinceValue;
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Speichern des Hinweises.');
        return;
      }
      await refetchAll();
      alert('Hinweis gespeichert.');
    });

  const changeRole = (player, role) =>
    runOnce(async () => {
      const idx = players.findIndex((p) => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated[idx].isTrainer = role === 'Trainer';
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Ändern der Rolle.');
        return;
      }
      await refetchAll();
      alert('Rolle geändert.');
    });

  const deletePlayer = (player) =>
    runOnce(async () => {
      if (!window.confirm(`Team-Mitglied ${player.name} wirklich löschen?`)) return;
      const idx = players.findIndex((p) => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated.splice(idx, 1);
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Löschen des Team-Mitglieds.');
        return;
      }
      await refetchAll();
      alert('Team-Mitglied gelöscht.');
    });

  // Neu: Spieler/Trainer aktiv/inaktiv toggeln
  const toggleInactive = (player) =>
    runOnce(async () => {
      const idx = players.findIndex((p) => p.name === player.name);
      if (idx === -1) return;
      const updated = [...players];
      updated[idx].inactive = !updated[idx].inactive;
      const res = await fetch(API + 'players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Ändern des Aktivstatus.');
        return;
      }
      await refetchAll();
      alert(
        updated[idx].inactive
          ? `Mitglied ${player.name} inaktiv geschaltet.`
          : `Mitglied ${player.name} reaktiviert.`
      );
    });

  function sortTrainings(arr) {
    return [...arr].sort((a, b) => {
      const ad = (a.date || '').split(', ')[1]?.split('.').reverse().join('') || '';
      const bd = (b.date || '').split(', ')[1]?.split('.').reverse().join('') || '';
      return bd.localeCompare(ad);
    });
  }

  const addTraining = () =>
    runOnce(async () => {
      if (!loggedInUser) {
        alert('Bitte zuerst einloggen.');
        return;
      }
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const weekday = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][now.getDay()];
      const formatted = `${weekday}, ${dd}.${mm}.${yyyy}`;
      const timestamp = formatDateTime(now);
      if (trainings.some((t) => (t.date || '').includes(`${dd}.${mm}.${yyyy}`))) {
        if (!window.confirm('Es gibt heute schon ein Training. Trotzdem noch eins anlegen?')) return;
      }
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
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Anlegen des Trainings.');
        return;
      }
      await refetchAll();
      alert('Neues Training angelegt.');
    });

  const deleteTraining = (training) =>
    runOnce(async () => {
      if (!window.confirm('Training wirklich löschen?')) return;
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated.splice(idx, 1);
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Löschen des Trainings.');
        return;
      }
      await refetchAll();
      alert('Training gelöscht.');
    });

  const saveTrainingNote = (training, noteValue) =>
    runOnce(async () => {
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated[idx].note = noteValue;
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Speichern der Notiz.');
        return;
      }
      await refetchAll();
      alert('Trainingsnotiz gespeichert.');
    });

  const savePlayerNote = (training, playerName, noteValue) =>
    runOnce(async () => {
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated[idx].playerNotes = {
        ...(updated[idx].playerNotes || {}),
        [playerName]: noteValue,
      };
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Speichern der Notiz.');
        return;
      }
      await refetchAll();
      alert('Notiz gespeichert.');
    });

  const saveEditedDate = (training, newDateValue) =>
    runOnce(async () => {
      if (!newDateValue) return;
      const [year, month, day] = newDateValue.split('-');
      const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
      const weekday = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][dateObj.getDay()];
      const formatted = `${weekday}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
      const now = new Date();
      const timestamp = formatDateTime(now);
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated[idx].date = formatted;
      updated[idx].isEditing = false;
      updated[idx].lastEdited = { by: loggedInUser, at: timestamp };
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Aktualisieren des Datums.');
        return;
      }
      await refetchAll();
      alert('Datum wurde aktualisiert.');
    });

  // Trainingsliste von Duplikaten bereinigen (nach Datum)
  const removeDuplicateTrainings = () =>
    runOnce(async () => {
      // Erstelle neue Liste, behalte nur das erste Training pro Datum
      const uniqueList = [];
      const seen = new Set();
      for (const tr of trainings) {
        const key = tr.date || '';
        if (!seen.has(key)) {
          seen.add(key);
          uniqueList.push(tr);
        }
      }
      if (uniqueList.length === trainings.length) {
        alert('Keine doppelten Trainings vorhanden.');
        return;
      }
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: uniqueList }),
      });
      if (!res.ok) {
        alert('Fehler beim Entfernen der doppelten Trainings.');
        return;
      }
      await refetchAll();
      alert('Doppelte Trainings wurden entfernt.');
    });

  // Status ändern
  const updateParticipation = (training, name, statusIcon) =>
    runOnce(async () => {
      const now = new Date();
      const timestamp = formatDateTime(now);
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated[idx].participants = updated[idx].participants || {};
      updated[idx].participants[name] = statusIcon;
      updated[idx].lastEdited = { by: loggedInUser, at: timestamp };
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        console.error('Fehler beim Aktualisieren des Teilnahme-Status.');
        return;
      }
      setTrainings(updated);
    });

  const updateTrainerStatus = (training, name, newStatus) =>
    runOnce(async () => {
      const now = new Date();
      const timestamp = formatDateTime(now);
      const idx = trainings.findIndex(
        (t) => (t.date || '') + (t.createdBy || '') === training.date + (training.createdBy || '')
      );
      if (idx === -1) return;
      const updated = [...trainings];
      updated[idx].trainerStatus = updated[idx].trainerStatus || {};
      updated[idx].trainerStatus[name] = newStatus;
      updated[idx].lastEdited = { by: loggedInUser, at: timestamp };
      const res = await fetch(API + 'trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        console.error('Fehler beim Aktualisieren des Trainer-Status.');
        return;
      }
      setTrainings(updated);
    });

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = [...sortedPlayers].sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0));

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

  // === UI Rendering ===
  if (!loggedInUser) {
    return (
      <div className="login-screen modern-dark-blue">
        <div className="login-icon-row">
          <span className="login-icon" role="img" aria-label="fußball">⚽</span>
        </div>
        <div>
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
          <button onClick={handleLogin} disabled={busy}>
            {busy ? 'Bitte warten…' : 'Einloggen'}
          </button>
          {loginError && <p className="login-error">{loginError}</p>}
        </div>
      </div>
    );
  }

  if (showStartMenu) {
    return (
      <div className="start-menu modern-dark-blue">
        <h2 style={{ color: '#7dc4ff', marginTop: '1.3em' }}>Willkommen, {loggedInUser}!</h2>
        <button
          className="main-func-btn"
          style={{ margin: '2.2em auto 0 auto', fontSize: '1.3rem', minWidth: 260 }}
          onClick={() => {
            setShowStartMenu(false);
            setShowSettings(false);
            setShowChecklists(false);
          }}
          disabled={busy}
        >
          {busy ? 'Bitte warten…' : '⚽ Trainingsteilnahme'}
        </button>
        <button
          className="main-func-btn"
          style={{ margin: '0.9em auto 0 auto', fontSize: '1.13rem', minWidth: 260 }}
          onClick={() => {
            setShowChecklists(true);
            setShowStartMenu(false);
            setShowSettings(false);
          }}
          disabled={busy}
        >
          ✔ Checklisten
        </button>
        <button
          className="main-func-btn"
          style={{ margin: '0.9em auto 0 auto', fontSize: '1.13rem', minWidth: 260 }}
          onClick={() => {
            setShowSettings(true);
            setShowStartMenu(false);
          }}
          disabled={busy}
        >
          ⚙ Einstellungen
        </button>
        <div style={{ marginTop: '3.5em', textAlign: 'center', color: '#8bb2f4', fontSize: '1.04rem' }}>
          © 2025 Matthias Kopf
        </div>
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
          disabled={busy}
        >
          Logout
        </button>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="App">
        <header>
          <h1>⚙ Einstellungen</h1>
        </header>
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
              value={newMemberSince}
              onChange={(e) => setNewMemberSince(e.target.value)}
            />
            <button onClick={addPlayer} disabled={busy}>
              {busy ? 'Bitte warten…' : '➕ Hinzufügen'}
            </button>
          </div>
          <ul className="player-list">
            {players
              .sort((a, b) => a.name.localeCompare(b.name))
              .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
              .map((p) =>
                editPlayerId === p.name ? (
                  <li
                    key={p.name}
                    className="edit-player-row"
                    style={{ opacity: p.inactive ? 0.5 : 1 }}
                  >
                    <input
                      type="text"
                      value={playerDraft.name}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, name: e.target.value }))
                      }
                    />
                    <input
                      type="text"
                      value={playerDraft.note}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, note: e.target.value }))
                      }
                      onBlur={(e) => handlePlayerNoteBlur(playerDraft, e.target.value)}
                      placeholder="Notiz"
                    />
                    <input
                      type="text"
                      value={playerDraft.memberSince}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, memberSince: e.target.value }))
                      }
                      onBlur={(e) => handlePlayerMemberSinceBlur(playerDraft, e.target.value)}
                      placeholder="Hinweis"
                    />
                    <select
                      className="role-dropdown"
                      value={playerDraft.isTrainer ? 'Trainer' : 'Spieler'}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, isTrainer: e.target.value === 'Trainer' }))
                      }
                    >
                      <option value="Spieler">Spieler</option>
                      <option value="Trainer">Trainer</option>
                    </select>
                    <label style={{ marginLeft: '0.5rem', color: '#ccc' }}>
                      <input
                        type="checkbox"
                        checked={!!playerDraft.inactive}
                        onChange={(e) =>
                          setPlayerDraft((draft) => ({ ...draft, inactive: e.target.checked }))
                        }
                      />{' '}
                      Inaktiv
                    </label>
                    <button className="btn-save-players" onClick={saveEditPlayer} disabled={busy}>
                      {busy ? '…' : '💾 Speichern'}
                    </button>
                    <button className="btn-delete" onClick={cancelEditPlayer} disabled={busy}>
                      Abbrechen
                    </button>
                  </li>
                ) : (
                  <li
                    key={p.name}
                    style={{ opacity: p.inactive ? 0.5 : 1 }}
                  >
                    <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>{p.name}</span>
                    <input
                      type="text"
                      value={p.note || ''}
                      placeholder="Notiz"
                      style={{
                        marginLeft: '1rem',
                        background: '#222c',
                        color: '#fff',
                        border: '1px solid #226',
                        borderRadius: '4px',
                        padding: '0.2rem',
                      }}
                      onChange={(e) => {
                        const idx = players.findIndex((x) => x.name === p.name);
                        const updated = [...players];
                        updated[idx].note = e.target.value;
                        setPlayers(updated);
                      }}
                      onBlur={(e) => handlePlayerNoteBlur(p, e.target.value)}
                    />
                    <input
                      type="text"
                      value={p.memberSince || ''}
                      placeholder="Hinweis"
                      style={{
                        marginLeft: '1rem',
                        background: '#222c',
                        color: '#fff',
                        border: '1px solid #226',
                        borderRadius: '4px',
                        padding: '0.2rem',
                        minWidth: '90px',
                      }}
                      onChange={(e) => {
                        const idx = players.findIndex((x) => x.name === p.name);
                        const updated = [...players];
                        updated[idx].memberSince = e.target.value;
                        setPlayers(updated);
                      }}
                      onBlur={(e) => handlePlayerMemberSinceBlur(p, e.target.value)}
                    />
                    <div>
                      <select
                        className="role-dropdown"
                        value={p.isTrainer ? 'Trainer' : 'Spieler'}
                        onChange={(e) => changeRole(p, e.target.value)}
                        disabled={busy}
                      >
                        <option value="Spieler">Spieler</option>
                        <option value="Trainer">Trainer</option>
                      </select>
                      <label style={{ marginLeft: '0.5rem', color: '#ccc' }}>
                        <input
                          type="checkbox"
                          checked={!!p.inactive}
                          onChange={() => toggleInactive(p)}
                          disabled={busy}
                        />{' '}
                        Inaktiv
                      </label>
                      <button className="btn-edit" onClick={() => startEditPlayer(p)} disabled={busy}>
                        ✏ Bearbeiten
                      </button>
                      <button className="btn-delete" onClick={() => deletePlayer(p)} disabled={busy}>
                        ❌ Löschen
                      </button>
                    </div>
                  </li>
                )
              )}
          </ul>
        </section>
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
              <button onClick={addNewUser} disabled={busy}>
                {busy ? '…' : '➕ Erstellen'}
              </button>
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
                  <button className="btn-delete" onClick={() => deleteUser(idx)} disabled={busy}>
                    ❌ Löschen
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button
          className="main-func-btn"
          style={{ margin: "1.5em auto 0 auto", width: "260px" }}
          onClick={removeDuplicateTrainings}
          disabled={busy}
        >
          Doppelte Trainings entfernen
        </button>
        <button
          className="main-func-btn"
          style={{ margin: '2em auto 0 auto', width: '260px' }}
          onClick={() => {
            setShowSettings(false);
            setShowStartMenu(true);
          }}
          disabled={busy}
        >
          Zurück zum Startmenü
        </button>
        <footer>
          <div style={{ marginTop: '2.5em', color: '#8bb2f4', fontSize: '0.97rem' }}>
            © 2025 Matthias Kopf
          </div>
        </footer>
      </div>
    );
  }

  if (!showStartMenu && !showSettings && !showChecklists) {
    return (
      <div className="App">
        <header>
          <h1>
            ⚽ Fußball‐App <span className="blue-version">{version}</span> Trainingsteilnahme
          </h1>
        </header>
        <div className="controls mobile-controls">
          <button className="main-func-btn" onClick={addTraining} disabled={busy}>
            {busy ? 'Bitte warten…' : '➕ Training hinzufügen'}
          </button>
          <button
            className="main-func-btn"
            onClick={() => setShowTrainings(!showTrainings)}
            disabled={busy}
          >
            {showTrainings ? 'Trainingsliste verbergen' : 'Gespeicherte Trainings anzeigen'}
          </button>
          <button
            className="main-func-btn"
            onClick={() => setShowReport(!showReport)}
            disabled={busy}
          >
            {showReport ? 'Auswertung verbergen' : 'Auswertung anzeigen'}
          </button>
          <button
            className="main-func-btn"
            onClick={() => {
              setShowStartMenu(true);
              setShowSettings(false);
            }}
            disabled={busy}
          >
            Zurück zum Startmenü
          </button>
        </div>
        {showTrainings && (
          <section className="trainings-list">
            <div className="training-filter">
              <label>
                Nach Datum filtern{' '}
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </label>
              <label>
                Suchen{' '}
                <input
                  type="text"
                  placeholder="Datum oder Text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ minWidth: 140 }}
                />
              </label>
              <button
                onClick={() => {
                  setFilterDate('');
                  setSearchText('');
                }}
                disabled={busy}
              >
                Filter zurücksetzen
              </button>
            </div>
            {trainingsToShow.map((t, idx) => {
              const tKey = (t._id || '') + (t.date || '') + (t.createdBy || '');
              const expandedKey = expandedTraining === tKey;
              return (
                <div key={tKey} className="training">
                  <h3
                    className={`training-header ${expandedKey ? 'expanded' : ''}`}
                    onClick={() => setExpandedTraining(expandedKey ? null : tKey)}
                  >
                    📅 {t.date} {expandedKey ? '🔽' : '▶'}
                  </h3>
                  {expandedKey && (
                    <div>
                      <div className="created-by">
                        Ersteller <strong>{t.createdBy || ''}</strong>
                      </div>
                      {t.lastEdited && (
                        <div className="last-edited">
                          Zuletzt bearbeitet <strong>{t.lastEdited.at}</strong> von{' '}
                          <strong>{t.lastEdited.by}</strong>
                        </div>
                      )}
                      {editDateIdx === idx ? (
                        <div className="edit-date-row">
                          <input
                            type="date"
                            className="edit-date-input"
                            value={editDateValue}
                            onChange={(e) => setEditDateValue(e.target.value)}
                          />
                          <button
                            className="btn-save-date"
                            onClick={() => {
                              saveEditedDate(t, editDateValue);
                              setEditDateIdx(null);
                              setEditDateValue('');
                            }}
                            disabled={busy}
                          >
                            Speichern
                          </button>
                          <button
                            className="btn-save-date"
                            onClick={() => {
                              setEditDateIdx(null);
                              setEditDateValue('');
                            }}
                            disabled={busy}
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
                              setEditDateValue(
                                parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : ''
                              );
                              setEditDateIdx(idx);
                            }}
                            disabled={busy}
                          >
                            ✏ Datum anpassen
                          </button>
                        </div>
                      )}
                      <div className="note-field">
                        <textarea
                          rows={2}
                          placeholder="Notiz zum Training (z.B. was gemacht wurde...)"
                          value={typeof t.note === 'string' ? t.note : ''}
                          onChange={(e) => {
                            const idx2 = trainings.findIndex(
                              (tr) =>
                                (tr._id || '') + (tr.date || '') + (tr.createdBy || '') === tKey
                            );
                            if (idx2 === -1) return;
                            const updated = [...trainings];
                            updated[idx2].note = e.target.value;
                            setTrainings(updated);
                          }}
                          onBlur={(e) => saveTrainingNote(t, e.target.value)}
                        />
                      </div>
                      {players
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0))
                        .map((p, idxP) => {
                          const isTrainer = !!p.isTrainer;
                          const teamHinweis = p.memberSince || '';
                          const playerNote = (t.playerNotes && t.playerNotes[p.name]) || '';
                          const cardBg = idxP % 2 === 0 ? 'player-card even' : 'player-card odd';
                          const inactiveStyle = { opacity: p.inactive ? 0.5 : 1 };
                          if (isTrainer) {
                            const trainerStatus = (t.trainerStatus && t.trainerStatus[p.name]) || 'Abgemeldet';
                            return (
                              <div key={p.name + 'trainer'} className={cardBg} style={inactiveStyle}>
                                <div className="participant-col">
                                  <span>
                                    <b>{p.name}</b> <em style={{ color: '#ffe548', fontWeight: 500 }}>(Trainer*in)</em>
                                  </span>
                                  {teamHinweis && (
                                    <div
                                      style={{ fontSize: '0.93em', color: '#9cc6ff', marginBottom: '0.2em' }}
                                    >
                                      Hinweis {teamHinweis}
                                    </div>
                                  )}
                                  <div style={{ margin: '0.3em 0' }}>
                                    <span>Status</span>{' '}
                                    <select
                                      className="trainer-status-dropdown"
                                      value={trainerStatus}
                                      onChange={(e) => updateTrainerStatus(t, p.name, e.target.value)}
                                      disabled={busy}
                                    >
                                      <option value="Zugesagt">Zugesagt</option>
                                      <option value="Abgemeldet">Abgemeldet</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            const statusIcon = (t.participants && t.participants[p.name]) || '⏳';
                            return (
                              <div key={p.name} className={cardBg} style={inactiveStyle}>
                                <div className="participant-col">
                                  <span>
                                    <b>{p.name}</b>
                                  </span>
                                  {teamHinweis && (
                                    <div
                                      style={{ fontSize: '0.93em', color: '#9cc6ff', marginBottom: '0.2em' }}
                                    >
                                      Hinweis {teamHinweis}
                                    </div>
                                  )}
                                  <div style={{ margin: '0.3em 0' }}>
                                    <span>Status</span>
                                    <div className="btn-part-status status-btn-row">
                                      {STATUS_ICONS.map((icon, idxIcon) => (
                                        <button
                                          key={idxIcon}
                                          className={statusIcon === icon ? 'active' : ''}
                                          onClick={() => updateParticipation(t, p.name, icon)}
                                          disabled={busy}
                                        >
                                          {icon}
                                        </button>
                                      ))}
                                      <span className="status-text">{iconToText(statusIcon)}</span>
                                    </div>
                                  </div>
                                  <div style={{ margin: '0.35em 0 0.1em 0' }}>
                                    <textarea
                                      rows={1}
                                      placeholder="Notiz (Training)"
                                      style={{
                                        width: '99%',
                                        minHeight: 38,
                                        maxHeight: 60,
                                        fontSize: '1em',
                                        background: '#232942',
                                        color: '#96ffc4',
                                        border: '1.2px solid #2d385b',
                                        borderRadius: 5,
                                        resize: 'vertical',
                                        overflowY: 'auto',
                                      }}
                                      value={playerNote}
                                      onChange={(e) => {
                                        const idxT = trainings.findIndex(
                                          (tr) =>
                                            (tr._id || '') + (tr.date || '') + (tr.createdBy || '') === tKey
                                        );
                                        if (idxT === -1) return;
                                        const updatedTrainings = [...trainings];
                                        updatedTrainings[idxT].playerNotes = {
                                          ...updatedTrainings[idxT].playerNotes,
                                          [p.name]: e.target.value,
                                        };
                                        setTrainings(updatedTrainings);
                                      }}
                                      onBlur={(e) => savePlayerNote(t, p.name, e.target.value)}
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
                          disabled={busy}
                        >
                          💾 Speichern
                        </button>
                      )}
                      {!t.isEditing && (
                        <button
                          className="btn-delete-training"
                          onClick={() => deleteTraining(t)}
                          disabled={busy}
                        >
                          🗑 Training löschen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {trainingsToShow.length === 0 && (
              <p className="no-trainings">
                Keine Trainings gefunden
                {filterDate || searchText ? ' für diesen Filter.' : '.'}
              </p>
            )}
          </section>
        )}
        {showReport && (
          <section className="report-section">
            <h2>Auswertung</h2>
            <div className="report-form">
              <label>
                Von{' '}
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label>
                Bis{' '}
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
              <button onClick={computeReport} disabled={busy}>
                Auswertung anzeigen
              </button>
              {reportData && (
                <button
                  style={{
                    marginLeft: '2em',
                    background: '#46a8f7',
                    color: '#fff',
                    borderRadius: 5,
                    padding: '0.5em 1.4em',
                    fontWeight: 600,
                    border: 0,
                    cursor: 'pointer',
                  }}
                  onClick={exportPDF}
                  disabled={busy}
                >
                  Tabelle als PDF exportieren
                </button>
              )}
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
                      <th>Hinweis</th>
                      <th>Notiz</th>
                      <th>Teilnahme (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.data.map((row) => (
                      <React.Fragment key={row.name}>
                        <tr
                          className={`report-row ${expandedReportRow === row.name ? 'expanded' : ''}`}
                          onClick={() =>
                            setExpandedReportRow(
                              expandedReportRow === row.name ? null : row.name
                            )
                          }
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="clickable">{row.name}</td>
                          <td>{row.memberSince || ''}</td>
                          <td
                            style={{
                              maxWidth: '200px',
                              whiteSpace: 'pre-line',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {row.note || ''}
                          </td>
                          <td>{row.percent}%</td>
                        </tr>
                        {expandedReportRow === row.name && (
                          <tr className="report-details-row">
                            <td colSpan={4}>
                              <ul>
                                {row.details.map((d, dIdx) => (
                                  <li key={dIdx}>
                                    {d.date}{' '}
                                    <strong>{d.statusText.trim()}</strong>
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
        )}
        <footer>
          <p>
            Ersteller <strong>Matthias Kopf</strong> Mail{' '}
            <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
          </p>
          <p
            style={{ fontSize: '0.93rem', color: '#8bb2f4', marginTop: '0.4rem', marginBottom: '1.3rem' }}
          >
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
            disabled={busy}
          >
            Logout
          </button>
        </footer>
      </div>
    );
  }

  if (showChecklists) {
    const playersOnly = trainersFirst.filter((p) => !p.isTrainer);
    const rowBg = (i) => (i % 2 === 0 ? '#1e2744' : '#19213a');
    const sanitizeList = (rawList, editorName = loggedInUser) =>
      (rawList || []).map((cl) => ({
        title: typeof cl.title === 'string' ? cl.title : 'Unbenannt',
        items: Object.fromEntries(
          Object.entries(cl.items || {}).map(([k, v]) => [k, !!v])
        ),
        createdBy: cl.createdBy || editorName || '',
        createdAt: cl.createdAt || new Date(cl.createdAt).toISOString() || new Date().toISOString(),
        lastEdited:
          cl.lastEdited && cl.lastEdited.by && cl.lastEdited.at
            ? cl.lastEdited
            : { by: editorName || '', at: formatDateTime(new Date()) },
        _id: cl._id || undefined,
      }));
    const saveChecklistList = async (rawList, editorName = loggedInUser) => {
      try {
        const cleaned = sanitizeList(rawList, editorName);
        const res = await fetch(API + 'checklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true, list: cleaned }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const serverList = await res.json();
        setChecklists(Array.isArray(serverList) ? serverList : []);
      } catch (err) {
        console.error('POST checklists failed', err);
        alert('Fehler beim Speichern der Checklisten.');
      }
    };
    const ensurePlayersPresent = (cl) => {
      const items = { ...(cl.items || {}) };
      playersOnly.forEach((p) => {
        if (!(p.name in items)) items[p.name] = false;
      });
      return { ...cl, items };
    };
    const createChecklist = () =>
      runOnce(async () => {
        const title = newChecklistTitle.trim() || 'Neue Checkliste';
        const items = {};
        playersOnly.forEach((p) => {
          items[p.name] = false;
        });
        const newCl = {
          title,
          items,
          createdBy: loggedInUser,
          createdAt: new Date().toISOString(),
          lastEdited: { by: loggedInUser, at: formatDateTime(new Date()) },
        };
        const updated = [...checklists, newCl];
        setChecklists(updated);
        const key = (newCl._id || '') + newCl.createdAt + updated.length;
        setExpandedChecklist(key);
        await saveChecklistList(updated, loggedInUser);
        setNewChecklistTitle('');
      });
    const renameChecklist = (idx, newTitle) =>
      runOnce(async () => {
        const updated = [...checklists];
        updated[idx] = {
          ...updated[idx],
          title: newTitle.trim() || 'Unbenannt',
          lastEdited: { by: loggedInUser, at: formatDateTime(new Date()) },
        };
        setChecklists(updated);
        await saveChecklistList(updated, loggedInUser);
      });
    const deleteChecklist = (idx) =>
      runOnce(async () => {
        if (!window.confirm('Checkliste wirklich löschen?')) return;
        const updated = [...checklists];
        updated.splice(idx, 1);
        setChecklists(updated);
        await saveChecklistList(updated, loggedInUser);
        setExpandedChecklist(null);
      });
    const toggleItem = (idx, playerName) =>
      runOnce(async () => {
        const updated = [...checklists];
        const cl = { ...updated[idx] };
        cl.items = { ...cl.items, [playerName]: !cl.items[playerName] };
        cl.lastEdited = { by: loggedInUser, at: formatDateTime(new Date()) };
        updated[idx] = cl;
        setChecklists(updated);
        await saveChecklistList(updated, loggedInUser);
      });
    const markAll = (idx, value) =>
      runOnce(async () => {
        const updated = [...checklists];
        const cl = { ...updated[idx] };
        const newItems = { ...cl.items };
        Object.keys(newItems).forEach((k) => {
          newItems[k] = value;
        });
        cl.items = newItems;
        cl.lastEdited = { by: loggedInUser, at: formatDateTime(new Date()) };
        updated[idx] = cl;
        setChecklists(updated);
        await saveChecklistList(updated, loggedInUser);
      });
    return (
      <div className="App">
        <header>
          <h1>
            ✔ Checklisten <span className="blue-version">{version}</span>
          </h1>
        </header>
        <section className="checklist-create">
          <h2>Neue Checkliste anlegen</h2>
          <div className="add-player-form">
            <input
              type="text"
              placeholder="Titel z. B. 5 € für Rucksack"
              value={newChecklistTitle}
              onChange={(e) => setNewChecklistTitle(e.target.value)}
            />
            <button onClick={createChecklist} disabled={busy}>
              {busy ? '…' : '➕ Anlegen'}
            </button>
          </div>
        </section>
        <section className="checklist-list">
          {checklists.length === 0 && (
            <p className="no-trainings">Noch keine Checklisten angelegt.</p>
          )}
          {checklists.map((rawCl, idx) => {
            const cl = ensurePlayersPresent(rawCl);
            const key = (cl._id || '') + (cl.createdAt || '') + idx;
            const isExpanded = expandedChecklist === key;
            return (
              <div key={key} className="training">
                <h3
                  className={`training-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedChecklist(isExpanded ? null : key)}
                  style={{ cursor: 'pointer' }}
                >
                  📋 {cl.title} {isExpanded ? '🔽' : '▶'}
                </h3>
                {isExpanded && (
                  <div>
                    <div style={{ margin: '0.6rem 0 0.3rem 0' }}>
                      <input
                        type="text"
                        value={cl.title}
                        onChange={(e) => {
                          const updated = [...checklists];
                          updated[idx] = { ...cl, title: e.target.value };
                          setChecklists(updated);
                        }}
                        onBlur={(e) => renameChecklist(idx, e.target.value)}
                        style={{
                          background: '#232942',
                          color: '#e9f2ff',
                          border: '1px solid #2d385b',
                          borderRadius: '4px',
                          padding: '0.25rem 0.5rem',
                          minWidth: '240px',
                        }}
                      />
                    </div>
                    <div>
                      <button
                        className="main-func-btn"
                        onClick={() => markAll(idx, true)}
                        disabled={busy}
                      >
                        Alle markieren
                      </button>
                      <button
                        className="main-func-btn"
                        onClick={() => markAll(idx, false)}
                        style={{ marginLeft: '0.6rem' }}
                        disabled={busy}
                      >
                        Alle leeren
                      </button>
                      <button
                        className="btn-delete-training"
                        onClick={() => deleteChecklist(idx)}
                        style={{ marginLeft: '0.6rem' }}
                        disabled={busy}
                      >
                        🗑 Löschen
                      </button>
                    </div>
                    <div className="trainings-list">
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Spieler</th>
                            <th style={{ textAlign: 'center', padding: '8px' }}>Erhalten / erledigt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playersOnly.map((p, i) => (
                            <tr
                              key={p.name}
                              style={{
                                background: rowBg(i),
                                borderTop: '1px solid #2b3559',
                                borderBottom: '1px solid #151b2e',
                              }}
                            >
                              <td style={{ padding: '8px 10px' }}>{p.name}</td>
                              <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                <input
                                  type="checkbox"
                                  checked={!!cl.items[p.name]}
                                  onChange={() => toggleItem(idx, p.name)}
                                  style={{ transform: 'scale(1.2)' }}
                                  disabled={busy}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: '0.6rem', fontSize: '0.92rem', color: '#8bb2f4' }}>
                      Erstellt von {cl.createdBy || 'Unbekannt'} am{' '}
                      {cl.createdAt ? new Date(cl.createdAt).toLocaleString() : '–'}
                    </div>
                    <div style={{ marginTop: '0.15rem', fontSize: '0.92rem', color: '#9fe3a6' }}>
                      Zuletzt geändert <strong>{cl.lastEdited.at || '-'}</strong> von{' '}
                      <strong>{cl.lastEdited.by || '-'}</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
        <div className="controls mobile-controls" style={{ marginTop: '1.2rem' }}>
          <button
            className="main-func-btn"
            onClick={() => {
              setShowChecklists(false);
              setShowStartMenu(true);
            }}
            disabled={busy}
          >
            Zurück zum Startmenü
          </button>
        </div>
        <footer>
          <p>
            Ersteller <strong>Matthias Kopf</strong> Mail{' '}
            <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
          </p>
          <p
            style={{ fontSize: '0.93rem', color: '#8bb2f4', marginTop: '0.4rem', marginBottom: '1.3rem' }}
          >
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
            disabled={busy}
          >
            Logout
          </button>
        </footer>
      </div>
    );
  }

  // Auswertung berechnen – berücksichtigt nur aktive Spieler (kein Trainer, nicht inaktiv)
  function computeReport() {
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
      .filter((p) => !p.isTrainer && !p.inactive)
      .map((player) => {
        let attendCount = 0;
        const details = trainingsInRange.map((t) => {
          const icon = (t.participants && t.participants[player.name]) || '⏳';
          const text = iconToText(icon);
          if (icon === '✅') attendCount += 1;
          return { date: t.date, statusText: text };
        });
        const percent = Math.round((attendCount / totalCount) * 100);
        return {
          name: player.name,
          memberSince: player.memberSince || '',
          note: player.note || '',
          percent,
          details,
        };
      });
    setReportData({ totalTrainings: totalCount, data: report });
    alert('Auswertung aktualisiert.');
  }

  function exportPDF() {
    if (!reportData) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('⚽ Fußball-App – Trainingsteilnahme', 14, 18);
    doc.setFontSize(12);
    doc.text(`Version ${version}`, 14, 27);
    const tableColumn = ['Spieler', 'Hinweis', 'Notiz', 'Teilnahme (%)'];
    const tableRows = reportData.data.map((r) => [
      r.name,
      r.memberSince,
      r.note,
      r.percent + ' %',
    ]);
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 33,
      theme: 'grid',
      headStyles: { fillColor: [49, 169, 255], textColor: 255 },
      bodyStyles: { fillColor: [36, 40, 62], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 2, minCellHeight: 7 },
    });
    doc.setFontSize(11);
    doc.text('© 2025 Matthias Kopf. Alle Rechte vorbehalten.', 14, doc.internal.pageSize.height - 10);
    doc.save(`Training-Auswertung-${fromDate}-bis-${toDate}.pdf`);
  }
}
/* --------------------------------------------------
