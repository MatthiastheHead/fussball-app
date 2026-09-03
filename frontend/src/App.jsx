// Version 6.2: Checklisten-Bemerkungen, kindgerechter PDF-Export
// und optimierte mobile Bedienung.

import React, { useState, useEffect } from 'react';
import './App.css';
import {
  STATUS_OPTIONS,
  RATING_VALUES,
  TRAINING_LOCATIONS,
  currentSeason,
  formatTrainingDate,
  iconToText,
  normalizeRating,
  ratingLabel,
  ratingPoints,
  seasonDateRange,
  seasonForTrainingDate,
  summarizePlayerTrainings,
} from './trainingUtils.js';

// API-Basis: zuerst ENV, ansonsten abhängig vom Hostname. Ein abschließender
// Schrägstrich wird entfernt, damit konfigurierte URLs zuverlässig funktionieren.
const API = (import.meta.env.VITE_API_BASE ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://fussball-api.onrender.com/')).replace(/\/+$/, '');

const REQUEST_TIMEOUT = 20000;
const INITIAL_SEASON = currentSeason();
const INITIAL_SEASON_RANGE = seasonDateRange(INITIAL_SEASON);

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

const formatInputDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '';
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

const drawPdfStar = (doc, centerX, centerY, radius, filled) => {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.44;
    return {
      x: centerX + Math.cos(angle) * pointRadius,
      y: centerY + Math.sin(angle) * pointRadius,
    };
  });
  const segments = points.slice(1).map((point, index) => [
    point.x - points[index].x,
    point.y - points[index].y,
  ]);
  segments.push([
    points[0].x - points[points.length - 1].x,
    points[0].y - points[points.length - 1].y,
  ]);
  doc.setDrawColor(199, 151, 24);
  doc.setFillColor(...(filled ? [255, 207, 51] : [218, 226, 238]));
  doc.lines(segments, points[0].x, points[0].y, [1, 1], 'FD', true);
};

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
  const [newTrainingLocation, setNewTrainingLocation] = useState('Sportplatz');
  const [defaultTrainingLocation, setDefaultTrainingLocation] = useState('Sportplatz');
  const [selectedSeason, setSelectedSeason] = useState(INITIAL_SEASON);
  const [expandedTraining, setExpandedTraining] = useState(null);
  const [editTrainingKey, setEditTrainingKey] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [fromDate, setFromDate] = useState(INITIAL_SEASON_RANGE.from);
  const [toDate, setToDate] = useState(INITIAL_SEASON_RANGE.to);
  const [reportData, setReportData] = useState(null);
  const [reportView, setReportView] = useState('children');
  const [expandedReportRow, setExpandedReportRow] = useState(null);
  const [showTrainings, setShowTrainings] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [showChecklists, setShowChecklists] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [expandedChecklist, setExpandedChecklist] = useState(null);
  const [showStartMenu, setShowStartMenu] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const version = '6.2';
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
          inactiveReasons: training.inactiveReasons || {},
          location: TRAINING_LOCATIONS.includes(training.location)
            ? training.location
            : 'Sportplatz',
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
    const [u, p, t, c, s] = await Promise.all([
      fetchJson('users'),
      fetchJson('players'),
      fetchJson('trainings'),
      fetchJson('checklists'),
      fetchJson('settings'),
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
              inactiveReasons: x.inactiveReasons || {},
              location: TRAINING_LOCATIONS.includes(x.location)
                ? x.location
                : 'Sportplatz',
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
              remarks: checklist.remarks || {},
              createdAt: toIsoDate(checklist.createdAt),
              lastEdited:
                checklist.lastEdited?.by && checklist.lastEdited?.at
                  ? checklist.lastEdited
                  : null,
            }))
          : []
      );
      const savedDefaultLocation = TRAINING_LOCATIONS.includes(s?.defaultTrainingLocation)
        ? s.defaultTrainingLocation
        : 'Sportplatz';
      setDefaultTrainingLocation(savedDefaultLocation);
      setNewTrainingLocation(savedDefaultLocation);
  }

  const saveDefaultLocation = () =>
    runOnce(async () => {
      const res = await apiRequest('settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultTrainingLocation }),
      });
      if (!res.ok) throw new Error(`Einstellungen: HTTP ${res.status}`);
      const saved = await res.json();
      const location = TRAINING_LOCATIONS.includes(saved.defaultTrainingLocation)
        ? saved.defaultTrainingLocation
        : 'Sportplatz';
      setDefaultTrainingLocation(location);
      setNewTrainingLocation(location);
      alert(`Standard-Trainingsort auf ${location} gesetzt.`);
    });

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
            training.inactiveReasons,
          ].some((collection) =>
            Object.prototype.hasOwnProperty.call(collection || {}, previousName)
          );
          if (!containsPreviousName) return training;
          return applyTrainingChange(training, `${previousName} in ${nextName} umbenannt`, {
            participants: renameObjectKey(training.participants, previousName, nextName),
            ratings: renameObjectKey(training.ratings, previousName, nextName),
            trainerStatus: renameObjectKey(training.trainerStatus, previousName, nextName),
            playerNotes: renameObjectKey(training.playerNotes, previousName, nextName),
            inactiveReasons: renameObjectKey(
              training.inactiveReasons,
              previousName,
              nextName
            ),
          });
        });
        const updatedChecklists = checklists.map((checklist) =>
          Object.prototype.hasOwnProperty.call(checklist.items || {}, previousName) ||
          Object.prototype.hasOwnProperty.call(checklist.remarks || {}, previousName)
            ? {
                ...checklist,
                items: renameObjectKey(checklist.items, previousName, nextName),
                remarks: renameObjectKey(checklist.remarks, previousName, nextName),
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
      const ratings = {};
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
        location: newTrainingLocation,
        participants,
        ratings,
        trainerStatus,
        playerNotes: {},
        inactiveReasons: {},
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
      setNewTrainingLocation(defaultTrainingLocation);
      const createdSeason = seasonForTrainingDate(formatted);
      if (createdSeason) {
        const range = seasonDateRange(createdSeason);
        setSelectedSeason(createdSeason);
        setFromDate(range.from);
        setToDate(range.to);
        setReportData(null);
      }
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
      const editedSeason = seasonForTrainingDate(formatted);
      if (editedSeason && editedSeason !== selectedSeason) {
        const range = seasonDateRange(editedSeason);
        setSelectedSeason(editedSeason);
        setFromDate(range.from);
        setToDate(range.to);
        setReportData(null);
      }
      alert('Datum wurde aktualisiert.');
      return true;
    });

  // Status ändern
  const updateParticipation = (training, name, statusIcon) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      const ratings = { ...(training.ratings || {}) };
      if (statusIcon === '✅') {
        if (!Object.prototype.hasOwnProperty.call(ratings, name)) ratings[name] = 0;
      } else {
        delete ratings[name];
      }
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Teilnahmestatus für ${name}: ${iconToText(statusIcon)}`, {
              participants: { ...(item.participants || {}), [name]: statusIcon },
              ratings,
            })
          : item
      );
      await saveTrainingList(updated);
    });

  const updateRating = (training, name, newRating) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return;
      if (training.participants?.[name] !== '✅') {
        alert('Eine Sternebewertung ist nur bei Teilnahme möglich.');
        return false;
      }
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

  const updateTrainingLocation = (training, location) =>
    runOnce(async () => {
      if (!TRAINING_LOCATIONS.includes(location)) return false;
      const idx = findTrainingIndex(training);
      if (idx === -1) return false;
      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, `Trainingsort auf ${location} geändert`, { location })
          : item
      );
      await saveTrainingList(updated);
      return true;
    });

  const updateTrainingInactivity = (training, name, makeInactive) =>
    runOnce(async () => {
      const idx = findTrainingIndex(training);
      if (idx === -1) return false;
      const reasons = { ...(training.inactiveReasons || {}) };
      let action = `${name} für dieses Training wieder aktiviert`;

      if (makeInactive) {
        const enteredReason = window.prompt(
          `Warum ist ${name} bei diesem Training inaktiv?`,
          reasons[name] || ''
        );
        if (enteredReason === null) return false;
        const reason = enteredReason.trim();
        if (!reason) {
          alert('Inaktiv kann nur mit einer Begründung gespeichert werden.');
          return false;
        }
        reasons[name] = reason;
        action = `${name} für dieses Training inaktiv: ${reason}`;
      } else {
        delete reasons[name];
      }

      const updated = trainings.map((item, itemIndex) =>
        itemIndex === idx
          ? applyTrainingChange(item, action, { inactiveReasons: reasons })
          : item
      );
      await saveTrainingList(updated);
      return true;
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
        ...Object.keys(training.inactiveReasons || {}),
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

  const seasonOptions = [
    ...new Set([
      INITIAL_SEASON,
      '2025/26',
      ...trainings.map((training) => seasonForTrainingDate(training.date)).filter(Boolean),
    ]),
  ].sort((a, b) => b.localeCompare(a));

  const changeSeason = (season) => {
    const range = seasonDateRange(season);
    setSelectedSeason(season);
    setFromDate(range.from);
    setToDate(range.to);
    setReportData(null);
    setExpandedTraining(null);
  };

  const trainingsToShow = sortTrainings(
    trainings.filter((t) => {
      const seasonOk = seasonForTrainingDate(t.date) === selectedSeason;
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
      return seasonOk && dateOk && searchOk;
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
        <section className="training-settings">
          <h2>Trainingseinstellungen</h2>
          <p>Dieser Ort ist beim Anlegen eines neuen Trainings vorausgewählt.</p>
          <div className="settings-row">
            <label className="labeled-field">
              <span>Standard-Trainingsort</span>
              <select
                value={defaultTrainingLocation}
                onChange={(event) => setDefaultTrainingLocation(event.target.value)}
                disabled={busy}
              >
                {TRAINING_LOCATIONS.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </label>
            <button className="btn-save-training" onClick={saveDefaultLocation} disabled={busy}>
              Standard speichern
            </button>
          </div>
        </section>
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
            <label className="labeled-field">
              <span>Notiz</span>
              <input
                type="text"
                placeholder="Notiz"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </label>
            <label className="labeled-field">
              <span>Hinweis hinter dem Namen</span>
              <input
                type="text"
                placeholder="z. B. Torhüterin"
                value={newMemberSince}
                onChange={(e) => setNewMemberSince(e.target.value)}
              />
            </label>
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
                    <label className="labeled-field">
                      <span>Notiz</span>
                      <input
                        type="text"
                        value={playerDraft.note}
                        onChange={(e) =>
                          setPlayerDraft((draft) => ({ ...draft, note: e.target.value }))
                        }
                        placeholder="Notiz"
                      />
                    </label>
                    <label className="labeled-field">
                      <span>Hinweis hinter dem Namen</span>
                      <input
                        type="text"
                        value={playerDraft.memberSince}
                        onChange={(e) =>
                          setPlayerDraft((draft) => ({ ...draft, memberSince: e.target.value }))
                        }
                        placeholder="Hinweis"
                      />
                    </label>
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
                    <label className="labeled-field">
                      <span>Notiz</span>
                      <input
                        type="text"
                        value={p.note || ''}
                        placeholder="Notiz"
                        onChange={(e) => {
                          const idx = players.findIndex((x) => x.name === p.name);
                          const updated = players.map((player, playerIndex) =>
                            playerIndex === idx ? { ...player, note: e.target.value } : player
                          );
                          setPlayers(updated);
                        }}
                        onBlur={(e) => handlePlayerNoteBlur(p, e.target.value)}
                      />
                    </label>
                    <label className="labeled-field">
                      <span>Hinweis hinter dem Namen</span>
                      <input
                        type="text"
                        value={p.memberSince || ''}
                        placeholder="Hinweis"
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
                    </label>
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
        <section className="season-toolbar">
          <label className="labeled-field">
            <span>Angezeigte Saison</span>
            <select
              value={selectedSeason}
              onChange={(event) => changeSeason(event.target.value)}
              disabled={busy}
            >
              {seasonOptions.map((season) => (
                <option key={season} value={season}>Saison {season}</option>
              ))}
            </select>
          </label>
        </section>
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
              <label>
                Trainingsort
                <select
                  value={newTrainingLocation}
                  onChange={(event) => setNewTrainingLocation(event.target.value)}
                  disabled={busy}
                >
                  {TRAINING_LOCATIONS.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
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
                    📅 {t.date} · {t.location || 'Sportplatz'} {expandedKey ? '🔽' : '▶'}
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
                      <div className="training-location-row">
                        <label className="labeled-field">
                          <span>Trainingsort</span>
                          <select
                            value={t.location || 'Sportplatz'}
                            onChange={(event) => updateTrainingLocation(t, event.target.value)}
                            disabled={busy}
                          >
                            {TRAINING_LOCATIONS.map((location) => (
                              <option key={location} value={location}>{location}</option>
                            ))}
                          </select>
                        </label>
                      </div>
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
                          const inactiveReason =
                            typeof t.inactiveReasons?.[p.name] === 'string'
                              ? t.inactiveReasons[p.name].trim()
                              : '';
                          const isInactiveForTraining = !!inactiveReason;
                          const cardBg = idxP % 2 === 0 ? 'player-card even' : 'player-card odd';
                          if (isTrainer) {
                            const trainerStatus =
                              (t.trainerStatus && t.trainerStatus[p.name]) || 'Nicht abgemeldet';
                            return (
                              <div key={p.name + 'trainer'} className={cardBg}>
                                <div className="participant-col">
                                  <div className="player-name-line">
                                    <b>{p.name}</b>
                                    <em className="trainer-label">Trainer*in</em>
                                    {teamHinweis && (
                                      <span className="player-hint">Hinweis: {teamHinweis}</span>
                                    )}
                                  </div>
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
                              <div
                                key={p.name}
                                className={`${cardBg} ${isInactiveForTraining ? 'training-inactive' : ''}`}
                              >
                                <div className="participant-col">
                                  <div className="player-name-line">
                                    <b>{p.name}</b>
                                    {teamHinweis && (
                                      <span className="player-hint">Hinweis: {teamHinweis}</span>
                                    )}
                                  </div>
                                  <div className="training-inactive-control">
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={isInactiveForTraining}
                                        onChange={(event) =>
                                          updateTrainingInactivity(t, p.name, event.target.checked)
                                        }
                                        disabled={busy}
                                      />{' '}
                                      Nur bei diesem Training inaktiv
                                    </label>
                                    {isInactiveForTraining && (
                                      <div className="inactive-reason">
                                        <span>Begründung: {inactiveReason}</span>
                                        <button
                                          type="button"
                                          onClick={() => updateTrainingInactivity(t, p.name, true)}
                                          disabled={busy}
                                        >
                                          Begründung ändern
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ margin: '0.3em 0' }}>
                                    <span>Status</span>
                                    <div className="btn-part-status status-btn-row">
                                      {STATUS_OPTIONS.map(({ icon, label }) => (
                                        <button
                                          key={icon}
                                          className={statusIcon === icon ? 'active' : ''}
                                          onClick={() => updateParticipation(t, p.name, icon)}
                                          disabled={busy || isInactiveForTraining}
                                          aria-label={`${p.name}: ${label}`}
                                          title={label}
                                        >
                                          {icon}
                                        </button>
                                      ))}
                                      <span className="status-text">
                                        {isInactiveForTraining
                                          ? 'Inaktiv, wird nicht gewertet'
                                          : iconToText(statusIcon)}
                                      </span>
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
                                          disabled={
                                            busy ||
                                            isInactiveForTraining ||
                                            statusIcon !== '✅'
                                          }
                                          aria-label={`${rating} ${rating === 1 ? 'Stern' : 'Sterne'}`}
                                          title={ratingLabel(rating)}
                                        >
                                          ★
                                        </button>
                                      ))}
                                      <span className="rating-text">
                                        {isInactiveForTraining ? (
                                          'Für dieses Training nicht gewertet'
                                        ) : statusIcon !== '✅' ? (
                                          'Sterne erst bei „Teilgenommen“ möglich'
                                        ) : currentRating === null ? (
                                          'Noch keine Bewertung'
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
                                    <span className="field-label">Notiz</span>
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
                {filterDate || searchText
                  ? ' für diesen Filter.'
                  : ` in der Saison ${selectedSeason}.`}
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
              Trainingsbezogene Inaktivität wird nicht in die Quote oder Bewertung eingerechnet.
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
                <div className="report-export-buttons">
                  <button
                    className="report-export-button"
                    onClick={() => runOnce(exportPDF)}
                    disabled={busy}
                  >
                    Tabellen-PDF
                  </button>
                  <button
                    className="report-export-button child-export-button"
                    onClick={() => runOnce(exportChildPDF)}
                    disabled={busy}
                  >
                    Kindgerechtes PDF
                  </button>
                </div>
              )}
            </div>
            {reportData && (
              <div className="report-results">
                <h3>Trainingsauswertung Saison {reportData.season}</h3>
                <p>
                  {reportData.totalTrainings} Training
                  {reportData.totalTrainings !== 1 ? 's' : ''} vom{' '}
                  {formatInputDate(reportData.fromDate)} bis {formatInputDate(reportData.toDate)}.
                </p>
                <div className="report-view-switch" role="group" aria-label="Auswertungsansicht">
                  <button
                    className={reportView === 'children' ? 'active' : ''}
                    onClick={() => setReportView('children')}
                  >
                    Kindgerechte Ansicht
                  </button>
                  <button
                    className={reportView === 'table' ? 'active' : ''}
                    onClick={() => setReportView('table')}
                  >
                    Tabelle
                  </button>
                </div>
                {reportView === 'children' ? (
                  <div className="child-report-grid">
                    {reportData.data.map((row) => (
                      <article key={row.name} className="child-report-card">
                        <div className="child-report-name">
                          <h4>{row.name}</h4>
                          {row.memberSince && (
                            <span className="player-hint">{row.memberSince}</span>
                          )}
                        </div>
                        <div className="attendance-summary">
                          <div className="attendance-label">
                            <span>Teilnahme</span>
                            <strong>{row.percent}%</strong>
                          </div>
                          <div
                            className="attendance-bar"
                            role="progressbar"
                            aria-label={`Teilnahme von ${row.name}`}
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow={row.percent}
                          >
                            <span style={{ width: `${row.percent}%` }} />
                          </div>
                          <p>{row.attendCount} von {row.consideredCount} Trainings dabei</p>
                        </div>
                        <div className="child-rating-summary">
                          <span>Durchschnittliche Bewertung</span>
                          <div
                            className="child-stars"
                            aria-label={
                              row.averageRatingValue === null
                                ? `Noch keine Bewertung für ${row.name}`
                                : `${row.averageRating} von 3 Sternen für ${row.name}`
                            }
                          >
                            {RATING_VALUES.map((star) => {
                              const fill = Math.max(
                                0,
                                Math.min(1, (row.averageRatingValue || 0) - star + 1)
                              );
                              return (
                                <span
                                  key={star}
                                  className="child-star"
                                  style={{ '--star-fill': `${Math.round(fill * 100)}%` }}
                                  aria-hidden="true"
                                >
                                  ★
                                </span>
                              );
                            })}
                          </div>
                          <strong>
                            {row.averageRatingValue === null
                              ? 'Noch keine Sternebewertung'
                              : `${row.averageRating} von 3 Sternen`}
                          </strong>
                        </div>
                        <div className="child-status-summary">
                          <span>Dabei: {row.attendCount}</span>
                          <span>Abgemeldet: {row.excusedCount}</span>
                          <span>Nicht abgemeldet: {row.unexcusedCount}</span>
                          <span>Inaktiv: {row.inactiveCount}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
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
                        <th>Inaktiv</th>
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
                            <td>{row.note || ''}</td>
                            <td>{row.percent}%</td>
                            <td>{row.attendCount}</td>
                            <td>{row.excusedCount}</td>
                            <td>{row.unexcusedCount}</td>
                            <td>{row.inactiveCount}</td>
                            <td>
                              {row.averageRating}
                              {row.ratingCount > 0 ? ' / 3' : ''}
                            </td>
                            <td>{row.pointsTotal}</td>
                          </tr>
                          {expandedReportRow === row.name && (
                            <tr className="report-details-row">
                              <td colSpan={10}>
                                <ul>
                                  {row.details.map((detail) => (
                                    <li key={detail.date}>
                                      {detail.date}: <strong>{detail.statusText}</strong>,{' '}
                                      {detail.inactiveReason
                                        ? `Begründung: ${detail.inactiveReason}, nicht gewertet`
                                        : detail.rating === null
                                          ? 'noch keine Bewertung'
                                          : `${'★'.repeat(detail.rating)}${'☆'.repeat(3 - detail.rating)} (${detail.points > 0 ? '+' : ''}${detail.points} Punkte)`}
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
                )}
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
        remarks: Object.fromEntries(
          Object.entries(cl.remarks || {}).map(([name, remark]) => [
            name,
            typeof remark === 'string' ? remark : '',
          ])
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
      const normalized = Array.isArray(serverList)
        ? serverList.map((checklist) => ({
            ...checklist,
            items: checklist.items || {},
            remarks: checklist.remarks || {},
          }))
        : [];
      setChecklists(normalized);
      return normalized;
    };
    const ensurePlayersPresent = (cl) => {
      const items = { ...(cl.items || {}) };
      const remarks = { ...(cl.remarks || {}) };
      activePlayersOnly.forEach((p) => {
        if (!(p.name in items)) items[p.name] = false;
        if (!(p.name in remarks)) remarks[p.name] = '';
      });
      return { ...cl, items, remarks };
    };
    const createChecklist = () =>
      runOnce(async () => {
        const title = newChecklistTitle.trim() || 'Neue Checkliste';
        const items = {};
        const remarks = {};
        activePlayersOnly.forEach((p) => {
          items[p.name] = false;
          remarks[p.name] = '';
        });
        const newCl = {
          title,
          items,
          remarks,
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
    const saveRemark = (idx, playerName, remark) =>
      runOnce(async () => {
        const updated = [...checklists];
        const cl = { ...ensurePlayersPresent(updated[idx]) };
        const cleanedRemark = typeof remark === 'string' ? remark.trim() : '';
        cl.remarks = { ...cl.remarks, [playerName]: cleanedRemark };
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
                        className="checklist-title-input"
                        type="text"
                        value={cl.title}
                        onChange={(e) => {
                          const updated = [...checklists];
                          updated[idx] = { ...cl, title: e.target.value };
                          setChecklists(updated);
                        }}
                        onBlur={(e) => renameChecklist(idx, e.target.value)}
                      />
                    </div>
                    <div className="checklist-actions">
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
                        disabled={busy}
                      >
                        Alle leeren
                      </button>
                      <button
                        className="btn-delete-training"
                        onClick={() => deleteChecklist(idx)}
                        disabled={busy}
                      >
                        🗑 Löschen
                      </button>
                    </div>
                    <div className="checklist-items">
                      <div className="checklist-items-head" aria-hidden="true">
                        <span>Spielerin</span>
                        <span>Erledigt</span>
                        <span>Bemerkung</span>
                      </div>
                      {activePlayersOnly.map((p, i) => (
                        <div
                          key={p.name}
                          className="checklist-person-row"
                          style={{ '--checklist-row-bg': rowBg(i) }}
                        >
                          <strong className="checklist-person-name">{p.name}</strong>
                          <label className="checklist-person-check">
                            <input
                              type="checkbox"
                              checked={!!cl.items[p.name]}
                              onChange={() => toggleItem(idx, p.name)}
                              disabled={busy}
                            />
                            <span>{cl.items[p.name] ? 'Erledigt' : 'Offen'}</span>
                          </label>
                          <label className="checklist-remark-field">
                            <span className="mobile-field-label">Bemerkung</span>
                            <input
                              type="text"
                              value={cl.remarks[p.name] || ''}
                              placeholder="Bemerkung zu dieser Spielerin"
                              onChange={(event) => {
                                const updated = [...checklists];
                                const changed = { ...ensurePlayersPresent(updated[idx]) };
                                changed.remarks = {
                                  ...changed.remarks,
                                  [p.name]: event.target.value,
                                };
                                updated[idx] = changed;
                                setChecklists(updated);
                              }}
                              onBlur={(event) => saveRemark(idx, p.name, event.target.value)}
                              disabled={busy}
                            />
                          </label>
                        </div>
                      ))}
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
    setReportData({
      totalTrainings: totalCount,
      data: report,
      season: selectedSeason,
      fromDate,
      toDate,
    });
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
    doc.text(`Trainingsauswertung Saison ${reportData.season}`, 14, 18);
    doc.setFontSize(11);
    doc.text(
      `Zeitraum: ${formatInputDate(reportData.fromDate)} bis ${formatInputDate(reportData.toDate)} | ${reportData.totalTrainings} Trainings`,
      14,
      27
    );
    doc.text(`Fußball-App Version ${version}`, 230, 18);
    const tableColumn = [
      'Spielerin',
      'Hinweis',
      'Notiz',
      'Teilnahme',
      'Dabei',
      'Abgemeldet',
      'Nicht abgemeldet',
      'Inaktiv',
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
      r.inactiveCount,
      r.averageRating === '–' ? '–' : `${r.averageRating} / 3`,
      r.pointsTotal,
    ]);
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 34,
      theme: 'grid',
      headStyles: { fillColor: [49, 169, 255], textColor: 255 },
      bodyStyles: { fillColor: [36, 40, 62], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 1.5, minCellHeight: 6 },
    });
    doc.setFontSize(11);
    doc.text(`© ${currentYear} Matthias Kopf. Alle Rechte vorbehalten.`, 14, doc.internal.pageSize.height - 10);
    doc.save(`Trainingsauswertung-Saison-${reportData.season.replace('/', '-')}.pdf`);
  }

  async function exportChildPDF() {
    if (!reportData) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const gap = 8;
    const cardWidth = (pageWidth - margin * 2 - gap) / 2;
    const cardHeight = 70;
    const cardsPerPage = 4;

    const drawHeader = () => {
      doc.setFillColor(24, 108, 190);
      doc.rect(0, 0, pageWidth, 29, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(`Meine Trainingsauswertung, Saison ${reportData.season}`, margin, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        `${formatInputDate(reportData.fromDate)} bis ${formatInputDate(reportData.toDate)} | ${reportData.totalTrainings} Trainings`,
        margin,
        22
      );
    };

    if (reportData.data.length === 0) {
      drawHeader();
      doc.setTextColor(45, 62, 82);
      doc.setFontSize(14);
      doc.text('Für diesen Zeitraum sind keine Spielerinnen auswertbar.', margin, 48);
    }

    reportData.data.forEach((row, index) => {
      if (index % cardsPerPage === 0) {
        if (index > 0) doc.addPage();
        drawHeader();
      }

      const pageIndex = index % cardsPerPage;
      const column = pageIndex % 2;
      const line = Math.floor(pageIndex / 2);
      const x = margin + column * (cardWidth + gap);
      const y = 35 + line * (cardHeight + gap);
      const innerX = x + 8;

      doc.setDrawColor(154, 193, 226);
      doc.setFillColor(241, 248, 255);
      doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'FD');

      doc.setTextColor(25, 76, 126);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(String(row.name || '').slice(0, 32), innerX, y + 11);

      if (row.memberSince) {
        doc.setTextColor(78, 103, 129);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const hint = doc.splitTextToSize(`Hinweis: ${row.memberSince}`, cardWidth - 16)[0];
        doc.text(hint, innerX, y + 17);
      }

      const attendanceY = y + 24;
      const barWidth = cardWidth - 50;
      doc.setTextColor(44, 66, 89);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Teilnahme', innerX, attendanceY);
      doc.text(`${row.percent}%`, x + cardWidth - 8, attendanceY, { align: 'right' });
      doc.setFillColor(215, 226, 237);
      doc.roundedRect(innerX, attendanceY + 3, barWidth, 6, 3, 3, 'F');
      if (row.percent > 0) {
        const attendanceColor =
          row.percent >= 75 ? [52, 181, 108] : row.percent >= 50 ? [244, 178, 45] : [229, 100, 90];
        doc.setFillColor(...attendanceColor);
        doc.roundedRect(
          innerX,
          attendanceY + 3,
          Math.max(3, (barWidth * row.percent) / 100),
          6,
          3,
          3,
          'F'
        );
      }
      doc.setTextColor(75, 92, 109);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `${row.attendCount} von ${row.consideredCount} gewerteten Trainings dabei`,
        innerX,
        attendanceY + 14
      );

      const ratingY = y + 49;
      doc.setTextColor(44, 66, 89);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Sterne', innerX, ratingY);
      const filledStars =
        row.averageRatingValue === null
          ? 0
          : Math.max(0, Math.min(3, Math.round(row.averageRatingValue)));
      RATING_VALUES.forEach((star) => {
        drawPdfStar(doc, innerX + 31 + (star - 1) * 11, ratingY - 1.3, 4.5, star <= filledStars);
      });
      doc.setTextColor(44, 66, 89);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(
        row.averageRatingValue === null ? 'Noch keine Bewertung' : `${row.averageRating} von 3`,
        x + cardWidth - 8,
        ratingY,
        { align: 'right' }
      );

      doc.setTextColor(83, 99, 116);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.text(
        `Abgemeldet: ${row.excusedCount}   Nicht abgemeldet: ${row.unexcusedCount}   Inaktiv: ${row.inactiveCount}`,
        innerX,
        y + 63
      );
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setTextColor(101, 116, 132);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Fußball-App ${version} | Seite ${page} von ${pageCount}`, margin, pageHeight - 5);
      doc.text(`© ${currentYear} Matthias Kopf`, pageWidth - margin, pageHeight - 5, {
        align: 'right',
      });
    }

    doc.save(`Kindgerechte-Auswertung-Saison-${reportData.season.replace('/', '-')}.pdf`);
  }
}
