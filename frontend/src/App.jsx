import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

const iconToText = (icon) => {
  switch (icon) {
    case '✅': return ' TEILNEHMEND';
    case '❌': return ' ABGEMELDET';
    case '⏳': return ' KEINE RÜCKMELDUNG';
    default:   return ' ZUGESAGT ABER NICHT ERSCHIENEN';
  }
};

const formatDateTime = (dateObj) => {
  const d  = String(dateObj.getDate()).padStart(2,'0');
  const m  = String(dateObj.getMonth()+1).padStart(2,'0');
  const y  = dateObj.getFullYear();
  const h  = String(dateObj.getHours()).padStart(2,'0');
  const mm = String(dateObj.getMinutes()).padStart(2,'0');
  return `${d}.${m}.${y} ${h}:${mm}`;
};

export default function App() {
  // === STATES ===
  const [loggedInUser, setLoggedInUser]   = useState(null);
  const [loginName,     setLoginName]     = useState('');
  const [loginPass,     setLoginPass]     = useState('');
  const [loginError,    setLoginError]    = useState('');

  const [users,         setUsers]         = useState([]);
  const [newUserName,   setNewUserName]   = useState('');
  const [newUserPass,   setNewUserPass]   = useState('');
  const [showAdmin,     setShowAdmin]     = useState(false);

  const [players,       setPlayers]       = useState([]);
  const [showTeam,      setShowTeam]      = useState(false);
  const [editPlayer,    setEditPlayer]    = useState(null);
  const [playerDraft,   setPlayerDraft]   = useState({ name:'', isTrainer:false, note:'', memberSince:'' });
  const [newName,       setNewName]       = useState('');
  const [newRole,       setNewRole]       = useState('Spieler');
  const [newNote,       setNewNote]       = useState('');
  const [newMemberSince,setNewMemberSince]= useState('');

  const [trainings,     setTrainings]     = useState([]);
  const [showTrainings, setShowTrainings] = useState(false);
  const [expandedTraining, setExpandedTraining] = useState(null);
  const [editDateIdx,   setEditDateIdx]   = useState(null);
  const [editDateValue, setEditDateValue] = useState('');

  const [filterDate,    setFilterDate]    = useState('');
  const [searchText,    setSearchText]    = useState('');

  const [showReport,    setShowReport]    = useState(false);
  const [fromDate,      setFromDate]      = useState('');
  const [toDate,        setToDate]        = useState('');
  const [reportData,    setReportData]    = useState(null);

  const version = '2.0';

  // === LOAD INITIAL DATA ===
  useEffect(() => {
    // users
    fetch(API + '/users')
      .then(r => r.json()).then(setUsers)
      .catch(() => setUsers([]));

    // players
    fetch(API + '/players')
      .then(r => r.json())
      .then(data => setPlayers(data.map(p => ({
        ...p,
        note: p.note || '',
        memberSince: p.memberSince || ''
      }))))
      .catch(() => setPlayers([]));

    // trainings
    fetch(API + '/trainings')
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .catch(() => setTrainings([]));
  }, []);

  // === AUTH ===
  const handleLogin = () => {
    const user = users.find(u =>
      u.name === loginName.trim() &&
      u.password === loginPass
    );
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
    setShowTrainings(false);
    setShowReport(false);
    setShowAdmin(false);
  };

  // === ADMIN ===
  const addNewUser = () => {
    if (!newUserName.trim() || !newUserPass) {
      alert('Bitte Nutzername & Passwort eingeben');
      return;
    }
    const updated = [...users, { name: newUserName.trim(), password: newUserPass }];
    fetch(API + '/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setUsers)
      .then(() => alert('Nutzer angelegt'))
      .catch(() => alert('Fehler'));
    setNewUserName(''); setNewUserPass('');
  };
  const updateUserPassword = (i, pw) => {
    const updated = [...users];
    updated[i].password = pw;
    fetch(API + '/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setUsers)
      .then(() => alert('Passwort geändert'))
      .catch(() => alert('Fehler'));
  };
  const deleteUser = i => {
    if (!window.confirm(`"${users[i].name}" wirklich löschen?`)) return;
    const updated = users.filter((_, idx) => idx !== i);
    fetch(API + '/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setUsers)
      .then(() => alert('Nutzer gelöscht'))
      .catch(() => alert('Fehler'));
  };

  // === TEAM ===
  const startEditPlayer = p => {
    setEditPlayer(p.name);
    setPlayerDraft({ ...p });
  };
  const saveEditPlayer = () => {
    const idx = players.findIndex(x => x.name === editPlayer);
    if (idx < 0) return;
    const updated = [...players];
    updated[idx] = playerDraft;
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Spieler gespeichert'))
      .catch(() => alert('Fehler'));
    setEditPlayer(null);
  };
  const cancelEditPlayer = () => {
    setEditPlayer(null);
    setPlayerDraft({ name:'', isTrainer:false, note:'', memberSince:'' });
  };

  const addPlayer = () => {
    if (!newName.trim()) {
      alert('Name eingeben');
      return;
    }
    const obj = {
      name: newName.trim(),
      isTrainer: newRole === 'Trainer',
      note: newNote,
      memberSince: newMemberSince
    };
    const updated = [...players, obj];
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Spieler hinzugefügt'))
      .catch(() => alert('Fehler'));
    setNewName(''); setNewRole('Spieler'); setNewNote(''); setNewMemberSince('');
  };

  const handlePlayerNoteBlur = (p, val) => {
    const idx = players.findIndex(x => x.name === p.name);
    if (idx < 0) return;
    const updated = [...players];
    updated[idx].note = val;
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Notiz gespeichert'))
      .catch(() => alert('Fehler'));
  };

  const handleMemberSinceBlur = (p, val) => {
    const idx = players.findIndex(x => x.name === p.name);
    if (idx < 0) return;
    const updated = [...players];
    updated[idx].memberSince = val;
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Mitglied seit gespeichert'))
      .catch(() => alert('Fehler'));
  };

  const changeRole = (p, role) => {
    const idx = players.findIndex(x => x.name === p.name);
    if (idx < 0) return;
    const updated = [...players];
    updated[idx].isTrainer = (role === 'Trainer');
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Rolle geändert'))
      .catch(() => alert('Fehler'));
  };

  const deletePlayer = p => {
    if (!window.confirm(`"${p.name}" wirklich löschen?`)) return;
    const updated = players.filter(x => x.name !== p.name);
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json()).then(setPlayers)
      .then(() => alert('Spieler gelöscht'))
      .catch(() => alert('Fehler'));
  };

  // === TRAININGS ===
  const addTraining = () => {
    if (!loggedInUser) {
      alert('Bitte einloggen.');
      return;
    }
    const now = new Date();
    const d = String(now.getDate()).padStart(2,'0');
    const m = String(now.getMonth()+1).padStart(2,'0');
    const y = now.getFullYear();
    const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const date = `${wd}, ${d}.${m}.${y}`;
    const obj = {
      date,
      participants: {},
      trainerStatus: {},
      note: '',
      createdBy: loggedInUser,
      lastEdited: { by: loggedInUser, at: formatDateTime(now) }
    };
    const updated = [...trainings, obj];
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert('Training hinzugefügt'))
      .catch(() => alert('Fehler'));
  };

  const deleteTraining = t => {
    if (!window.confirm('Training wirklich löschen?')) return;
    const updated = trainings.filter(x => !(x.date===t.date&&x.createdBy===t.createdBy));
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert('Training gelöscht'))
      .catch(() => alert('Fehler'));
  };

  const saveTrainingNote = (t, val) => {
    const idx = trainings.findIndex(x => x.date===t.date&&x.createdBy===t.createdBy);
    if (idx < 0) return;
    const updated = [...trainings];
    updated[idx].note = val;
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert('Notiz gespeichert'))
      .catch(() => alert('Fehler'));
  };

  const saveEditedDate = (t, val) => {
    if (!val) return;
    const [y,m,d] = val.split('-');
    const dateObj = new Date(y, m-1, d);
    const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][dateObj.getDay()];
    const date = `${wd}, ${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
    const now = new Date();
    const idx = trainings.findIndex(x => x.date===t.date&&x.createdBy===t.createdBy);
    if (idx < 0) return;
    const updated = [...trainings];
    updated[idx].date = date;
    updated[idx].isEditing = false;
    updated[idx].lastEdited = { by: loggedInUser, at: formatDateTime(now) };
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert('Datum aktualisiert'))
      .catch(() => alert('Fehler'));
    setEditDateIdx(null);
  };

  const updateParticipation = (t, name, icon) => {
    const now = new Date(), ts = formatDateTime(now);
    const idx = trainings.findIndex(x => x.date===t.date&&x.createdBy===t.createdBy);
    if (idx < 0) return;
    const updated = [...trainings];
    updated[idx].participants = { ...updated[idx].participants, [name]: icon };
    updated[idx].lastEdited = { by: loggedInUser, at: ts };
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert(`Status ${name}→${iconToText(icon).trim()}`))
      .catch(() => alert('Fehler'));
  };

  const updateTrainerStatus = (t, name, status) => {
    const now = new Date(), ts = formatDateTime(now);
    const idx = trainings.findIndex(x => x.date===t.date&&x.createdBy===t.createdBy);
    if (idx < 0) return;
    const updated = [...trainings];
    updated[idx].trainerStatus = { ...updated[idx].trainerStatus, [name]: status };
    updated[idx].lastEdited = { by: loggedInUser, at: ts };
    fetch(API + '/trainings', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    })
      .then(r => r.json())
      .then(data => setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .then(() => alert(`Trainer ${name}→${status}`))
      .catch(() => alert('Fehler'));
  };

  // Sort & filter
  const sortedPlayers = [...players].sort((a,b)=>a.name.localeCompare(b.name));
  const trainersFirst = [...sortedPlayers].sort((a,b)=>b.isTrainer - a.isTrainer);

  const trainingsToShow = trainings.filter(t => {
    let ok = true;
    if (filterDate && t.date) {
      const dp = t.date.split(', ')[1];
      const [y,m,d] = filterDate.split('-');
      ok = dp === `${d}.${m}.${y}`;
    }
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      ok = ok && (
        (t.date||'').toLowerCase().includes(s) ||
        (t.note||'').toLowerCase().includes(s)
      );
    }
    return ok;
  }).sort((a,b) => {
    const ad = (a.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    const bd = (b.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    return bd.localeCompare(ad);
  });

  const computeReport = () => {
    if (!fromDate || !toDate) {
      alert('Bitte Datum auswählen');
      return;
    }
    const start = new Date(fromDate), end = new Date(toDate);
    if (end < start) {
      alert('Enddatum muss nach Startdatum liegen');
      return;
    }
    const inR = trainingsToShow.filter(t => {
      const d = parseGermanDate(t.date);
      return d >= start && d <= end;
    });
    if (!inR.length) {
      alert('Keine Trainings in diesem Zeitraum');
      return;
    }
    const report = trainersFirst.filter(p=>!p.isTrainer).map(p=>{
      let cnt=0;
      const details = inR.map(t=>{
        const ic = (t.participants&&t.participants[p.name])||'—';
        if(ic==='✅') cnt++;
        return { date:t.date, statusText:iconToText(ic) };
      });
      return {
        name: p.name,
        percent: Math.round(cnt/inR.length*100),
        details,
        note: p.note||''
      };
    });
    setReportData({ totalTrainings: inR.length, data: report });
    alert('Auswertung fertig');
  };

  // === RENDER LOGIN ===
  if (!loggedInUser) {
    return (
      <div className="login-screen modern-dark-blue">
        <div className="login-icon-row">
          <span className="login-icon" role="img" aria-label="fussball">⚽</span>
        </div>
        <h1 className="login-headline">Fußball-App</h1>
        <div className="login-version">Version {version}</div>
        <input
          type="text" placeholder="Benutzername"
          value={loginName} onChange={e=>setLoginName(e.target.value)}
        />
        <input
          type="password" placeholder="Passwort"
          value={loginPass} onChange={e=>setLoginPass(e.target.value)}
        /> 
        <button onClick={handleLogin}>Einloggen</button>
        {loginError && <p className="login-error">{loginError}</p>}
      </div>
    );
  }

  // === RENDER APP ===
  return (
    <div className="App">
      <header>
        <h1>⚽ Fußball-App <span className="blue-version">{version}</span></h1>
      </header>

      <div className="controls mobile-controls">
        <button className="main-func-btn" onClick={addTraining}>➕ Training</button>
        <button className="main-func-btn" onClick={()=>setShowTeam(!showTeam)}>👥 Team</button>
        <button className="main-func-btn" onClick={()=>setShowTrainings(!showTrainings)}>
          {showTrainings ? 'Trainings ⌄' : 'Trainings ⌃'}
        </button>
        <button className="main-func-btn" onClick={()=>setShowReport(!showReport)}>
          {showReport ? 'Auswertung ⌄' : 'Auswertung ⌃'}
        </button>
        {loggedInUser==='Matthias' && (
          <button className="main-func-btn" onClick={()=>setShowAdmin(!showAdmin)}>👤 Admin</button>
        )}
      </div>

      {/* Admin */}
      {showAdmin && (
        <section className="admin-section">
          <h2>Adminbereich</h2>
          <div className="add-player-form">
            <input placeholder="Neuer Nutzer" value={newUserName} onChange={e=>setNewUserName(e.target.value)} />
            <input placeholder="Passwort" value={newUserPass} onChange={e=>setNewUserPass(e.target.value)} />
            <button onClick={addNewUser}>➕</button>
          </div>
          <ul>
            {users.map((u,i)=>(
              <li key={u.name}>
                {u.name}
                <input value={u.password} onChange={e=>updateUserPassword(i,e.target.value)} />
                <button onClick={()=>deleteUser(i)}>❌</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Team */}
      {showTeam && (
        <section className="player-management">
          <h2>Teamverwaltung</h2>
          <div className="add-player-form">
            <input placeholder="Name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <select value={newRole} onChange={e=>setNewRole(e.target.value)}>
              <option>Spieler</option><option>Trainer</option>
            </select>
            <input placeholder="Notiz" value={newNote} onChange={e=>setNewNote(e.target.value)} />
            <input placeholder="Mitglied seit" value={newMemberSince} onChange={e=>setNewMemberSince(e.target.value)} />
            <button onClick={addPlayer}>➕</button>
          </div>
          <ul>
            {trainersFirst.map(p=>(
              editPlayer===p.name
              ? <li key={p.name}>
                  <input value={playerDraft.name} onChange={e=>setPlayerDraft(d=>({...d,name:e.target.value}))} />
                  <input value={playerDraft.note} onChange={e=>setPlayerDraft(d=>({...d,note:e.target.value}))} onBlur={e=>handlePlayerNoteBlur(playerDraft,e.target.value)} placeholder="Notiz"/>
                  <input value={playerDraft.memberSince} onChange={e=>setPlayerDraft(d=>({...d,memberSince:e.target.value}))} onBlur={e=>handleMemberSinceBlur(playerDraft,e.target.value)} placeholder="Mitglied seit"/>
                  <select value={playerDraft.isTrainer?'Trainer':'Spieler'} onChange={e=>setPlayerDraft(d=>({...d,isTrainer:e.target.value==='Trainer'}))}/>
                  <button onClick={saveEditPlayer}>💾</button>
                  <button onClick={cancelEditPlayer}>✖️</button>
                </li>
              : <li key={p.name}>
                  <span className={p.isTrainer?'role-trainer':'role-player'}>{p.name}</span>
                  <span className="note">[{p.note}]</span>
                  <span className="memberSince">({p.memberSince||'-'})</span>
                  <select value={p.isTrainer?'Trainer':'Spieler'} onChange={e=>changeRole(p,e.target.value)}/>
                  <button onClick={()=>startEditPlayer(p)}>✏️</button>
                  <button onClick={()=>deletePlayer(p)}>❌</button>
                </li>
            ))}
          </ul>
        </section>
      )}

      {/* Trainings */}
      {showTrainings && (
        <section className="trainings-list">
          <div className="training-filter">
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} />
            <input placeholder="Suche" value={searchText} onChange={e=>setSearchText(e.target.value)} />
            <button onClick={()=>{setFilterDate('');setSearchText('');}}>✖️</button>
          </div>
          {trainingsToShow.map((t,i)=>(
            <div key={t.date+i} className="training">
              <h3 onClick={()=>setExpandedTraining(expandedTraining===i?null:i)}>
                📅 {t.date} {expandedTraining===i?'🔽':'▶️'}
              </h3>
              {expandedTraining===i && <>
                <div>Ersteller: <strong>{t.createdBy}</strong></div>
                {t.lastEdited && <div>Zuletzt: {t.lastEdited.at}</div>}

                {editDateIdx===i
                  ? <div>
                      <input type="date" value={editDateValue} onChange={e=>setEditDateValue(e.target.value)} />
                      <button onClick={()=>saveEditedDate(t,editDateValue)}>💾</button>
                      <button onClick={()=>setEditDateIdx(null)}>✖️</button>
                    </div>
                  : <button onClick={()=>{const parts=t.date.split(', ')[1].split('.');setEditDateValue(`${parts[2]}-${parts[1]}-${parts[0]}`);setEditDateIdx(i);}}>✏️ Datum</button>
                }

                <textarea rows={2} placeholder="Notiz"
                  value={t.note}
                  onChange={e=>{const u=[...trainings];u[i].note=e.target.value;setTrainings(u);}}
                  onBlur={e=>saveTrainingNote(t,e.target.value)}
                />

                {players.map(p=>(
                  p.isTrainer
                  ? <div key={p.name+'t'} className="participant">
                      {p.name}:
                      <select value={t.trainerStatus[p.name]||'Abgemeldet'} onChange={e=>updateTrainerStatus(t,p.name,e.target.value)}>
                        <option>Zugesagt</option><option>Abgemeldet</option>
                      </select>
                    </div>
                  : <div key={p.name} className="participant">
                      {p.name}{iconToText(t.participants[p.name]||'—')}
                      {['✅','❌','⏳','—'].map(ic=>(
                        <button key={ic} onClick={()=>updateParticipation(t,p.name,ic)}>{ic}</button>
                      ))}
                    </div>
                ))}

                <button onClick={addTraining}>➕</button>
                <button onClick={()=>deleteTraining(t)}>🗑️</button>
              </>}
            </div>
          ))}
          {trainingsToShow.length===0 && <p>Keine Trainings</p>}
        </section>
      )}

      {/* Auswertung */}
      {showReport && (
        <section className="report-section">
          <h2>Auswertung</h2>
          <div className="report-form">
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} />
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} />
            <button onClick={computeReport}>▶️</button>
          </div>
          {reportData && (
            <table>
              <thead><tr><th>Spieler</th><th>Notiz</th><th>%</th></tr></thead>
              <tbody>
                {reportData.data.map(r=>(
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.note}</td>
                    <td>{r.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <footer>
        <p>Ersteller: <strong>Matthias Kopf</strong> | <a href="mailto:matthias@head-mail.com">matthias@head-mail.com</a></p>
        <button onClick={handleLogout}>Logout</button>
      </footer>
    </div>
  );
}

// Hilfsfunktion
function sortTrainings(arr){
  return arr.slice().sort((a,b)=>{
    const ad=(a.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    const bd=(b.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    return bd.localeCompare(ad);
  });
}
