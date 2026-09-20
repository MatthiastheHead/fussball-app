import React, { useEffect, useState } from 'react';
import SquadModuleBrand from './SquadModuleBrand.jsx';

const emptyNote = () => ({ kind: 'note', title: '', description: '', items: [] });

export default function NotesPanel({ request, onBack }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);

  async function json(path, method, body) {
    const response = await request(path, method ? {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Notizen konnten nicht geladen werden.');
    return data;
  }

  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await json('tasks');
      setNotes(rows.filter(row => row.kind === 'note'));
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

  const update = note => setNotes(rows =>
    rows.some(row => row._id === note._id)
      ? rows.map(row => row._id === note._id ? note : row)
      : [note, ...rows]
  );

  const addItem = () => setDraft(current => ({ ...current, items: [...current.items, { text: '' }] }));
  const changeItem = (index, text) => setDraft(current => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item),
  }));
  const removeItem = index => setDraft(current => ({
    ...current,
    items: current.items.filter((_, itemIndex) => itemIndex !== index),
  }));

  return <main className="App tasks-panel notes-panel">
    <header>
      <SquadModuleBrand />
      <h1>🗒️ Notizen</h1>
      <p>Notizen festhalten und einzelne Stichpunkte direkt abhaken.</p>
    </header>

    <div className="task-toolbar">
      <button type="button" className="btn-edit" disabled={busy} onClick={onBack}>Zum Startmenü</button>
      <button type="button" className="btn-save-players" disabled={busy || loading || !!draft} onClick={() => { setDraft(emptyNote()); setEditing(null); }}>Neue Notiz</button>
      <button type="button" className="btn-edit" disabled={busy || loading} onClick={load}>Aktualisieren</button>
    </div>

    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p className="login-notice" role="status">{notice}</p>}

    {draft && <form className="task-form" onSubmit={event => { event.preventDefault(); run(async () => {
      const payload = { ...draft, items: draft.items.filter(item => item.text.trim()) };
      const saved = await json(editing ? `tasks/${editing}` : 'tasks', editing ? 'PATCH' : 'POST', payload);
      update(saved); setDraft(null); setEditing(null); setNotice('Notiz gespeichert.');
    }); }}>
      <h2>{editing ? 'Notiz bearbeiten' : 'Neue Notiz'}</h2>

      <label className="labeled-field">
        <span>Überschrift</span>
        <input autoFocus required maxLength={160} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
      </label>

      <label className="labeled-field">
        <span>Notiz, optional</span>
        <textarea rows={4} maxLength={4000} value={draft.description} disabled={busy} onChange={event => setDraft({ ...draft, description: event.target.value })} />
      </label>

      <div className="note-editor-items">
        <div className="note-editor-heading">
          <h3>Stichpunkte</h3>
          <button type="button" className="btn-edit" disabled={busy} onClick={addItem}>+ Stichpunkt</button>
        </div>

        {!draft.items.length && <p className="note-empty">Noch keine Stichpunkte. Du kannst die Notiz auch nur mit Text speichern.</p>}

        {draft.items.map((item, index) => <div className="note-item-editor" key={item._id || `new-${index}`}>
          <input
            maxLength={500}
            placeholder="Stichpunkt eingeben"
            value={item.text}
            disabled={busy}
            onChange={event => changeItem(index, event.target.value)}
          />
          <button type="button" className="cash-delete-button" disabled={busy} onClick={() => removeItem(index)}>Entfernen</button>
        </div>)}
      </div>

      <div className="task-toolbar">
        <button className="btn-save-players" disabled={busy || !draft.title.trim()}>Speichern</button>
        <button type="button" className="btn-edit" disabled={busy} onClick={() => { setDraft(null); setEditing(null); }}>Abbrechen</button>
      </div>
    </form>}

    {loading ? <p role="status">Notizen werden geladen…</p> : !notes.length ? <p>Noch keine Notizen vorhanden.</p> :
      <ul className="task-list">{notes.map(note => {
        const done = (note.items || []).filter(item => item.completed).length;
        const total = (note.items || []).length;
        return <li key={note._id} className="task-card note-card">
          <div className="task-card-heading">
            <h2>{note.title}</h2>
            {total > 0 && <span>{done}/{total} abgehakt</span>}
          </div>

          {note.description && <p className="task-description">{note.description}</p>}

          {total > 0 && <ul className="note-checklist">
            {note.items.map(item => <li key={item._id} className={item.completed ? 'note-item-completed' : ''}>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={busy || !!draft}
                  onChange={event => {
                    const completed = event.target.checked;
                    run(async () => {
                      const saved = await json(`tasks/${note._id}/items/${item._id}`, 'PATCH', { completed });
                      update(saved);
                      setNotice(completed ? 'Stichpunkt abgehakt.' : 'Stichpunkt wieder geöffnet.');
                    });
                  }}
                />
                <span>{item.text}</span>
              </label>
            </li>)}
          </ul>}

          <div className="task-toolbar">
            <button type="button" className="btn-edit" disabled={busy || !!draft} onClick={() => {
              setEditing(note._id);
              setDraft({
                kind: 'note',
                title: note.title,
                description: note.description || '',
                items: (note.items || []).map(item => ({ _id: item._id, text: item.text })),
              });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>Bearbeiten</button>

            <button type="button" className="cash-delete-button" disabled={busy || !!draft} onClick={() => run(async () => {
              if (!window.confirm(`Notiz „${note.title}“ wirklich löschen?`)) return;
              await json(`tasks/${note._id}`, 'DELETE', { confirm: true });
              setNotes(rows => rows.filter(row => row._id !== note._id));
              setNotice('Notiz gelöscht.');
            })}>Löschen</button>
          </div>
        </li>;
      })}</ul>}
  </main>;
}
