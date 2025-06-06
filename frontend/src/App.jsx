<<<<<<< HEAD
// frontend/src/App.jsx
=======
// Datei: frontend/src/App.jsx

>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com'; // deine Render-URL des Backends

// Deutsche Wochentags-Abkürzung
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

// Icon → Text
const iconToText = (icon) => {
  switch (icon) {
    case '✅': return ' TEILNEHMEND';
    case '❌': return ' ABGEMELDET';
    case '⏳': return ' KEINE RÜCKMELDUNG';
    default:   return ' ZUGESAGT ABER NICHT ERSCHIENEN';
  }
};

// Datum und Uhrzeit formatiert (DD.MM.YYYY HH:MM)
const formatDateTime = (dateObj) => {
  const day     = String(dateObj.getDate()).padStart(2, '0');
  const month   = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year    = dateObj.getFullYear();
  const hours   = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

<<<<<<< HEAD
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

export default function App() {
  // States
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Teamverwaltung (ehemals Nutzerverwaltung)
  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  // Team (Spieler & Trainer)
  const [players, setPlayers] = useState([]);
  const [showTeam, setShowTeam] = useState(false);

  // Neue Felder für Spieler
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newJoinDate, setNewJoinDate] = useState('');
  const [newNote, setNewNote] = useState('');

  // Trainings
  const [trainings, setTrainings] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);

  // Filter/Suche Trainings
  const [filterDate, setFilterDate] = useState('');
  const [searchText, setSearchText] = useState('');

  // Auswertung
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState(null);

  // Version
  const version = '1.2';

  // Daten laden
  useEffect(() => {
    fetch(API + '/users').then(res => res.json()).then(setUsers).catch(console.error);
    fetch(API + '/players').then(res => res.json()).then(setPlayers).catch(console.error);
    fetch(API + '/trainings').then(res => res.json()).then(setTrainings).catch(console.error);
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

  // Logout jetzt ganz unten!
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
      .catch((err) => {
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
  const changeRole = (index, role) => {
    const updated = [...players];
    updated[index].isTrainer = role === 'Trainer';
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
      // Format: "Mi, 29.05.2025"
      const ad = a.date.split(', ')[1].split('.').reverse().join('');
      const bd = b.date.split(', ')[1].split('.').reverse().join('');
      return bd.localeCompare(ad);
    });
  }

  // Neues Training (mit Notizfeld!)
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
        note: '', // Neues Notizfeld
      },
    ];
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert('Neues Training angelegt.');
      })
      .catch(() => alert('Fehler beim Anlegen des Trainings.'));
  };

  // Training löschen
  const deleteTraining = (index) => {
    if (window.confirm('Training wirklich löschen?')) {
      const updated = [...trainings];
      updated.splice(index, 1);
      fetch(API + '/trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      })
        .then(res => res.json())
        .then((saved) => {
          setTrainings(saved);
          alert('Training gelöscht.');
        })
        .catch(() => alert('Fehler beim Löschen des Trainings.'));
    }
  };

  // Trainingsnotiz speichern
  const saveTrainingNote = (idx, noteValue) => {
    const updated = [...trainings];
    updated[idx].note = noteValue;
    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert('Notiz gespeichert.');
      })
      .catch(() => alert('Fehler beim Speichern der Notiz.'));
  };

  // Trainingsdatum editieren (wie gehabt)
  const startEditDate = (tIndex) => {
    const updated = [...trainings];
=======
export default function App() {
  /* === Login-States === */
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName,    setLoginName]    = useState('');
  const [loginPass,    setLoginPass]    = useState('');
  const [loginError,   setLoginError]   = useState('');

  /* === Nutzer-/Admin-Verwaltung === */
  const [users,       setUsers]       = useState([]); // { name, password }
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  /* === App-States (nach Login) === */
  const [players,     setPlayers]     = useState([]); // { name, isTrainer }
  const [trainings,   setTrainings]   = useState([]); // siehe Struktur unten
  const [showPlayers, setShowPlayers] = useState(false);
  const [showAdmin,   setShowAdmin]   = useState(false);

  /* Für neuen Eintrag in Spieler/Trainer-Verwaltung */
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');

  /* Für Auswertung */
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [reportData, setReportData] = useState(null);

  /* === --- HELPER: Alle API-Save-Funktionen --- === */
  const saveUsers = async (updatedList) => {
    await fetch(API + '/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reset: true, list: updatedList }),
    });
  };

  const savePlayers = async (updatedList) => {
    await fetch(API + '/players', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reset: true, list: updatedList }),
    });
  };

  const saveTrainings = async (updatedList) => {
    await fetch(API + '/trainings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reset: true, list: updatedList }),
    });
  };

  /* === Beim Start: Daten vom Backend holen === */
  useEffect(() => {
    // 1) Users laden
    fetch(API + '/users')
      .then(res => res.json())
      .then(data => {
        // Standard-Admin anlegen, falls leer
        if (Array.isArray(data) && data.length === 0) {
          const DEFAULT_ADMIN = { name: 'Matthias', password: 'pksqS2^c%Pi2D5' };
          setUsers([DEFAULT_ADMIN]);
          saveUsers([DEFAULT_ADMIN]);
        } else {
          setUsers(data);
        }
      })
      .catch(console.error);

    // 2) Players laden
    fetch(API + '/players')
      .then(res => res.json())
      .then(data => setPlayers(Array.isArray(data) ? data : []))
      .catch(console.error);

    // 3) Trainings laden
    fetch(API + '/trainings')
      .then(res => res.json())
      .then(data => setTrainings(Array.isArray(data) ? data : []))
      .catch(console.error);

  }, []);

  /* === Login-Handler === */
  const handleLogin = () => {
    const trimmed = loginName.trim();
    const userObj = users.find(u => u.name === trimmed && u.password === loginPass);

    if (userObj) {
      setLoggedInUser(userObj.name);
      setLoginError('');
      setLoginName('');
      setLoginPass('');
    } else {
      setLoginError('Falscher Benutzername oder Passwort.');
    }
  };

  /* === Logout === */
  const handleLogout = () => {
    setLoggedInUser(null);
    setShowPlayers(false);
    setShowAdmin(false);
    setLoginError('');
  };

  /* === Neue Benutzerverwaltung (Admin-only) === */
  const addNewUser = async () => {
    const name = newUserName.trim();
    if (!name || !newUserPass) {
      alert('Bitte Benutzername und Passwort eingeben.');
      return;
    }
    if (users.some(u => u.name === name)) {
      alert('Dieser Benutzername existiert bereits.');
      return;
    }
    const updated = [...users, { name, password: newUserPass }];
    setUsers(updated);
    await saveUsers(updated);
    setNewUserName('');
    setNewUserPass('');
    alert('Neuer Benutzer angelegt.');
  };

  const updateUserPassword = async (index, newPass) => {
    const updated = [...users];
    updated[index].password = newPass;
    setUsers(updated);
    await saveUsers(updated);
    alert(`Passwort für ${updated[index].name} geändert.`);
  };

  const deleteUser = async (index) => {
    const userToDelete = users[index];
    if (userToDelete.name === 'Matthias') {
      alert('Den Administrator kann man nicht löschen.');
      return;
    }
    if (window.confirm(`Benutzer "${userToDelete.name}" wirklich löschen?`)) {
      const updated = [...users];
      updated.splice(index, 1);
      setUsers(updated);
      await saveUsers(updated);
      alert('Benutzer gelöscht.');
    }
  };

  /* === Spieler/Trainer verwalten (allgemein) === */
  const addPlayer = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      alert('Bitte einen Namen eingeben.');
      return;
    }
    const isTrainer = newRole === 'Trainer';
    const updated = [...players, { name: trimmed, isTrainer }];
    setPlayers(updated);
    setNewName('');
    setNewRole('Spieler');
    await savePlayers(updated);
    alert('Nutzer hinzugefügt.');
  };

  const changeRole = async (index, role) => {
    const updated = [...players];
    updated[index].isTrainer = role === 'Trainer';
    setPlayers(updated);
    await savePlayers(updated);
  };

  const deletePlayer = async (index) => {
    if (window.confirm('Nutzer wirklich löschen?')) {
      const updated = [...players];
      updated.splice(index, 1);
      setPlayers(updated);
      await savePlayers(updated);
      alert('Nutzer gelöscht.');
    }
  };

  /* === Neues Training erstellen === */
  const addTraining = async () => {
    const now = new Date();
    const day     = String(now.getDate()).padStart(2, '0');
    const month   = String(now.getMonth() + 1).padStart(2, '0');
    const year    = now.getFullYear();
    const weekday = getGermanWeekday(now);
    const formatted = `${weekday}, ${day}.${month}.${year}`;
    const timestamp = formatDateTime(now);

    const neuerEintrag = {
      date:         formatted,
      participants: {},
      trainerStatus:{},
      expanded:     false,
      isEditing:    false,
      createdBy:    loggedInUser,
      lastEdited:   { by: loggedInUser, at: timestamp },
    };

    const updated = [...trainings, neuerEintrag];
    setTrainings(updated);
    await saveTrainings(updated);
    alert('Neues Training angelegt.');
  };

  /* === Training löschen === */
  const deleteTraining = async (index) => {
    if (window.confirm('Training wirklich löschen?')) {
      const updated = [...trainings];
      updated.splice(index, 1);
      setTrainings(updated);
      await saveTrainings(updated);
      alert('Training gelöscht.');
    }
  };

  /* === Datum bearbeiten innerhalb eines Trainings === */
  const startEditDate = (tIndex) => {
    const updated = [...trainings];
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    updated[tIndex].isEditing = true;
    setTrainings(updated);
  };

<<<<<<< HEAD
  const saveEditedDate = (tIndex, newDateValue) => {
    if (!newDateValue) return;
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
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert('Datum wurde aktualisiert.');
      })
      .catch(() => alert('Fehler beim Aktualisieren des Datums.'));
  };

  // Teilnahme-Status (Spieler)
  const updateParticipation = (tIndex, name, statusIcon) => {
    const now = new Date();
=======
  const saveEditedDate = async (tIndex, newDateValue) => {
    if (!newDateValue) return;
    // newDateValue hat Format "YYYY-MM-DD"
    const [year, month, day] = newDateValue.split('-');
    const dateObj   = new Date(+year, +month - 1, +day);
    const weekday   = getGermanWeekday(dateObj);
    const formatted = `${weekday}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    const now       = new Date();
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    updated[tIndex].date       = formatted;
    updated[tIndex].isEditing  = false;
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };
    setTrainings(updated);
    await saveTrainings(updated);
    alert('Datum wurde aktualisiert.');
  };

  /* === Teilnahme-Status aktualisieren (Spieler) === */
  const updateParticipation = async (tIndex, name, statusIcon) => {
    const now       = new Date();
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    updated[tIndex].participants[name] = statusIcon;
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };
<<<<<<< HEAD

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert(
          `Teilnahme-Status von "${name}" im Training vom "${saved[tIndex].date]}" wurde auf "${iconToText(statusIcon).trim()}" gesetzt.`
        );
      })
      .catch(() => alert('Fehler beim Aktualisieren des Teilnahme-Status.'));
  };

  // Trainer-Status (Dropdown)
  const updateTrainerStatus = (tIndex, name, newStatus) => {
    const now = new Date();
=======
    setTrainings(updated);
    await saveTrainings(updated);
    // keine weitere Bestätigung
  };

  /* === Status-Update (Trainer) per Dropdown === */
  const updateTrainerStatus = async (tIndex, name, newStatus) => {
    const now       = new Date();
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    const timestamp = formatDateTime(now);

    const updated = [...trainings];
    const ts = updated[tIndex].trainerStatus || {};
    ts[name] = newStatus;
    updated[tIndex].trainerStatus = { ...ts };
<<<<<<< HEAD
    updated[tIndex].lastEdited = { by: loggedInUser, at: timestamp };

    fetch(API + '/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list: updated }),
    })
      .then(res => res.json())
      .then((saved) => {
        setTrainings(saved);
        alert(
          `Trainer-Status von "${name}" im Training vom "${saved[tIndex].date}" wurde auf "${newStatus}" gesetzt.`
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
      if (filterDate) {
        const datePart = t.date.split(', ')[1];
        const [y, m, d] = filterDate.split('-');
        const comp = `${d}.${m}.${y}`;
        dateOk = datePart === comp;
      }
      let searchOk = true;
      if (searchText.trim()) {
        const search = searchText.trim().toLowerCase();
        searchOk =
          t.date.toLowerCase().includes(search) ||
          (t.note && t.note.toLowerCase().includes(search));
      }
      return dateOk && searchOk;
    })
  );

  // Auswertung bleibt wie gehabt...

  const parseGermanDate = (str) => {
=======
    updated[tIndex].lastEdited    = { by: loggedInUser, at: timestamp };
    setTrainings(updated);
    await saveTrainings(updated);
    // keine weitere Bestätigung
  };

  /* === Auswertung === */
  const parseGermanDate = (str) => {
    // str: "Mo, 02.06.2025" → wir nehmen nur "02.06.2025"
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    const datePart = str.includes(',') ? str.split(', ')[1] : str;
    const [d, m, y] = datePart.split('.');
    return new Date(Number(y), Number(m) - 1, Number(d));
  };

  const computeReport = () => {
    if (!fromDate || !toDate) {
      alert('Bitte Start- und Enddatum auswählen.');
      return;
    }
    const start = new Date(fromDate);
<<<<<<< HEAD
    const end = new Date(toDate);
=======
    const end   = new Date(toDate);
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    if (end < start) {
      alert('Enddatum muss nach dem Startdatum liegen.');
      return;
    }
<<<<<<< HEAD
=======

>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    const trainingsInRange = trainings.filter((t) => {
      const d = parseGermanDate(t.date);
      return d >= start && d <= end;
    });
<<<<<<< HEAD
=======

>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
    const totalCount = trainingsInRange.length;
    if (totalCount === 0) {
      alert('In diesem Zeitraum wurden keine Trainings gefunden.');
      setReportData(null);
      return;
    }
<<<<<<< HEAD
    const report = trainersFirst
      .filter((p) => !p.isTrainer)
=======

    // Nur Spieler (nicht Trainer)
    const report = players
      .filter(p => !p.isTrainer)
      .sort((a, b) => a.name.localeCompare(b.name))
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
      .map((player) => {
        let attendCount = 0;
        const details = trainingsInRange.map((t) => {
          const icon = t.participants[player.name] || '—';
          const text = iconToText(icon);
          if (icon === '✅') attendCount += 1;
          return { date: t.date, statusText: text };
        });
        const percent = Math.round((attendCount / totalCount) * 100);
<<<<<<< HEAD
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

  // ==== Rendering ====
=======
        return { name: player.name, percent, details, showDetails: false };
      });

    setReportData({ totalTrainings: totalCount, data: report });
  };

  /* === Sortierung: Trainer zuerst, dann alphabetisch === */
  const sortedPlayers   = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst   = [...sortedPlayers].sort((a, b) => b.isTrainer - a.isTrainer);

  /* === RENDERING === */
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
  if (!loggedInUser) {
    return (
      <div className="login-screen">
        <h2>Bitte einloggen</h2>
        <input
          type="text"
          placeholder="Benutzername"
          value={loginName}
<<<<<<< HEAD
          onChange={(e) => setLoginName(e.target.value)}
=======
          onChange={e => setLoginName(e.target.value)}
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
        />
        <input
          type="password"
          placeholder="Passwort"
          value={loginPass}
<<<<<<< HEAD
          onChange={(e) => setLoginPass(e.target.value)}
=======
          onChange={e => setLoginPass(e.target.value)}
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
        />
        <button onClick={handleLogin}>Einloggen</button>
        {loginError && <p className="login-error">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="App">
      <header>
<<<<<<< HEAD
        <h1>⚽ Fußball‐App {version} Trainingsteilnahme</h1>
=======
        <h1>⚽ Fußball‐App 1.1  Trainingsteilnahme</h1>
        <button
          style={{
            position:      'absolute',
            top:           '1rem',
            right:         '1rem',
            backgroundColor:'#c62828',
            color:         '#fff',
            border:        'none',
            borderRadius:  '4px',
            padding:       '0.5rem 1rem',
            cursor:        'pointer',
          }}
          onClick={handleLogout}
        >
          Logout
        </button>
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
      </header>

      <div className="controls">
        <button onClick={addTraining}>➕ Training hinzufügen</button>
<<<<<<< HEAD
        <button onClick={() => setShowTeam(!showTeam)}>👥 Team verwalten</button>
=======
        <button onClick={() => setShowPlayers(!showPlayers)}>👥 Nutzer verwalten</button>
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
        {loggedInUser === 'Matthias' && (
          <button onClick={() => setShowAdmin(!showAdmin)}>👤 Adminverwaltung</button>
        )}
      </div>

<<<<<<< HEAD
      {/* === Adminbereich (nur für Matthias) === */}
      {loggedInUser === 'Matthias' && showAdmin && (
        <section className="admin-section">
          <h2>Adminbereich</h2>
=======
      {/* === Admin‐Sektion (nur für Matthias) === */}
      {loggedInUser === 'Matthias' && showAdmin && (
        <section className="admin-section">
          <h2>Benutzerverwaltung (Admin)</h2>
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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
<<<<<<< HEAD
                    marginLeft: '0.5rem',
                    backgroundColor: '#2a2a2a',
                    color: '#f1f1f1',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '0.3rem 0.6rem',
=======
                    marginLeft:      '0.5rem',
                    backgroundColor: '#2a2a2a',
                    color:           '#f1f1f1',
                    border:          '1px solid #444',
                    borderRadius:    '4px',
                    padding:         '0.3rem 0.6rem',
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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

<<<<<<< HEAD
      {/* === Teamverwaltung für alle === */}
      {showTeam && (
        <section className="player-management">
          <h2>Teamverwaltung</h2>
=======
      {showPlayers && (
        <section className="player-management">
          <h2>Spieler &amp; Trainer verwalten</h2>
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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
<<<<<<< HEAD
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
=======
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
            <button onClick={addPlayer}>➕ Hinzufügen</button>
          </div>
          <ul className="player-list">
            {trainersFirst.map((p, i) => (
              <li key={i}>
                <span className={p.isTrainer ? 'role-trainer' : 'role-player'}>
                  {p.name}
                </span>
<<<<<<< HEAD
                <span className="join-date"> (Im Team seit: {p.joinDate || '-'})</span>
                {p.note && <span className="note"> [{p.note}]</span>}
=======
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
                <div>
                  <select
                    className="role-dropdown"
                    value={p.isTrainer ? 'Trainer' : 'Spieler'}
                    onChange={(e) => changeRole(i, e.target.value)}
                  >
                    <option value="Spieler">Spieler</option>
                    <option value="Trainer">Trainer</option>
                  </select>
                  <button className="btn-delete" onClick={() => deletePlayer(i)}>
                    ❌ Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
<<<<<<< HEAD
          <button
            className="btn-save-players"
            onClick={() => alert('Alle Änderungen im Team wurden gespeichert.')}
          >
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

                {/* Notizfeld */}
                <div className="note-field">
                  <textarea
                    rows={2}
                    placeholder="Notiz zum Training (z.B. was gemacht wurde...)"
                    value={t.note || ''}
                    onChange={(e) => {
                      const updated = [...trainings];
                      updated[tIndex].note = e.target.value;
                      setTrainings(updated);
                    }}
                  />
                  <button
                    style={{ marginLeft: '1rem', marginTop: '0.3rem' }}
                    onClick={() => saveTrainingNote(tIndex, t.note || '')}
                  >
                    💾 Notiz speichern
                  </button>
                </div>

                {/* Spieler/Trainer Liste */}
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

=======
        </section>
      )}

      <section className="trainings-list">
        {trainings.map((t, tIndex) => (
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
                    Zuletzt bearbeitet: <strong>{t.lastEdited.at}</strong> von <strong>{t.lastEdited.by}</strong>
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
                  trainersFirst.map((p, pIndex) => {
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
                            onChange={(e) => updateTrainerStatus(tIndex, p.name, e.target.value)}
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
                            {['✅','❌','⏳','—'].map((icon, idx) => (
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
                  <>
                    <button className="btn-save-training" onClick={() => saveTrainings(trainings)}>
                      💾 Speichern
                    </button>
                    <button className="btn-delete-training" onClick={() => deleteTraining(tIndex)}>
                      🗑️ Training löschen
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </section>

      <section className="report-section">
        <h2>Auswertung</h2>
        <div className="report-form">
          <label>
            Von: 
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            Bis: 
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <button onClick={computeReport}>Auswertung anzeigen</button>
        </div>

>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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
<<<<<<< HEAD
                  <th>Im Team seit</th>
=======
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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
                      </td>
<<<<<<< HEAD
                      <td>{row.joinDate}</td>
=======
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
                      <td>{row.percent}%</td>
                    </tr>
                    {row.showDetails && (
                      <tr className="report-details-row">
<<<<<<< HEAD
                        <td colSpan="3">
=======
                        <td colSpan="2">
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
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

<<<<<<< HEAD
      {/* Footer und Logout-BUTTON ganz unten */}
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail:{' '}
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
        <button
          style={{
            margin: '2rem auto 0 auto',
            display: 'block',
            backgroundColor: '#c62828',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.7rem 1.4rem',
            cursor: 'pointer',
            fontSize: '1.05rem'
          }}
          onClick={handleLogout}
        >
          Logout
        </button>
=======
      <footer>
        <p>
          Ersteller: <strong>Matthias Kopf</strong> | Mail: 
          <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a>
        </p>
>>>>>>> 9a3688c50f6fede3e0c2239f3925871ebfb37dbd
      </footer>
    </div>
  );
}
