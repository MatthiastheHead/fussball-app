// Version 6.0: Trainingserfassung mit Status, Sternebewertung, erweiterten
// Auswertungen und nachvollziehbarem Bearbeitungsverlauf.

import React, { useState, useEffect } from 'react';
import './App.css';
import {
  STATUS_OPTIONS,
  RATING_VALUES,
  formatTrainingDate,
  iconToText,
  normalizeRating,
  ratingLabel,
  ratingPoints,
  summarizePlayerTrainings,
} from './trainingUtils.js';

// API-Basis: zuerst ENV, ansonsten abhängig vom Hostname. Ein abschließender
// Schrägstrich wird entfernt, damit konfigurierte URLs zuverlässig funktionieren.
const API = (import.meta.env.VITE_API_BASE ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://fussball-api.onrender.com/')).replace(/\/+$/, '');

const REQUEST_TIMEOUT = 20000;

async function apiRequest(path, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${API}/${path.replace(/^\/+/, '')}`, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchJson(path) {
  const response = await apiRequest(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.json();
}

const getLocalDateInputValue = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatAuditTime = (value) => {
  if (!value) return 'Zeitpunkt unbekannt';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(value);
};

// Deutsches Datum (Wochentag, DD.MM.YYYY) in Date konvertieren
const parseGermanDate = (str) => {
  const datePart = str && str.includes(',') ? str.split(', ')[1] : str;
  if (!datePart) return new Date(0);
  const [d, m, y] = datePart.split('.');
  // Datumsfelder werden von JavaScript als UTC interpretiert. Auch das
  // gespeicherte deutsche Datum wird deshalb in UTC erzeugt, damit der erste
  // Tag eines Berichts in jeder Zeitzone zuverlässig enthalten bleibt.
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
};

const renameObjectKey = (source, oldKey, newKey) => {
  const result = { ...(source || {}) };
  if (oldKey !== newKey && Object.prototype.hasOwnProperty.call(result, oldKey)) {
    result[newKey] = result[oldKey];
    delete result[oldKey];
  }
  return result;
};

const toIsoDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthcheck() {
  // Während eines gestaffelten Deployments kann das Backend noch den älteren
  // Diagnosepfad verwenden. Beide Varianten halten die App funktionsfähig.
  for (const path of ['health', '__health']) {
    try {
      const res = await apiRequest(path, { cache: 'no-store' }, 15000);
      if (res.ok) return true;
    } catch {
      // Beim nächsten kompatiblen Pfad bzw. Versuch weiterprüfen.
    }
  }
  return false;
}

async function ensureBackendAwake() {
  for (let i = 0; i < 4; i++) {
    const ok = await healthcheck();
    if (ok) return true;
    if (i < 3) await wait(2000 * (i + 1));
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
  const [initializing, setInitializing] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [players, setPlayers] = useState([]);
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [playerDraft, setPlayerDraft] = useState({});
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newNote, setNewNote] = useState('');
  const [newMemberSince, setNewMemberSince] = useState('');
  const [trainings, setTrainings] = useState([]);
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [newTrainingDate, setNewTrainingDate] = useState(() => getLocalDateInputValue());
  const [expandedTraining, setExpandedTraining] = useState(null);
  const [editTrainingKey, setEditTrainingKey] = useState(null);
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
  const version = '6.0';
  const currentYear = new Date().getFullYear();

  const createAuditEntry = (action) => ({
    by: loggedInUser || 'Unbekannt',
    at: new Date().toISOString(),
    action,
  });

  const applyTrainingChange = (training, action, changes = {}) => {
    const auditEntry = createAuditEntry(action);
    return {
      ...training,
      ...changes,
      lastEdited: auditEntry,
      history: [...(Array.isArray(training.history) ? training.history : []), auditEntry].slice(-50),
    };
  };

  const saveTrainingList = async (list) => {
    const res = await apiRequest('trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, list }),
    });
    if (!res.ok) {
      const details = await res.json().catch(() => ({}));
      throw new Error(details.error || `Trainings: HTTP ${res.status}`);
    }
    const saved = await res.json();
    const normalized = Array.isArray(saved)
      ? saved.map((training) => ({
          ...training,
          participants: training.participants || {},
          ratings: training.ratings || {},
          trainerStatus: training.trainerStatus || {},
          playerNotes: training.playerNotes || {},
          history: Array.isArray(training.history) ? training.history : [],
        }))
      : [];
    setTrainings(normalized);
    return normalized;
  };

  async function runOnce(fn) {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await fn();
      return result !== false;
    } catch (error) {
      console.error(error);
      alert(
        error?.name === 'AbortError'
          ? 'Der Server antwortet nicht. Bitte versuche es erneut.'
          : 'Die Aktion konnte nicht abgeschlossen werden.'
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refetchAll() {
    const [u, p, t, c] = await Promise.all([
      fetchJson('users'),
      fetchJson('players'),
      fetchJson('trainings'),
      fetchJson('checklists'),
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
              ratings: x.ratings || {},
              trainerStatus: x.trainerStatus || {},
              playerNotes: x.playerNotes || {},
              note: typeof x.note === 'string' ? x.note : '',
              createdBy: x.createdBy || '',
              createdAt: x.createdAt || null,
              lastEdited: x.lastEdited || null,
              history: Array.isArray(x.history) ? x.history : [],
            }))
          : []
      );
      setChecklists(
        Array.isArray(c)
          ? c.map((checklist) => ({
              ...checklist,
              items: checklist.items || {},
              createdAt: toIsoDate(checklist.createdAt),
              lastEdited:
                checklist.lastEdited?.by && checklist.lastEdited?.at
                  ? checklist.lastEdited
                  : null,
            }))
          : []
      );
  }

  async function loadInitialData() {
    setInitializing(true);
    setLoadError('');
    const awake = await ensureBackendAwake();
    if (!awake) {
      setLoadError('Der Server konnte nicht gestartet werden.');
      setInitializing(false);
      return;
    }
    try {
      await refetchAll();
    } catch (error) {
      console.error(error);
      setLoadError('Die Daten konnten nicht geladen werden.');
    } finally {
      setInitializing(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleLogin = () => {
    if (initializing) return;
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
      const res = await apiRequest('users', {
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
      if (!newPass) {
        alert('Bitte ein neues Passwort eingeben.');
        return;
      }
      if (!users[index]) return;
      const updated = users.map((user, userIndex) =>
        userIndex === index ? { ...user, password: newPass } : user
      );
      const res = await apiRequest('users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: updated }),
      });
      if (!res.ok) {
        alert('Fehler beim Aktualisieren des Passworts.');
        return;
      }
      await refetchAll();
      const draftKey = users[index]._id || users[index].name;
      setPasswordDrafts((drafts) => ({ ...drafts, [draftKey]: '' }));
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
      const res = await apiRequest('users', {
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
      const nextName = (playerDraft.name || '').trim();
      if (!nextName) {
        alert('Bitte einen Namen eingeben.');
        return;
      }
      if (players.some((p, playerIndex) => playerIndex !== idx && p.name === nextName)) {
        alert('Dieser Name existiert bereits.');
        return;
      }
      const previousName = players[idx].name;
      const updatedPlayer = {
        ...playerDraft,
        name: nextName,
        note: typeof playerDraft.note === 'string' ? playerDraft.note : '',
        memberSince:
          typeof playerDraft.memberSince === 'string'
            ? playerDraft.memberSince
            : '',
        inactive: !!playerDraft.inactive,
      };
      const updated = players.map((player, playerIndex) =>
        playerIndex === idx ? updatedPlayer : player
      );
      const requests = [
        apiRequest('players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true, list: updated }),
        }),
      ];

      if (previousName !== nextName) {
        const updatedTrainings = trainings.map((training) => {
          const containsPreviousName = [
            training.participants,
            training.ratings,
            training.trainerStatus,
            training.playerNotes,
          ].some((collection) =>
            Object.prototype.hasOwnProperty.call(collection || {}, previousName)
          );
          if (!containsPreviousName) return training;
          return applyTrainingChange(training, `${previousName} in ${nextName} umbenannt`, {
            participants: renameObjectKey(training.participants, previousName, nextName),
            ratings: renameObjectKey(training.ratings, previousName, nextName),
            trainerStatus: renameObjectKey(training.trainerStatus, previousName, nextName),
            playerNotes: renameObjectKey(training.playerNotes, previousName, nextName),
          });
        });
        const updatedChecklists = checklists.map((checklist) =>
          Object.prototype.hasOwnProperty.call(checklist.items || {}, previousName)
            ? {
                ...checklist,
                items: renameObjectKey(checklist.items, previousName, nextName),
                lastEdited: { by: loggedInUser, at: new Date().toISOString() },
              }
            : checklist
        );
        requests.push(
          apiRequest('trainings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true, list: updatedTrainings }),
          }),
          apiRequest('checklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true, list: updatedChecklists }),
          })
        );
      }

      const responses = await Promise.all(requests);
      setEditPlayerId(null);
      setPlayerDraft({});
      if (responses.some((response) => !response.ok)) {
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
      if (players.some((player) => player.name.toLowerCase() === trimmed.toLowerCase())) {
        alert('Dieser Name existiert bereits.');
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
      const res = await apiRequest('players', {
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
      const updated = players.map((item, itemIndex) =>
        itemIndex === idx ? { ...item, note: noteValue } : item
      );
      const res = await apiRequest('players', {
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
      const updated = players.map((item, itemIndex) =>
        itemIndex === idx ? { ...item, memberSince: memberSinceValue } : item
      );
      const res = await apiRequest('players', {
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
      const updated = players.map((item, itemIndex) =>
        itemIndex === idx ? { ...item, isTrainer: role === 'Trainer' } : item
      );
      const res = await apiRequest('players', {
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
      const res = await apiRequest('players', {
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
      const updated = players.map((item, itemIndex) =>
        itemIndex === idx ? { ...item, inactive: !item.inactive } : item
      );
      const res = await apiRequest('players', {
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

  const trainingKey = (training) =>
    String(
      training?._id ||
        `${training?.date || ''}|${training?.createdBy || ''}|${training?.lastEdited?.at || ''}`
    );

  const findTrainingIndex = (training) => {
    const key = trainingKey(training);
    return trainings.findIndex((item) => trainingKey(item) === key);
  };

  const addTraining = () =>
    runOnce(async () => {
      if (!loggedInUser) {
        alert('Bitte zuerst einloggen.');
        return;
      }
      const formatted = formatTrainingDate(newTrainingDate);
      if (!formatted) {
        alert('Bitte ein gültiges Trainingsdatum auswählen.');
        return;
      }
      if (trainings.some((training) => training.date === formatted)) {
        alert('Für dieses Datum ist bereits ein Training angelegt.');
        return;
      }
      const activeMembers = players.filter((player) => !player.inactive);
      const participants = Object.fromEntries(
        activeMembers.filter((player) => !player.isTrainer).map((player) => [player.name, '⏳'])
      );
      const ratings = Object.fromEntries(
        activeMembers.filter((player) => !player.isTrainer).map((player) => [player.name, 0])
      );
      const trainerStatus = Object.fromEntries(
        activeMembers.filter((player) => player.isTrainer).map((player) => [player.name, 'Nicht abgemeldet'])
      );
      const now = new Date();
      const auditEntry = {
        by: loggedInUser,
        at: now.toISOString(),
        action: 'Training angelegt',
      };
      const newTraining = {
        date: formatted,
        participants,
        ratings,
        trainerStatus,
        playerNotes: {},
        createdBy: loggedInUser,
        createdAt: now.toISOString(),
        lastEdited: auditEntry,
        history: [auditEntry],
        note: '',
      };
      const saved = await saveTrainingList([...trainings, newTraining]);
      const created = saved.find((training) => training.date === formatted);
      setShowTrainings(true);
      setShowAddTraining(false);
      setNewTrainingDate(getLocalDateInputValue());
      if (created) setExpandedTraining(trainingKey(created));
      alert(`Training am ${formatted} angelegt.`);
    });

  const deleteTraining = (training) =>
    runOnce(async () => {
      if (!window.confirm('Training wirklich löschen?')) return;
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const updated = [...trainings];
      updated.splice(idx, 1);
      await saveTrainingList(updated);
      setExpandedTraining(null);
      alert('Training gelöscht.');
    });

  const saveTrainingNote = (training, noteValue) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, 'Trainingsnotiz geändert', { note: noteValue })
          : item
      );
      await saveTrainingList(updated);
      alert('Trainingsnotiz gespeichert.');
    });

  const savePlayerNote = (training, playerName, noteValue) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Notiz für ${playerName} geändert`, {
              playerNotes: {
                ...(item.playerNotes || {}),
                [playerName]: noteValue,
              },
            })
          : item
      );
      await saveTrainingList(updated);
      alert('Notiz gespeichert.');
    });

  const saveEditedDate = (training, newDateValue) =>
    runOnce(async () => {
      const formatted = formatTrainingDate(newDateValue);
      if (!formatted) {
        alert('Bitte ein gültiges Datum auswählen.');
        return false;
      }
      const idx = findTrainingIndex(training);
      if (idx === -1) return false;
      if (
        trainings.some(
          (item, itemIndex) => itemIndex !== idx && item.date === formatted
        )
      ) {
        alert('Für dieses Datum ist bereits ein Training angelegt.');
        return false;
      }
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Datum auf ${formatted} geändert`, { date: formatted })
          : item
      );
      await saveTrainingList(updated);
      alert('Datum wurde aktualisiert.');
      return true;
    });

  // Status ändern
  const updateParticipation = (training, name, statusIcon) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Teilnahmestatus für ${name}: ${iconToText(statusIcon)}`, {
              participants: { ...(item.participants || {}), [name]: statusIcon },
            })
          : item
      );
      await saveTrainingList(updated);
    });

  const updateRating = (training, name, newRating) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const rating = normalizeRating(newRating);
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Bewertung für ${name}: ${rating} Sterne`, {
              ratings: { ...(item.ratings || {}), [name]: rating },
            })
          : item
      );
      await saveTrainingList(updated);
    });

  const updateTrainerStatus = (training, name, newStatus) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Trainerstatus für ${name}: ${newStatus}`, {
              trainerStatus: { ...(item.trainerStatus || {}), [name]: newStatus },
            })
          : item
      );
      await saveTrainingList(updated);
    });

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const trainersFirst = [...sortedPlayers].sort((a, b) => (b.isTrainer ? 1 : 0) - (a.isTrainer ? 1 : 0));

  const teamMembersForTraining = (training) => {
    const currentMembers = new Map(players.map((player) => [player.name, player]));
    const trainerNames = Object.keys(training.trainerStatus || {}).sort((a, b) =>
      a.localeCompare(b)
    );
    const trainerSet = new Set(trainerNames);
    const playerNames = [
      ...new Set([
        ...Object.keys(training.participants || {}),
        ...Object.keys(training.ratings || {}),
      ]),
    ]
      .filter((name) => !trainerSet.has(name))
      .sort((a, b) => a.localeCompare(b));
    return [
      ...trainerNames.map((name) => ({
        ...(currentMembers.get(name) || {}),
        name,
        isTrainer: true,
      })),
      ...playerNames.map((name) => ({
        ...(currentMembers.get(name) || {}),
        name,
        isTrainer: false,
      })),
    ];
  };

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
            {initializing
              ? 'Der Server wird gestartet und die Daten werden geladen…'
              : loadError || 'Die App ist bereit.'}
          </div>
          <input
            type="text"
            placeholder="Benutzername"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            autoComplete="username"
            disabled={initializing}
          />
          <input
            type="password"
            placeholder="Passwort"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            autoComplete="current-password"
            disabled={initializing}
          />
          <button onClick={handleLogin} disabled={busy || initializing || !!loadError}>
            {initializing ? 'Bitte warten…' : 'Einloggen'}
          </button>
          {loadError && (
            <button className="retry-button" onClick={loadInitialData} disabled={initializing}>
              Erneut versuchen
            </button>
          )}
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
          © {currentYear} Matthias Kopf
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
          <h2>Spielerinnen und Trainer</h2>
          <div className="add-player-form">
            <input
              type="text"
              placeholder="Name eingeben"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="Spieler">Spielerin</option>
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
            {trainersFirst.map((p) =>
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
                      placeholder="Notiz"
                    />
                    <input
                      type="text"
                      value={playerDraft.memberSince}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, memberSince: e.target.value }))
                      }
                      placeholder="Hinweis"
                    />
                    <select
                      className="role-dropdown"
                      value={playerDraft.isTrainer ? 'Trainer' : 'Spieler'}
                      onChange={(e) =>
                        setPlayerDraft((draft) => ({ ...draft, isTrainer: e.target.value === 'Trainer' }))
                      }
                    >
                      <option value="Spieler">Spielerin</option>
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
                        const updated = players.map((player, playerIndex) =>
                          playerIndex === idx ? { ...player, note: e.target.value } : player
                        );
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
                        const updated = players.map((player, playerIndex) =>
                          playerIndex === idx
                            ? { ...player, memberSince: e.target.value }
                            : player
                        );
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
                        <option value="Spieler">Spielerin</option>
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
            <h2>Benutzerverwaltung</h2>
            <div className="add-player-form">
              <input
                type="text"
                placeholder="Neuer Benutzername"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <input
                type="password"
                placeholder="Passwort"
                value={newUserPass}
                onChange={(e) => setNewUserPass(e.target.value)}
                autoComplete="new-password"
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
                    type="password"
                    placeholder="Neues Passwort"
                    value={passwordDrafts[u._id || u.name] || ''}
                    onChange={(e) =>
                      setPasswordDrafts((drafts) => ({
                        ...drafts,
                        [u._id || u.name]: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    style={{
                      marginLeft: '0.5rem',
                      backgroundColor: '#232942',
                      color: '#f1f1f1',
                      border: '1px solid #2d385b',
                      borderRadius: '4px',
                      padding: '0.3rem 0.6rem',
                    }}
                  />
                  <button
                    className="btn-save-players"
                    onClick={() =>
                      updateUserPassword(idx, passwordDrafts[u._id || u.name] || '')
                    }
                    disabled={busy || !passwordDrafts[u._id || u.name]}
                  >
                    Passwort speichern
                  </button>
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
            © {currentYear} Matthias Kopf
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
          <button
            className="main-func-btn"
            onClick={() => setShowAddTraining((visible) => !visible)}
            disabled={busy}
          >
            {busy
              ? 'Bitte warten…'
              : showAddTraining
                ? 'Anlegen abbrechen'
                : '➕ Training hinzufügen'}
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
        {showAddTraining && (
          <section className="add-training-panel">
            <h2>Neues Training anlegen</h2>
            <p>
              Die aktiven Spielerinnen und Trainer werden automatisch aus der
              Teamverwaltung übernommen.
            </p>
            <div className="add-training-form">
              <label>
                Trainingsdatum
                <input
                  type="date"
                  value={newTrainingDate}
                  onChange={(event) => setNewTrainingDate(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button className="btn-save-training" onClick={addTraining} disabled={busy}>
                {busy ? 'Wird angelegt…' : 'Training anlegen'}
              </button>
            </div>
          </section>
        )}
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
            {trainingsToShow.map((t) => {
              const tKey = trainingKey(t);
              const expandedKey = expandedTraining === tKey;
              const trainingTeamMembers = teamMembersForTraining(t);
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
                        Erstellt von <strong>{t.createdBy || 'Unbekannt'}</strong>
                        {t.createdAt && <> am <strong>{formatAuditTime(t.createdAt)}</strong></>}
                      </div>
                      {t.lastEdited && (
                        <div className="last-edited">
                          Zuletzt bearbeitet von <strong>{t.lastEdited.by || 'Unbekannt'}</strong>
                          {' '}am <strong>{formatAuditTime(t.lastEdited.at)}</strong>
                          {t.lastEdited.action && <>: {t.lastEdited.action}</>}
                        </div>
                      )}
                      {Array.isArray(t.history) && t.history.length > 0 && (
                        <details className="audit-history">
                          <summary>Bearbeitungsverlauf anzeigen</summary>
                          <ul>
                            {[...t.history].reverse().map((entry, historyIndex) => (
                              <li key={`${entry.at || 'alt'}-${historyIndex}`}>
                                <strong>{entry.by || 'Unbekannt'}</strong>,{' '}
                                {formatAuditTime(entry.at)}
                                {entry.action ? `: ${entry.action}` : ''}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {editTrainingKey === tKey ? (
                        <div className="edit-date-row">
                          <input
                            type="date"
                            className="edit-date-input"
                            value={editDateValue}
                            onChange={(e) => setEditDateValue(e.target.value)}
                          />
                          <button
                            className="btn-save-date"
                            onClick={async () => {
                              const saved = await saveEditedDate(t, editDateValue);
                              if (saved) {
                                setEditTrainingKey(null);
                                setEditDateValue('');
                              }
                            }}
                            disabled={busy}
                          >
                            Speichern
                          </button>
                          <button
                            className="btn-save-date"
                            onClick={() => {
                              setEditTrainingKey(null);
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
                              setEditTrainingKey(tKey);
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
                            const idx2 = trainings.findIndex((tr) => trainingKey(tr) === tKey);
                            if (idx2 === -1) return;
                            const updated = trainings.map((item, itemIndex) =>
                              itemIndex === idx2 ? { ...item, note: e.target.value } : item
                            );
                            setTrainings(updated);
                          }}
                          onBlur={(e) => saveTrainingNote(t, e.target.value)}
                        />
                      </div>
                      {trainingTeamMembers.map((p, idxP) => {
                          const isTrainer = !!p.isTrainer;
                          const teamHinweis = p.memberSince || '';
                          const playerNote = (t.playerNotes && t.playerNotes[p.name]) || '';
                          const cardBg = idxP % 2 === 0 ? 'player-card even' : 'player-card odd';
                          if (isTrainer) {
                            const trainerStatus =
                              (t.trainerStatus && t.trainerStatus[p.name]) || 'Nicht abgemeldet';
                            return (
                              <div key={p.name + 'trainer'} className={cardBg}>
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
                                      <option value="Nicht abgemeldet">Nicht abgemeldet</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            const statusIcon = (t.participants && t.participants[p.name]) || '⏳';
                            const hasRating = Object.prototype.hasOwnProperty.call(
                              t.ratings || {},
                              p.name
                            );
                            const currentRating = hasRating
                              ? normalizeRating(t.ratings[p.name])
                              : null;
                            return (
                              <div key={p.name} className={cardBg}>
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
                                      {STATUS_OPTIONS.map(({ icon, label }) => (
                                        <button
                                          key={icon}
                                          className={statusIcon === icon ? 'active' : ''}
                                          onClick={() => updateParticipation(t, p.name, icon)}
                                          disabled={busy}
                                          aria-label={`${p.name}: ${label}`}
                                          title={label}
                                        >
                                          {icon}
                                        </button>
                                      ))}
                                      <span className="status-text">{iconToText(statusIcon)}</span>
                                    </div>
                                  </div>
                                  <div className="rating-field">
                                    <span>Bewertung</span>
                                    <div
                                      className="star-rating"
                                      role="group"
                                      aria-label={`Trainingsbewertung für ${p.name}`}
                                    >
                                      {RATING_VALUES.map((rating) => (
                                        <button
                                          key={rating}
                                          type="button"
                                          className={
                                            currentRating !== null && rating <= currentRating
                                              ? 'active'
                                              : ''
                                          }
                                          onClick={() =>
                                            updateRating(
                                              t,
                                              p.name,
                                              currentRating === rating ? 0 : rating
                                            )
                                          }
                                          disabled={busy}
                                          aria-label={`${rating} ${rating === 1 ? 'Stern' : 'Sterne'}`}
                                          title={ratingLabel(rating)}
                                        >
                                          ★
                                        </button>
                                      ))}
                                      <span className="rating-text">
                                        {currentRating === null ? (
                                          'Noch keine Bewertung (Altbestand)'
                                        ) : (
                                          <>
                                            {ratingLabel(currentRating)} ({ratingPoints(currentRating)}{' '}
                                            {ratingPoints(currentRating) === 1 ? 'Punkt' : 'Punkte'})
                                          </>
                                        )}
                                      </span>
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
                                          (tr) => trainingKey(tr) === tKey
                                        );
                                        if (idxT === -1) return;
                                        const updatedTrainings = trainings.map((item, itemIndex) =>
                                          itemIndex === idxT
                                            ? {
                                                ...item,
                                                playerNotes: {
                                                  ...(item.playerNotes || {}),
                                                  [p.name]: e.target.value,
                                                },
                                              }
                                            : item
                                        );
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
                      {trainingTeamMembers.length === 0 && (
                        <p className="no-trainings">
                          Für dieses Training ist kein Mannschaftsstand gespeichert.
                        </p>
                      )}
                      <div className="autosave-hint">
                        Änderungen werden automatisch mit Bearbeiter und Zeitpunkt gespeichert.
                      </div>
                      <button
                        className="btn-delete-training"
                        onClick={() => deleteTraining(t)}
                        disabled={busy}
                      >
                        🗑 Training löschen
                      </button>
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
            <p className="report-legend">
              Bewertung: 3 Sterne = super, 2 = ordentlich, 1 = etwas mitgemacht,
              0 Sterne = −1 Punkt. „Nicht abgemeldet“ wird separat gezählt.
            </p>
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
                  onClick={() => runOnce(exportPDF)}
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
                      <th>Spielerin</th>
                      <th>Hinweis</th>
                      <th>Notiz</th>
                      <th>Teilnahme (%)</th>
                      <th>Dabei</th>
                      <th>Abgemeldet</th>
                      <th>Nicht abgemeldet</th>
                      <th>Ø Sterne</th>
                      <th>Punkte</th>
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
                          <td>{row.attendCount}</td>
                          <td>{row.excusedCount}</td>
                          <td>{row.unexcusedCount}</td>
                          <td>
                            {row.averageRating}
                            {row.ratingCount > 0 ? ' / 3' : ''}
                          </td>
                          <td>{row.pointsTotal}</td>
                        </tr>
                        {expandedReportRow === row.name && (
                          <tr className="report-details-row">
                            <td colSpan={9}>
                              <ul>
                                {row.details.map((d, dIdx) => (
                                  <li key={dIdx}>
                                    {d.date}: <strong>{d.statusText}</strong>,{' '}
                                    {d.rating === null
                                      ? 'noch keine Bewertung'
                                      : `${'★'.repeat(d.rating)}${'☆'.repeat(3 - d.rating)} (${d.points > 0 ? '+' : ''}${d.points} Punkte)`}
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
            © {currentYear} Matthias Kopf. Alle Rechte vorbehalten.
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
    const activePlayersOnly = playersOnly.filter((p) => !p.inactive);
    const rowBg = (i) => (i % 2 === 0 ? '#1e2744' : '#19213a');
    const sanitizeList = (rawList, editorName = loggedInUser) =>
      (rawList || []).map((cl) => ({
        title: typeof cl.title === 'string' ? cl.title : 'Unbenannt',
        items: Object.fromEntries(
          Object.entries(cl.items || {}).map(([k, v]) => [k, !!v])
        ),
        createdBy: cl.createdBy || editorName || '',
        createdAt: toIsoDate(cl.createdAt),
        lastEdited:
          cl.lastEdited && cl.lastEdited.by && cl.lastEdited.at
            ? cl.lastEdited
            : { by: editorName || '', at: new Date().toISOString() },
        _id: cl._id || undefined,
      }));
    const saveChecklistList = async (rawList, editorName = loggedInUser) => {
      const cleaned = sanitizeList(rawList, editorName);
      const res = await apiRequest('checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, list: cleaned }),
      });
      if (!res.ok) throw new Error(`Checklisten: HTTP ${res.status}`);
      const serverList = await res.json();
      const normalized = Array.isArray(serverList) ? serverList : [];
      setChecklists(normalized);
      return normalized;
    };
    const ensurePlayersPresent = (cl) => {
      const items = { ...(cl.items || {}) };
      activePlayersOnly.forEach((p) => {
        if (!(p.name in items)) items[p.name] = false;
      });
      return { ...cl, items };
    };
    const createChecklist = () =>
      runOnce(async () => {
        const title = newChecklistTitle.trim() || 'Neue Checkliste';
        const items = {};
        activePlayersOnly.forEach((p) => {
          items[p.name] = false;
        });
        const newCl = {
          title,
          items,
          createdBy: loggedInUser,
          createdAt: new Date().toISOString(),
          lastEdited: { by: loggedInUser, at: new Date().toISOString() },
        };
        const updated = [...checklists, newCl];
        const saved = await saveChecklistList(updated, loggedInUser);
        const savedChecklist = saved.find((checklist) => checklist.createdAt === newCl.createdAt);
        setExpandedChecklist(
          savedChecklist
            ? (savedChecklist._id || '') + (savedChecklist.createdAt || '') + saved.indexOf(savedChecklist)
            : null
        );
        setNewChecklistTitle('');
      });
    const renameChecklist = (idx, newTitle) =>
      runOnce(async () => {
        const updated = [...checklists];
        updated[idx] = {
          ...updated[idx],
          title: newTitle.trim() || 'Unbenannt',
          lastEdited: { by: loggedInUser, at: new Date().toISOString() },
        };
        await saveChecklistList(updated, loggedInUser);
      });
    const deleteChecklist = (idx) =>
      runOnce(async () => {
        if (!window.confirm('Checkliste wirklich löschen?')) return;
        const updated = [...checklists];
        updated.splice(idx, 1);
        await saveChecklistList(updated, loggedInUser);
        setExpandedChecklist(null);
      });
    const toggleItem = (idx, playerName) =>
      runOnce(async () => {
        const updated = [...checklists];
        const cl = { ...ensurePlayersPresent(updated[idx]) };
        cl.items = { ...cl.items, [playerName]: !cl.items[playerName] };
        cl.lastEdited = { by: loggedInUser, at: new Date().toISOString() };
        updated[idx] = cl;
        await saveChecklistList(updated, loggedInUser);
      });
    const markAll = (idx, value) =>
      runOnce(async () => {
        const updated = [...checklists];
        const cl = { ...ensurePlayersPresent(updated[idx]) };
        const newItems = { ...cl.items };
        activePlayersOnly.forEach((player) => {
          newItems[player.name] = value;
        });
        cl.items = newItems;
        cl.lastEdited = { by: loggedInUser, at: new Date().toISOString() };
        updated[idx] = cl;
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
              placeholder="Titel, z. B. Mannschaftskasse 5 €"
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
            const completedCount = activePlayersOnly.filter(
              (player) => !!cl.items[player.name]
            ).length;
            return (
              <div key={key} className="training">
                <h3
                  className={`training-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedChecklist(isExpanded ? null : key)}
                  style={{ cursor: 'pointer' }}
                >
                  📋 {cl.title} · {completedCount}/{activePlayersOnly.length} erledigt{' '}
                  {isExpanded ? '🔽' : '▶'}
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
                            <th style={{ textAlign: 'left', padding: '8px' }}>Spielerin</th>
                            <th style={{ textAlign: 'center', padding: '8px' }}>Erhalten / erledigt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePlayersOnly.map((p, i) => (
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
                      {cl.createdAt ? formatAuditTime(cl.createdAt) : '–'}
                    </div>
                    <div style={{ marginTop: '0.15rem', fontSize: '0.92rem', color: '#9fe3a6' }}>
                      Zuletzt geändert von <strong>{cl.lastEdited?.by || '-'}</strong> am{' '}
                      <strong>{formatAuditTime(cl.lastEdited?.at)}</strong>
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
            © {currentYear} Matthias Kopf. Alle Rechte vorbehalten.
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
        const summary = summarizePlayerTrainings(trainingsInRange, player.name);
        return {
          name: player.name,
          memberSince: player.memberSince || '',
          note: player.note || '',
          percent:
            summary.consideredCount > 0
              ? Math.round((summary.attendCount / summary.consideredCount) * 100)
              : 0,
          ...summary,
        };
      });
    setReportData({ totalTrainings: totalCount, data: report });
    alert('Auswertung aktualisiert.');
  }

  async function exportPDF() {
    if (!reportData) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable/es'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text('⚽ Fußball-App – Trainingsteilnahme', 14, 18);
    doc.setFontSize(12);
    doc.text(`Version ${version}`, 14, 27);
    const tableColumn = [
      'Spielerin',
      'Hinweis',
      'Notiz',
      'Teilnahme',
      'Dabei',
      'Abgemeldet',
      'Nicht abgemeldet',
      'Ø Sterne',
      'Punkte',
    ];
    const tableRows = reportData.data.map((r) => [
      r.name,
      r.memberSince,
      r.note,
      r.percent + ' %',
      r.attendCount,
      r.excusedCount,
      r.unexcusedCount,
      r.averageRating === '–' ? '–' : `${r.averageRating} / 3`,
      r.pointsTotal,
    ]);
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 33,
      theme: 'grid',
      headStyles: { fillColor: [49, 169, 255], textColor: 255 },
      bodyStyles: { fillColor: [36, 40, 62], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 1.5, minCellHeight: 6 },
    });
    doc.setFontSize(11);
    doc.text(`© ${currentYear} Matthias Kopf. Alle Rechte vorbehalten.`, 14, doc.internal.pageSize.height - 10);
    doc.save(`Training-Auswertung-${fromDate}-bis-${toDate}.pdf`);
  }
}
