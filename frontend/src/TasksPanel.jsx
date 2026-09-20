import React, { useEffect, useState } from 'react';
import SquadModuleBrand from './SquadModuleBrand.jsx';
import { isOverdue, visibleTasks } from './taskUtils.js';

const emptyTask = () => ({ kind: 'task', title: '', description: '', dueDate: '', assignedTo: '' });
const emptyNote = () => ({ kind: 'note', title: '', description: '', dueDate: '', assignedTo: '' });
const displayDate = value => value ? value.split('-').reverse().join('.') : 'Ohne Termin';

export default function TasksPanel({ request, username, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mine, setMine] = useState(false);
  const [view, setView] = useState('tasks');
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);

  async function json(path, method, body) {
    const response = await request(path, method ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Einträge konnten nicht geladen werden.');
    return data;
  }

  async function load() {
    setLoading(true); setError('');
    try {
      const [rows, people] = await Promise.all([json('tasks'), json('tasks/assignees')]);
      setTasks(rows); setUsers(people);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function run(action) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const update = entry => setTasks(rows => rows.some(row => row._id === entry._id) ? rows.map(row => row._id === entry._id ? entry : row) : [...rows, entry]);
  const taskRows = visibleTasks(tasks.filter(row => row.kind !== 'note'), mine, username);
  const noteRows = tasks.filter(row => row.kind === 'note');
  const shown = view === 'notes' ? noteRows : taskRows;
  const isNote = draft?.kind === 'note';

  return <main className="App tasks-panel">
    <header><SquadModuleBrand /><h1>📝 To-dos & Notizen</h1><p>Aufgaben organisieren und wichtige Notizen schnell festhalten.</p></header>

    <div className="task-toolbar">
      <button type="button" className="btn-edit" disabled={busy} onClick={onBack}>Zum Startmenü</button>
      <button type="button" className="btn-edit" aria-pressed={view === 'tasks'} onClick={() => { setView('tasks'); setDraft(null); setEditing(null); }}>To-dos</button>
      <button type="button" className="btn-edit" aria-pressed={view === 'notes'} onClick={() => { setView('notes'); setDraft(null); setEditing(null); }}>Notizen</button>
      <button type="button" className="btn-save-players" disabled={busy || loading || !!draft} onClick={() => { setDraft(view === 'notes' ? emptyNote() : emptyTask()); setEditing(null); }}>
        {view === 'notes' ? 'Neue Notiz' : 'Neues To-do'}
      </button>
      <button type="button" className="btn-edit" disabled={busy || loading} onClick={load}>Aktualisieren</button>
    </div>

    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p className="login-notice" role="status">{notice}</p>}

    {draft && <form className="task-form" onSubmit={event => { event.preventDefault(); run(async () => {
      const saved = await json(editing ? `tasks/${editing}` : 'tasks', editing ? 'PATCH' : 'POST', draft);
      update(saved); setDraft(null); setEditing(null); setNotice(isNote ? 'Notiz gespeichert.' : 'Aufgabe gespeichert.');
    }); }}>
      <h2>{editing ? (isNote ? 'Notiz bearbeiten' : 'To-do bearbeiten') : (isNote ? 'Neue Notiz' : 'Neues To-do')}</h2>
      <label className="labeled-field"><span>{isNote ? 'Überschrift' : 'Titel'}</span><input autoFocus required maxLength={160} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="labeled-field"><span>{isNote ? 'Notiz' : 'Beschreibung, optional'}</span><textarea rows={isNote ? 5 : 3} maxLength={4000} value={draft.description} disabled={busy} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      {!isNote && <div className="task-fields">
        <label className="labeled-field"><span>Zuständig</span><select value={draft.assignedTo} disabled={busy} onChange={event => setDraft({ ...draft, assignedTo: event.target.value })}>
          <option value="">Noch nicht zugewiesen</option>
          {draft.assignedTo && !users.some(user => user._id === draft.assignedTo) && <option value={draft.assignedTo}>Bisherige Person (nicht mehr verfügbar)</option>}
          {users.map(user => <option key={user._id} value={user._id}>{user.name}</option>)}
        </select></label>
        <label className="labeled-field"><span>Fällig am, optional</span><input type="date" value={draft.dueDate} disabled={busy} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      </div>}
      <div className="task-toolbar"><button className="btn-save-players" disabled={busy || !draft.title.trim()}>Speichern</button><button type="button" className="btn-edit" disabled={busy} onClick={() => { setDraft(null); setEditing(null); }}>Abbrechen</button></div>
    </form>}

    {view === 'tasks' && <div className="task-toolbar" aria-label="To-dos filtern">
      <button type="button" className="btn-edit" aria-pressed={!mine} onClick={() => setMine(false)}>Alle</button>
      <button type="button" className="btn-edit" aria-pressed={mine} onClick={() => setMine(true)}>Meine To-dos</button>
      <span>{shown.filter(task => !task.completed).length} offen, {shown.filter(task => task.completed).length} erledigt</span>
    </div>}

    {view === 'notes' && <div className="task-toolbar"><span>{shown.filter(note => !note.completed).length} offen, {shown.filter(note => note.completed).length} abgehakt</span></div>}

    {loading ? <p role="status">Einträge werden geladen…</p> : !shown.length ? <p>{view === 'notes' ? 'Noch keine Notizen vorhanden.' : mine ? 'Dir sind noch keine To-dos zugewiesen.' : 'Noch keine To-dos. Lege euer erstes To-do an.'}</p> :
      <ul className="task-list">{shown.map(entry => {
        const note = entry.kind === 'note';
        return <li key={entry._id} className={`task-card${!note && isOverdue(entry) ? ' task-overdue' : ''}${entry.completed ? ' task-completed' : ''}`}>
          <div className="task-card-heading"><h2>{entry.title}</h2><span>{entry.completed ? (note ? 'Abgehakt' : 'Erledigt') : !note && isOverdue(entry) ? 'Überfällig' : 'Offen'}</span></div>
          {entry.description && <p className="task-description">{entry.description}</p>}
          {!note && <p>{entry.assignedName || 'Noch nicht zugewiesen'} · {displayDate(entry.dueDate)}</p>}
          {entry.completed && entry.completedBy && <p>{note ? 'Abgehakt' : 'Erledigt'} von {entry.completedBy} am {new Date(entry.completedAt).toLocaleString('de-DE')}</p>}
          <div className="task-toolbar">
            <label className="task-check"><input type="checkbox" checked={entry.completed} disabled={busy || !!draft} onChange={event => { const completed = event.target.checked; run(async () => {
              update(await json(`tasks/${entry._id}`, 'PATCH', { completed }));
              setNotice(completed ? (note ? 'Notiz abgehakt.' : 'Aufgabe erledigt.') : (note ? 'Notiz wieder geöffnet.' : 'Aufgabe wieder geöffnet.'));
            }); }} />{entry.completed ? (note ? 'Abgehakt' : 'Erledigt') : note ? 'Abhaken' : 'Als erledigt markieren'}</label>
            <button type="button" className="btn-edit" disabled={busy || !!draft} onClick={() => {
              setEditing(entry._id);
              setDraft({ kind: note ? 'note' : 'task', title: entry.title, description: entry.description, dueDate: entry.dueDate || '', assignedTo: entry.assignedTo || '' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>Bearbeiten</button>
            <button type="button" className="cash-delete-button" disabled={busy || !!draft} onClick={() => run(async () => {
              if (!window.confirm(`${note ? 'Notiz' : 'To-do'} „${entry.title}“ wirklich löschen?`)) return;
              await json(`tasks/${entry._id}`, 'DELETE', { confirm: true });
              setTasks(rows => rows.filter(row => row._id !== entry._id));
              setNotice(note ? 'Notiz gelöscht.' : 'To-do gelöscht.');
            })}>Löschen</button>
          </div>
        </li>;
      })}</ul>}
  </main>;
}
