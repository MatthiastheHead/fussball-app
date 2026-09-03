// Version 6.4: übersichtliche Teamverwaltung und eine sichere
// Authenticator-Wiederherstellung für Matthias.

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
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
  selectReportPlayers,
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
  const [authToken, setAuthToken] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [recoveryCredential, setRecoveryCredential] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryNewPasswordRepeat, setRecoveryNewPasswordRepeat] = useState('');
  const [passwordRecoveryError, setPasswordRecoveryError] = useState('');
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [users, setUsers] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [adminLoadError, setAdminLoadError] = useState('');
  const [recoveryAdminError, setRecoveryAdminError] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState({
    enabled: false,
    enabledAt: null,
    remainingRecoveryCodes: 0,
  });
  const [recoverySetupPassword, setRecoverySetupPassword] = useState('');
  const [recoverySetupData, setRecoverySetupData] = useState(null);
  const [recoverySetupCode, setRecoverySetupCode] = useState('');
  const [recoveryQrCode, setRecoveryQrCode] = useState('');
  const [recoverySetupConfirmed, setRecoverySetupConfirmed] = useState(false);
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
  const [teamSearch, setTeamSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
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
  const [selectedReportPlayers, setSelectedReportPlayers] = useState(null);
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
  const version = '6.4';
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
    const [p, t, c, s] = await Promise.all([
      fetchJson('players'),
      fetchJson('trainings'),
      fetchJson('checklists'),
      fetchJson('settings'),
    ]);
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

  const authenticatedRequest = (path, options = {}, token = authToken) =>
    apiRequest(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

  async function loadAdminData(token = authToken) {
    if (!token) return false;
    setAdminLoadError('');
    setRecoveryAdminError('');
    const [usersResponse, historyResponse, recoveryResponse] = await Promise.all([
      authenticatedRequest('admin/users', {}, token),
      authenticatedRequest('admin/login-events?limit=200', {}, token),
      authenticatedRequest('admin/recovery/status', {}, token),
    ]);
    if (!usersResponse.ok || !historyResponse.ok) {
      if (usersResponse.status === 401 || historyResponse.status === 401) {
        setAdminLoadError('Die Admin-Sitzung ist abgelaufen. Bitte erneut einloggen.');
      } else {
        setAdminLoadError('Die Admin-Daten konnten nicht geladen werden.');
      }
      return false;
    }
    const [adminUsers, events] = await Promise.all([
      usersResponse.json(),
      historyResponse.json(),
    ]);
    setUsers(Array.isArray(adminUsers) ? adminUsers : []);
    setLoginHistory(Array.isArray(events) ? events : []);
    if (recoveryResponse.ok) {
      const status = await recoveryResponse.json();
      setRecoveryStatus({
        enabled: !!status.enabled,
        enabledAt: status.enabledAt || null,
        remainingRecoveryCodes: Number(status.remainingRecoveryCodes) || 0,
      });
    } else {
      setRecoveryAdminError(
        recoveryResponse.status === 404
          ? 'Die Authenticator-Funktion wird gerade bereitgestellt.'
          : 'Der Authenticator-Status konnte nicht geladen werden.'
      );
    }
    return true;
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

  useEffect(() => {
    if (initializing) return;
    const eligibleNames = players
      .filter((player) => !player.isTrainer && !player.inactive)
      .map((player) => player.name);
    const eligibleSet = new Set(eligibleNames);
    setSelectedReportPlayers((selected) =>
      selected === null
        ? eligibleNames
        : selected.filter((name) => eligibleSet.has(name))
    );
  }, [players, initializing]);

  const handleLogin = () =>
    runOnce(async () => {
      if (initializing) return false;
      const trimmedName = loginName.trim();
      if (!trimmedName || !loginPass) {
        setLoginError('Bitte Benutzername und Passwort eingeben.');
        return false;
      }
      const response = await apiRequest('auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, password: loginPass }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setLoginError(errorData.error || 'Falscher Benutzername oder Passwort.');
        return false;
      }
      const session = await response.json();
      setLoggedInUser(session.name);
      setAuthToken(session.token);
      setLoginError('');
      setLoginNotice('');
      setLoginName('');
      setLoginPass('');
      setShowStartMenu(true);
      setShowSettings(false);
      if (session.isAdmin) {
        await loadAdminData(session.token);
      } else {
        setUsers([]);
        setLoginHistory([]);
        setAdminLoadError('');
      }
      return true;
    });

  const handleLogout = () => {
    if (authToken) {
      authenticatedRequest('auth/logout', { method: 'POST' }).catch(() => {});
    }
    setLoggedInUser(null);
    setAuthToken('');
    setUsers([]);
    setLoginHistory([]);
    setAdminLoadError('');
    setRecoveryAdminError('');
    setRecoveryStatus({ enabled: false, enabledAt: null, remainingRecoveryCodes: 0 });
    setRecoverySetupPassword('');
    setRecoverySetupData(null);
    setRecoverySetupCode('');
    setRecoveryQrCode('');
    setRecoverySetupConfirmed(false);
    setShowStartMenu(true);
    setShowSettings(false);
    setShowChecklists(false);
    setLoginError('');
  };

  const handlePasswordRecovery = () =>
    runOnce(async () => {
      setPasswordRecoveryError('');
      if (!recoveryCredential.trim()) {
        setPasswordRecoveryError('Gib den Code aus deiner App oder einen Notfallcode ein.');
        return false;
      }
      if (recoveryNewPassword.length < 8) {
        setPasswordRecoveryError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
        return false;
      }
      if (recoveryNewPassword !== recoveryNewPasswordRepeat) {
        setPasswordRecoveryError('Die beiden Passwörter stimmen nicht überein.');
        return false;
      }

      const response = await apiRequest('auth/recover-matthias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: recoveryCredential.trim(),
          newPassword: recoveryNewPassword,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPasswordRecoveryError(
          errorData.error || 'Das Passwort konnte nicht zurückgesetzt werden.'
        );
        return false;
      }

      setRecoveryCredential('');
      setRecoveryNewPassword('');
      setRecoveryNewPasswordRepeat('');
      setShowPasswordRecovery(false);
      setLoginName('Matthias');
      setLoginPass('');
      setLoginNotice('Dein Passwort wurde geändert. Du kannst dich jetzt neu einloggen.');
      return true;
    });

  const startAuthenticatorSetup = () =>
    runOnce(async () => {
      setRecoveryAdminError('');
      if (!recoverySetupPassword) {
        setRecoveryAdminError('Gib zuerst dein aktuelles Passwort ein.');
        return false;
      }
      const response = await authenticatedRequest('admin/recovery/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: recoverySetupPassword }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setRecoveryAdminError(
          errorData.error || 'Die Authenticator-Einrichtung konnte nicht gestartet werden.'
        );
        return false;
      }

      const setup = await response.json();
      let qrCode = '';
      try {
        qrCode = await QRCode.toDataURL(setup.otpAuthUrl, {
          width: 240,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#0b1320', light: '#ffffff' },
        });
      } catch (error) {
        console.error('QR-Code konnte nicht erstellt werden:', error);
      }
      setRecoverySetupPassword('');
      setRecoverySetupData(setup);
      setRecoverySetupCode('');
      setRecoveryQrCode(qrCode);
      setRecoverySetupConfirmed(false);
      return true;
    });

  const confirmAuthenticatorSetup = () =>
    runOnce(async () => {
      setRecoveryAdminError('');
      if (!/^\d{6}$/.test(recoverySetupCode.trim())) {
        setRecoveryAdminError('Gib den 6-stelligen Code aus deiner Authenticator-App ein.');
        return false;
      }
      const response = await authenticatedRequest('admin/recovery/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: recoverySetupCode.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setRecoveryAdminError(
          errorData.error || 'Der Authenticator-Code konnte nicht bestätigt werden.'
        );
        return false;
      }
      const status = await response.json();
      setRecoveryStatus({
        enabled: true,
        enabledAt: status.enabledAt || new Date().toISOString(),
        remainingRecoveryCodes: Number(status.remainingRecoveryCodes) || 8,
      });
      setRecoverySetupConfirmed(true);
      setRecoverySetupCode('');
      return true;
    });

  const copyRecoveryCodes = async () => {
    const codes = recoverySetupData?.recoveryCodes;
    if (!Array.isArray(codes) || codes.length === 0) return;
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      alert('Notfallcodes kopiert. Bewahre sie an einem sicheren Ort auf.');
    } catch {
      alert('Automatisches Kopieren ging nicht. Markiere und kopiere die Codes bitte von Hand.');
    }
  };

  const finishAuthenticatorSetup = () => {
    setRecoverySetupData(null);
    setRecoverySetupCode('');
    setRecoveryQrCode('');
    setRecoverySetupConfirmed(false);
    setRecoveryAdminError('');
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
      const res = await authenticatedRequest('admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: newUserPass }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Fehler beim Anlegen des Benutzers.');
        return;
      }
      await loadAdminData();
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
      const user = users[index];
      const res = await authenticatedRequest(`admin/users/${user._id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPass }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Fehler beim Aktualisieren des Passworts.');
        return;
      }
      await loadAdminData();
      const draftKey = users[index]._id || users[index].name;
      setPasswordDrafts((drafts) => ({ ...drafts, [draftKey]: '' }));
      alert(`Passwort für ${user.name} geändert.`);
    });

  const deleteUser = (index) =>
    runOnce(async () => {
      const userToDelete = users[index];
      if (userToDelete.name === 'Matthias') {
        alert('Den Administrator kann man nicht löschen.');
        return;
      }
      if (!window.confirm(`Benutzer ${userToDelete.name} wirklich löschen?`)) return;
      const res = await authenticatedRequest(`admin/users/${userToDelete._id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Fehler beim Löschen des Benutzers.');
        return;
      }
      await loadAdminData();
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
      if (previousName !== nextName) {
        setSelectedReportPlayers((selected) =>
          selected === null
            ? selected
            : selected.map((name) => (name === previousName ? nextName : name))
        );
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
  const reportPlayers = selectReportPlayers(sortedPlayers);
  const selectedReportPlayerNames =
    selectedReportPlayers === null
      ? reportPlayers.map((player) => player.name)
      : selectedReportPlayers;
  const selectedReportPlayerSet = new Set(selectedReportPlayerNames);

  const changeReportPlayerSelection = (nextSelection) => {
    setSelectedReportPlayers(nextSelection);
    setReportData(null);
    setExpandedReportRow(null);
  };

  const toggleReportPlayer = (playerName) => {
    const nextSelection = selectedReportPlayerSet.has(playerName)
      ? selectedReportPlayerNames.filter((name) => name !== playerName)
      : [...selectedReportPlayerNames, playerName];
    changeReportPlayerSelection(nextSelection);
  };

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
          {showPasswordRecovery ? (
            <div className="password-recovery-form">
              <h2>Passwort für Matthias zurücksetzen</h2>
              <p>
                Nutze einen aktuellen 6-stelligen Code aus deiner Authenticator-App oder einen
                einmaligen Notfallcode.
              </p>
              <label className="login-field">
                <span>Authenticator- oder Notfallcode</span>
                <input
                  type="text"
                  placeholder="123456 oder XXXX-XXXX-XXXX"
                  value={recoveryCredential}
                  onChange={(event) => setRecoveryCredential(event.target.value)}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  inputMode="text"
                  disabled={busy || initializing}
                />
              </label>
              <label className="login-field">
                <span>Neues Passwort</span>
                <input
                  type="password"
                  placeholder="Mindestens 8 Zeichen"
                  value={recoveryNewPassword}
                  onChange={(event) => setRecoveryNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={busy || initializing}
                />
              </label>
              <label className="login-field">
                <span>Neues Passwort wiederholen</span>
                <input
                  type="password"
                  placeholder="Passwort wiederholen"
                  value={recoveryNewPasswordRepeat}
                  onChange={(event) => setRecoveryNewPasswordRepeat(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === 'Enter' && handlePasswordRecovery()
                  }
                  autoComplete="new-password"
                  minLength={8}
                  disabled={busy || initializing}
                />
              </label>
              <button
                onClick={handlePasswordRecovery}
                disabled={busy || initializing || !!loadError}
              >
                {busy ? 'Passwort wird geändert…' : 'Neues Passwort speichern'}
              </button>
              <button
                className="login-secondary-button"
                onClick={() => {
                  setShowPasswordRecovery(false);
                  setPasswordRecoveryError('');
                  setRecoveryCredential('');
                  setRecoveryNewPassword('');
                  setRecoveryNewPasswordRepeat('');
                }}
                disabled={busy}
              >
                Zurück zur Anmeldung
              </button>
              {passwordRecoveryError && (
                <p className="login-error">{passwordRecoveryError}</p>
              )}
            </div>
          ) : (
            <>
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
              <button
                className="login-secondary-button"
                onClick={() => {
                  setShowPasswordRecovery(true);
                  setLoginError('');
                  setLoginNotice('');
                  setPasswordRecoveryError('');
                }}
                disabled={busy || initializing || !!loadError}
              >
                Passwort vergessen, Matthias?
              </button>
              {loadError && (
                <button className="retry-button" onClick={loadInitialData} disabled={initializing}>
                  Erneut versuchen
                </button>
              )}
              {loginNotice && <p className="login-notice">{loginNotice}</p>}
              {loginError && <p className="login-error">{loginError}</p>}
            </>
          )}
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
    const loginOverviewNames = [
      ...new Set([
        ...users.map((user) => user.name),
        ...loginHistory.map((event) => event.username),
      ]),
    ].sort((a, b) => a.localeCompare(b));
    const playersCount = players.filter((player) => !player.isTrainer).length;
    const trainersCount = players.filter((player) => player.isTrainer).length;
    const inactiveMembersCount = players.filter((player) => player.inactive).length;
    const normalizedTeamSearch = teamSearch.trim().toLocaleLowerCase('de-DE');
    const filteredTeamMembers = sortedPlayers
      .filter((player) => {
        const matchesSearch =
          !normalizedTeamSearch ||
          [player.name, player.note, player.memberSince].some((value) =>
            String(value || '').toLocaleLowerCase('de-DE').includes(normalizedTeamSearch)
          );
        const matchesFilter =
          teamFilter === 'all' ||
          (teamFilter === 'players' && !player.isTrainer) ||
          (teamFilter === 'trainers' && player.isTrainer) ||
          (teamFilter === 'inactive' && player.inactive);
        return matchesSearch && matchesFilter;
      })
      .sort(
        (a, b) =>
          Number(a.inactive) - Number(b.inactive) || a.name.localeCompare(b.name)
      );
    const teamGroups = [
      {
        key: 'players',
        title: 'Spielerinnen',
        members: filteredTeamMembers.filter((player) => !player.isTrainer),
      },
      {
        key: 'trainers',
        title: 'Trainer',
        members: filteredTeamMembers.filter((player) => player.isTrainer),
      },
    ].filter((group) => group.members.length > 0);

    const renderTeamMember = (player) => {
      const isEditing = editPlayerId === player.name;
      if (isEditing) {
        return (
          <li key={player.name} className="team-member-card editing">
            <form
              className="team-member-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveEditPlayer();
              }}
            >
              <div className="team-member-edit-heading">
                <strong>{player.name} bearbeiten</strong>
                <span>Alle Änderungen werden zusammen gespeichert.</span>
              </div>
              <div className="team-form-grid">
                <label className="labeled-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={playerDraft.name || ''}
                    onChange={(event) =>
                      setPlayerDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    autoFocus
                    disabled={busy}
                  />
                </label>
                <label className="labeled-field">
                  <span>Rolle</span>
                  <select
                    value={playerDraft.isTrainer ? 'Trainer' : 'Spieler'}
                    onChange={(event) =>
                      setPlayerDraft((draft) => ({
                        ...draft,
                        isTrainer: event.target.value === 'Trainer',
                      }))
                    }
                    disabled={busy}
                  >
                    <option value="Spieler">Spielerin</option>
                    <option value="Trainer">Trainer</option>
                  </select>
                </label>
                <label className="labeled-field">
                  <span>Hinweis hinter dem Namen</span>
                  <input
                    type="text"
                    value={playerDraft.memberSince || ''}
                    onChange={(event) =>
                      setPlayerDraft((draft) => ({
                        ...draft,
                        memberSince: event.target.value,
                      }))
                    }
                    placeholder="z. B. Torhüterin"
                    disabled={busy}
                  />
                </label>
                <label className="labeled-field">
                  <span>Interne Notiz</span>
                  <input
                    type="text"
                    value={playerDraft.note || ''}
                    onChange={(event) =>
                      setPlayerDraft((draft) => ({ ...draft, note: event.target.value }))
                    }
                    placeholder="Optional"
                    disabled={busy}
                  />
                </label>
              </div>
              <label className="team-inactive-switch">
                <input
                  type="checkbox"
                  checked={!!playerDraft.inactive}
                  onChange={(event) =>
                    setPlayerDraft((draft) => ({
                      ...draft,
                      inactive: event.target.checked,
                    }))
                  }
                  disabled={busy}
                />
                <span>Teammitglied allgemein inaktiv</span>
              </label>
              <div className="team-member-actions">
                <button type="submit" className="btn-save-players" disabled={busy}>
                  {busy ? 'Speichert…' : 'Speichern'}
                </button>
                <button type="button" className="btn-edit" onClick={cancelEditPlayer} disabled={busy}>
                  Abbrechen
                </button>
              </div>
            </form>
          </li>
        );
      }

      return (
        <li key={player.name} className={`team-member-card${player.inactive ? ' is-inactive' : ''}`}>
          <div className="team-member-main">
            <span className="team-member-avatar" aria-hidden="true">
              {player.name.trim().charAt(0).toLocaleUpperCase('de-DE') || '?'}
            </span>
            <div className="team-member-identity">
              <strong>{player.name}</strong>
              <div className="team-member-badges">
                <span className={player.isTrainer ? 'team-role trainer' : 'team-role player'}>
                  {player.isTrainer ? 'Trainer' : 'Spielerin'}
                </span>
                <span className={player.inactive ? 'team-status off' : 'team-status active'}>
                  {player.inactive ? 'Inaktiv' : 'Aktiv'}
                </span>
              </div>
            </div>
            <div className="team-member-actions">
              <button type="button" className="btn-edit" onClick={() => startEditPlayer(player)} disabled={busy}>
                Bearbeiten
              </button>
              <button
                type="button"
                className="btn-status"
                onClick={() => toggleInactive(player)}
                disabled={busy}
              >
                {player.inactive ? 'Aktivieren' : 'Inaktiv setzen'}
              </button>
              <button type="button" className="btn-delete" onClick={() => deletePlayer(player)} disabled={busy}>
                Löschen
              </button>
            </div>
          </div>
          {(player.memberSince || player.note) && (
            <dl className="team-member-details">
              {player.memberSince && (
                <div>
                  <dt>Hinweis</dt>
                  <dd>{player.memberSince}</dd>
                </div>
              )}
              {player.note && (
                <div>
                  <dt>Notiz</dt>
                  <dd>{player.note}</dd>
                </div>
              )}
            </dl>
          )}
        </li>
      );
    };

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
          <div className="team-management-heading">
            <div>
              <h2>Team verwalten</h2>
              <p>Spielerinnen und Trainer anlegen, suchen und bearbeiten.</p>
            </div>
            <div className="team-counts" aria-label="Teamübersicht">
              <span><strong>{playersCount}</strong> Spielerinnen</span>
              <span><strong>{trainersCount}</strong> Trainer</span>
              <span><strong>{inactiveMembersCount}</strong> inaktiv</span>
            </div>
          </div>

          <form
            className="team-add-card"
            onSubmit={(event) => {
              event.preventDefault();
              addPlayer();
            }}
          >
            <div className="team-add-heading">
              <h3>Neues Teammitglied</h3>
              <span>Notiz und Hinweis sind freiwillig.</span>
            </div>
            <div className="team-form-grid">
              <label className="labeled-field">
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Vor- und Nachname"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="labeled-field">
                <span>Rolle</span>
                <select value={newRole} onChange={(event) => setNewRole(event.target.value)} disabled={busy}>
                  <option value="Spieler">Spielerin</option>
                  <option value="Trainer">Trainer</option>
                </select>
              </label>
              <label className="labeled-field">
                <span>Hinweis hinter dem Namen</span>
                <input
                  type="text"
                  placeholder="z. B. Torhüterin"
                  value={newMemberSince}
                  onChange={(event) => setNewMemberSince(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="labeled-field">
                <span>Interne Notiz</span>
                <input
                  type="text"
                  placeholder="Optional"
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <button type="submit" className="team-add-button" disabled={busy}>
              {busy ? 'Wird angelegt…' : 'Teammitglied anlegen'}
            </button>
          </form>

          <div className="team-toolbar">
            <label className="team-search">
              <span>Team durchsuchen</span>
              <input
                type="search"
                placeholder="Name, Hinweis oder Notiz"
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
              />
            </label>
            <div className="team-filter" aria-label="Team filtern">
              {[
                ['all', 'Alle'],
                ['players', 'Spielerinnen'],
                ['trainers', 'Trainer'],
                ['inactive', 'Inaktive'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={teamFilter === value ? 'active' : ''}
                  aria-pressed={teamFilter === value}
                  onClick={() => setTeamFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="team-groups">
            {teamGroups.map((group) => (
              <section key={group.key} className="team-group" aria-labelledby={`team-${group.key}`}>
                <div className="team-group-heading">
                  <h3 id={`team-${group.key}`}>{group.title}</h3>
                  <span>{group.members.length}</span>
                </div>
                <ul className="team-member-list">{group.members.map(renderTeamMember)}</ul>
              </section>
            ))}
            {teamGroups.length === 0 && (
              <div className="team-empty-state">
                <strong>Keine passenden Teammitglieder gefunden.</strong>
                <span>Ändere den Suchbegriff oder den ausgewählten Filter.</span>
              </div>
            )}
          </div>
        </section>
        {loggedInUser === 'Matthias' && (
          <section className="admin-section">
            <h2>App-Zugänge</h2>
            <p className="admin-section-intro">
              Hier verwaltest du die Anmeldedaten. Teammitglieder werden oben angelegt.
            </p>
            <div className="recovery-admin-card">
              <div className="recovery-admin-heading">
                <div>
                  <h3>Passwort-Wiederherstellung für Matthias</h3>
                  <p>
                    Damit kannst du dein Passwort mit einer Authenticator-App oder einem
                    Notfallcode neu setzen.
                  </p>
                </div>
                <span className={recoveryStatus.enabled ? 'recovery-badge active' : 'recovery-badge'}>
                  {recoveryStatus.enabled ? 'Aktiv' : 'Nicht eingerichtet'}
                </span>
              </div>

              {recoveryStatus.enabled && !recoverySetupData && (
                <div className="recovery-status-details">
                  <span>
                    Eingerichtet: {formatAuditTime(recoveryStatus.enabledAt)}
                  </span>
                  <span className={recoveryStatus.remainingRecoveryCodes <= 2 ? 'warning' : ''}>
                    {recoveryStatus.remainingRecoveryCodes} Notfallcodes übrig
                  </span>
                </div>
              )}

              {recoverySetupData ? (
                <div className="recovery-setup">
                  <section className="recovery-step">
                    <span className="recovery-step-number">1</span>
                    <div>
                      <h4>Authenticator-App verbinden</h4>
                      <p>
                        Scanne den QR-Code mit Google Authenticator, Microsoft Authenticator
                        oder einer anderen TOTP-App.
                      </p>
                      <div className="recovery-qr-area">
                        {recoveryQrCode && (
                          <img src={recoveryQrCode} alt="QR-Code für die Authenticator-App" />
                        )}
                        <div className="recovery-manual-key">
                          <span>Manueller Schlüssel</span>
                          <code>
                            {String(recoverySetupData.secret || '').match(/.{1,4}/g)?.join(' ') || ''}
                          </code>
                          <a href={recoverySetupData.otpAuthUrl}>
                            In Authenticator-App öffnen
                          </a>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="recovery-step">
                    <span className="recovery-step-number">2</span>
                    <div>
                      <h4>Notfallcodes sicher speichern</h4>
                      <p>
                        Jeder Code funktioniert genau einmal. Speichere sie getrennt vom Handy.
                        Sie werden später nicht noch einmal angezeigt.
                      </p>
                      <div className="recovery-code-grid">
                        {recoverySetupData.recoveryCodes.map((code) => (
                          <code key={code}>{code}</code>
                        ))}
                      </div>
                      <button type="button" className="btn-edit" onClick={copyRecoveryCodes}>
                        Alle Notfallcodes kopieren
                      </button>
                    </div>
                  </section>

                  {!recoverySetupConfirmed ? (
                    <section className="recovery-step">
                      <span className="recovery-step-number">3</span>
                      <div>
                        <h4>Einrichtung bestätigen</h4>
                        <p>Gib den aktuell angezeigten 6-stelligen Code aus der App ein.</p>
                        <div className="recovery-confirm-row">
                          <input
                            type="text"
                            value={recoverySetupCode}
                            onChange={(event) =>
                              setRecoverySetupCode(
                                event.target.value.replace(/\D/g, '').slice(0, 6)
                              )
                            }
                            onKeyDown={(event) =>
                              event.key === 'Enter' && confirmAuthenticatorSetup()
                            }
                            placeholder="123456"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            aria-label="6-stelliger Authenticator-Code"
                            disabled={busy}
                          />
                          <button
                            type="button"
                            className="btn-save-players"
                            onClick={confirmAuthenticatorSetup}
                            disabled={busy || recoverySetupCode.length !== 6}
                          >
                            {busy ? 'Prüft…' : 'Authenticator aktivieren'}
                          </button>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <div className="recovery-success">
                      <strong>Die Passwort-Wiederherstellung ist jetzt aktiv.</strong>
                      <span>
                        Prüfe noch einmal, ob du die acht Notfallcodes sicher gespeichert hast.
                      </span>
                      <button type="button" className="btn-save-players" onClick={finishAuthenticatorSetup}>
                        Einrichtung abschließen
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="recovery-start-row">
                  <label className="labeled-field">
                    <span>Aktuelles Passwort von Matthias</span>
                    <input
                      type="password"
                      value={recoverySetupPassword}
                      onChange={(event) => setRecoverySetupPassword(event.target.value)}
                      placeholder="Aktuelles Passwort"
                      autoComplete="current-password"
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-save-players"
                    onClick={startAuthenticatorSetup}
                    disabled={busy || !recoverySetupPassword}
                  >
                    {recoveryStatus.enabled ? 'Neu einrichten' : 'Jetzt einrichten'}
                  </button>
                </div>
              )}
              {recoveryAdminError && <p className="login-error">{recoveryAdminError}</p>}
            </div>
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
            <div className="login-history-block">
              <div className="login-history-heading">
                <div>
                  <h3>Login-Übersicht</h3>
                  <p>Gespeichert werden erfolgreiche Anmeldungen ab Version 6.3.</p>
                </div>
                <button
                  className="btn-edit"
                  onClick={() => runOnce(() => loadAdminData())}
                  disabled={busy}
                >
                  Aktualisieren
                </button>
              </div>
              {adminLoadError && <p className="login-error">{adminLoadError}</p>}
              <div className="login-overview-grid">
                {loginOverviewNames.map((name) => {
                  const events = loginHistory.filter((event) => event.username === name);
                  return (
                    <article key={name} className="login-overview-card">
                      <strong>{name}</strong>
                      <span>
                        Letzter Login: {events[0] ? formatAuditTime(events[0].loggedInAt) : 'Noch keiner'}
                      </span>
                      <small>
                        {events.length} Anmeldung{events.length === 1 ? '' : 'en'} im angezeigten Protokoll
                      </small>
                    </article>
                  );
                })}
              </div>
              <details className="login-history-details">
                <summary>Einzelne Anmeldungen anzeigen ({loginHistory.length})</summary>
                <div className="login-history-list">
                  {loginHistory.map((event) => (
                    <div key={event._id || `${event.username}-${event.loggedInAt}`}>
                      <strong>{event.username}</strong>
                      <span>{formatAuditTime(event.loggedInAt)}</span>
                    </div>
                  ))}
                  {loginHistory.length === 0 && <p>Noch keine Anmeldung protokolliert.</p>}
                </div>
              </details>
            </div>
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
            <div className="report-player-selection">
              <div className="report-player-selection-heading">
                <div>
                  <h3>Spielerinnen auswählen</h3>
                  <span>
                    {selectedReportPlayerNames.length} von {reportPlayers.length} ausgewählt
                  </span>
                </div>
                <div className="report-player-selection-actions">
                  <button
                    type="button"
                    onClick={() =>
                      changeReportPlayerSelection(reportPlayers.map((player) => player.name))
                    }
                    disabled={busy || selectedReportPlayerNames.length === reportPlayers.length}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    onClick={() => changeReportPlayerSelection([])}
                    disabled={busy || selectedReportPlayerNames.length === 0}
                  >
                    Keine
                  </button>
                </div>
              </div>
              <div className="report-player-options">
                {reportPlayers.map((player) => (
                  <label
                    key={player.name}
                    className={selectedReportPlayerSet.has(player.name) ? 'selected' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={selectedReportPlayerSet.has(player.name)}
                      onChange={() => toggleReportPlayer(player.name)}
                      disabled={busy}
                    />
                    <span>{player.name}</span>
                  </label>
                ))}
                {reportPlayers.length === 0 && (
                  <p className="no-trainings">Keine aktiven Spielerinnen vorhanden.</p>
                )}
              </div>
            </div>
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
    if (selectedReportPlayerNames.length === 0) {
      alert('Bitte mindestens eine Spielerin für die Auswertung auswählen.');
      setReportData(null);
      return;
    }
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
    const report = selectReportPlayers(trainersFirst, selectedReportPlayerNames)
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
