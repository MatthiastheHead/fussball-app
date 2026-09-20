import React, { useEffect, useState } from 'react';
import SquadModuleBrand from './SquadModuleBrand.jsx';
import { isOverdue, visibleTasks } from './taskUtils.js';

const empty = () => ({ title: '', description: '', dueDate: '', assignedTo: '' });
const displayDate = value => value ? value.split('-').reverse().join('.') : 'Ohne Termin';
export default function TasksPanel({ request, username, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mine, setMine] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  async function json(path, method, body) {
    const response = await request(path, method ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Aufgaben konnten nicht geladen werden.');
    return data;
  }
  async function load() {
    setLoading(true); setError('');
    try { const [rows, people] = await Promise.all([json('tasks'), json('tasks/assignees')]); setTasks(rows); setUsers(people); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function run(action) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const update = task => setTasks(rows => rows.some(row => row._id === task._id) ? rows.map(row => row._id === task._id ? task : row) : [...rows, task]);
  const shown = visibleTasks(tasks, mine, username);
  return <main className="App tasks-panel">
    <header><SquadModuleBrand /><h1>📝 To-dos</h1><p>Gemeinsam organisieren, Zuständigkeiten festhalten und abhaken.</p></header>
    <div className="task-toolbar">
      <button type="button" className="btn-edit" disabled={busy} onClick={onBack}>Zum Startmenü</button>
      <button type="button" className="btn-save-players" disabled={busy || loading || !!draft} onClick={() => { setDraft(empty()); setEditing(null); }}>Neues To-do</button>
      <button type="button" className="btn-edit" disabled={busy || loading} onClick={load}>Aktualisieren</button>
    </div>
    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p className="login-notice" role="status">{notice}</p>}
    {draft && <form className="task-form" onSubmit={event => { event.preventDefault(); run(async () => {
      const saved = await json(editing ? `tasks/${editing}` : 'tasks', editing ? 'PATCH' : 'POST', draft);
      update(saved); setDraft(null); setEditing(null); setNotice('Aufgabe gespeichert.');
    }); }}>
      <h2>{editing ? 'To-do bearbeiten' : 'Neues To-do'}</h2>
      <label className="labeled-field"><span>Titel</span><input autoFocus required maxLength={160} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="labeled-field"><span>Beschreibung, optional</span><textarea rows={3} maxLength={4000} value={draft.description} disabled={busy} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="task-fields">
        <label className="labeled-field"><span>Zuständig</span><select value={draft.assignedTo} disabled={busy} onChange={event => setDraft({ ...draft, assignedTo: event.target.value })}>
          <option value="">Noch nicht zugewiesen</option>
          {draft.assignedTo && !users.some(user => user._id === draft.assignedTo) && <option value={draft.assignedTo}>Bisherige Person (nicht mehr verfügbar)</option>}
          {users.map(user => <option key={user._id} value={user._id}>{user.name}</option>)}
        </select></label>
        <label className="labeled-field"><span>Fällig am, optional</span><input type="date" value={draft.dueDate} disabled={busy} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      </div>
      <div className="task-toolbar"><button className="btn-save-players" disabled={busy || !draft.title.trim()}>Speichern</button><button type="button" className="btn-edit" disabled={busy} onClick={() => { setDraft(null); setEditing(null); }}>Abbrechen</button></div>
    </form>}
    <div className="task-toolbar" aria-label="To-dos filtern">
      <button type="button" className="btn-edit" aria-pressed={!mine} onClick={() => setMine(false)}>Alle</button>
      <button type="button" className="btn-edit" aria-pressed={mine} onClick={() => setMine(true)}>Meine To-dos</button>
      <span>{shown.filter(task => !task.completed).length} offen, {shown.filter(task => task.completed).length} erledigt</span>
    </div>
    {loading ? <p role="status">To-dos werden geladen…</p> : !shown.length ? <p>{mine ? 'Dir sind noch keine To-dos zugewiesen.' : 'Noch keine To-dos. Lege euer erstes To-do an.'}</p> :
      <ul className="task-list">{shown.map(task => <li key={task._id} className={`task-card${isOverdue(task) ? ' task-overdue' : ''}${task.completed ? ' task-completed' : ''}`}>
        <div className="task-card-heading"><h2>{task.title}</h2><span>{task.completed ? 'Erledigt' : isOverdue(task) ? 'Überfällig' : 'Offen'}</span></div>
        {task.description && <p className="task-description">{task.description}</p>}
        <p>{task.assignedName || 'Noch nicht zugewiesen'} · {displayDate(task.dueDate)}</p>
        {task.completed && <p>Erledigt von {task.completedBy} am {new Date(task.completedAt).toLocaleString('de-DE')}</p>}
        <div className="task-toolbar"><label className="task-check"><input type="checkbox" checked={task.completed} disabled={busy || !!draft} onChange={event => { const completed = event.target.checked; run(async () => {
          update(await json(`tasks/${task._id}`, 'PATCH', { completed })); setNotice(completed ? 'Aufgabe erledigt.' : 'Aufgabe wieder geöffnet.');
        }); }} />{task.completed ? 'Erledigt' : 'Als erledigt markieren'}</label>
        <button type="button" className="btn-edit" disabled={busy || !!draft} onClick={() => { setEditing(task._id); setDraft({ title: task.title, description: task.description, dueDate: task.dueDate, assignedTo: task.assignedTo }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Bearbeiten</button>
        <button type="button" className="cash-delete-button" disabled={busy || !!draft} onClick={() => run(async () => {
          if (!window.confirm(`To-do „${task.title}“ wirklich löschen? Es wird für alle entfernt. Wiederherstellen ist nur mit einer früheren Sicherung möglich.`)) return;
          await json(`tasks/${task._id}`, 'DELETE', { confirm: true });
          setTasks(rows => rows.filter(row => row._id !== task._id));
          setNotice('To-do gelöscht.');
        })}>Löschen</button></div>
      </li>)}</ul>}
  </main>;
}
