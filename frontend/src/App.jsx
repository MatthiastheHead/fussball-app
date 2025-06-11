// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import './App.css';

const API = 'https://fussball-api.onrender.com';

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

const parseGermanDate = (str) => {
  const datePart = str && str.includes(',') ? str.split(', ')[1] : str;
  if (!datePart) return new Date(0);
  const [d, m, y] = datePart.split('.');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

export default function App() {
  // === STATES ===
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Admin/Users
  const [users, setUsers] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  // Team / Players
  const [players, setPlayers] = useState([]);
  const [showTeam, setShowTeam] = useState(false);
  const [editPlayerName, setEditPlayerName] = useState(null);
  const [playerDraft, setPlayerDraft] = useState({ name: '', isTrainer: false, note: '', memberSince: '' });
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Spieler');
  const [newNote, setNewNote] = useState('');
  const [newMemberSince, setNewMemberSince] = useState('');

  // Trainings
  const [trainings, setTrainings] = useState([]);
  const [showTrainings, setShowTrainings] = useState(false);
  const [expandedTraining, setExpandedTraining] = useState(null);
  const [editDateIdx, setEditDateIdx] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [newTrainingNote, setNewTrainingNote] = useState('');

  // Filter & Search
  const [filterDate, setFilterDate] = useState('');
  const [searchText, setSearchText] = useState('');

  // Report
  const [showReport, setShowReport] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState(null);
  const [expandedReportRow, setExpandedReportRow] = useState(null);

  const version = '2.0';

  // === LOAD INITIAL DATA ===
  useEffect(() => {
    fetch(API + '/users').then(r => r.json()).then(setUsers).catch(() => setUsers([]));
    fetch(API + '/players').then(r => r.json()).then(data => {
      setPlayers(data.map(p => ({
        ...p,
        note: p.note || '',
        memberSince: p.memberSince || ''
      })));
    }).catch(() => setPlayers([]));
    fetch(API + '/trainings').then(r => r.json()).then(data => {
      setTrainings(data.map(t => ({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      })));
    }).catch(() => setTrainings([]));
  }, []);

  // === AUTH HANDLERS ===
  const handleLogin = () => {
    const user = users.find(u => u.name === loginName.trim() && u.password === loginPass);
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
  };

  // === ADMIN / USER CRUD ===
  const addNewUser = () => {
    if (!newUserName.trim() || !newUserPass) return alert('Bitte Nutzername & Passwort angeben.');
    const updated = [...users, { name: newUserName.trim(), password: newUserPass }];
    fetch(API + '/users', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ reset: true, list: updated })
    }).then(r => r.json()).then(setUsers).then(() => alert('Nutzer angelegt')).catch(() => alert('Fehler'));
    setNewUserName(''); setNewUserPass('');
  };

  // === TEAM / PLAYERS CRUD ===
  const startEditPlayer = p => {
    setEditPlayerName(p.name);
    setPlayerDraft({ name: p.name, isTrainer: p.isTrainer, note: p.note, memberSince: p.memberSince });
  };
  const saveEditPlayer = () => {
    const idx = players.findIndex(p => p.name === editPlayerName);
    if (idx < 0) return;
    const updated = [...players];
    updated[idx] = { ...playerDraft };
    fetch(API + '/players', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ reset: true, list: updated })
    }).then(r => r.json()).then(setPlayers).then(() => alert('Spieler gespeichert')).catch(() => alert('Fehler'));
    setEditPlayerName(null);
  };
  const cancelEditPlayer = () => setEditPlayerName(null);

  const addPlayer = () => {
    if (!newName.trim()) return alert('Name angeben.');
    const obj = { name: newName.trim(), isTrainer: newRole==='Trainer', note: newNote, memberSince: newMemberSince };
    const updated = [...players, obj];
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated })
    }).then(r=>r.json()).then(setPlayers).then(() => alert('Spieler hinzugefügt')).catch(()=>alert('Fehler'));
    setNewName(''); setNewRole('Spieler'); setNewNote(''); setNewMemberSince('');
  };

  const handlePlayerNoteBlur = (p, value) => {
    const idx = players.findIndex(x => x.name === p.name);
    if (idx<0) return;
    const updated = [...players];
    updated[idx].note = value;
    fetch(API + '/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ reset:true, list:updated})
    }).then(r=>r.json()).then(setPlayers).then(()=>alert('Notiz gespeichert')).catch(()=>alert('Fehler'));
  };

  const changeRole = (p, rol) => {
    const idx = players.findIndex(x=>x.name===p.name);
    if (idx<0) return;
    const updated=[...players]; updated[idx].isTrainer=(rol==='Trainer');
    fetch(API + '/players',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Rolle geändert')).catch(()=>alert('Fehler'));
  };

  const deletePlayer = p => {
    if(!window.confirm(`"${p.name}" löschen?`))return;
    const updated=players.filter(x=>x.name!==p.name);
    fetch(API+'/players',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Gelöscht')).catch(()=>alert('Fehler'));
  };

  // === TRAININGS CRUD ===
  const addTraining = () => {
    if (!loggedInUser) return alert('Bitte einloggen.');
    const now=new Date();
    const weekday=['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const formatted=`${weekday}, ${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    const obj={ date:formatted, participants:{}, trainerStatus:{}, note:newTrainingNote, createdBy:loggedInUser, lastEdited:{by:loggedInUser,at:formatDateTime(now)} };
    const updated=[...trainings,obj];
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert('Training angelegt')).catch(()=>alert('Fehler'));
    setNewTrainingNote('');
  };

  const deleteTraining = t => {
    if(!window.confirm('Training löschen?'))return;
    const updated=trainings.filter(x=>x.date!==t.date||x.createdBy!==t.createdBy);
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert('Training gelöscht')).catch(()=>alert('Fehler'));
  };

  const saveTrainingNote = (t, value) => {
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0)return;
    const updated=[...trainings]; updated[idx].note=value;
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert('Trainingsnotiz gespeichert')).catch(()=>alert('Fehler'));
  };

  const saveEditedDate = (t,newVal) => {
    if(!newVal)return;
    const [y,m,d]=newVal.split('-');
    const dateObj=new Date(y,m-1,d);
    const weekday=['So','Mo','Di','Mi','Do','Fr','Sa'][dateObj.getDay()];
    const formatted=`${weekday}, ${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0)return;
    const updated=[...trainings];
    updated[idx].date=formatted;
    updated[idx].isEditing=false;
    updated[idx].lastEdited={by:loggedInUser,at:formatDateTime(new Date())};
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert('Datum aktualisiert')).catch(()=>alert('Fehler'));
    setEditDateIdx(null);
  };

  const updateParticipation = (t,name,icon) => {
    const now=new Date();
    const ts=formatDateTime(now);
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0)return;
    const updated=[...trainings];
    updated[idx].participants={...updated[idx].participants,[name]:icon};
    updated[idx].lastEdited={by:loggedInUser,at:ts};
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert(`Status ${name} auf ${iconToText(icon).trim()}`)).catch(()=>alert('Fehler'));
  };

  const updateTrainerStatus = (t,name,status) => {
    const now=new Date();
    const ts=formatDateTime(now);
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0)return;
    const updated=[...trainings];
    updated[idx].trainerStatus={...updated[idx].trainerStatus,[name]:status};
    updated[idx].lastEdited={by:loggedInUser,at:ts};
    fetch(API+'/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true,list:updated})})
      .then(r=>r.json()).then(data=>setTrainings(data.map(t=>({...t,note:t.note||'',participants:t.participants||{},trainerStatus:t.trainerStatus||{}}))))
      .then(()=>alert(`Trainer ${name} auf ${status}`)).catch(()=>alert('Fehler'));
  };

  const sortedPlayers=[...players].sort((a,b)=>a.name.localeCompare(b.name));
  const trainersFirst=[...sortedPlayers].sort((a,b)=>b.isTrainer - a.isTrainer);

  const trainingsToShow=sortTrainings(trainings.filter(t=>{
    let ok=true;
    if(filterDate && t.date){
      const dp=t.date.split(', ')[1];
      const [y,m,d]=filterDate.split('-');
      ok=dp===`${d}.${m}.${y}`;
    }
    if(searchText.trim()){
      const s=searchText.trim().toLowerCase();
      ok=ok&&((t.date||'').toLowerCase().includes(s)||(t.note||'').toLowerCase().includes(s));
    }
    return ok;
  }));

  const computeReport=()=>{
    if(!fromDate||!toDate)return alert('Datum wählen');
    const start=new Date(fromDate), end=new Date(toDate);
    if(end<start)return alert('Ende>Start');
    const inRange=trainings.filter(t=>{
      const d=parseGermanDate(t.date);
      return d>=start&&d<=end;
    });
    if(inRange.length===0)return alert('Keine Trainings');
    const report=trainersFirst.filter(p=>!p.isTrainer).map(p=>{
      let cnt=0;
      const details=inRange.map(t=>{
        const ic=(t.participants&&t.participants[p.name])||'—';
        if(ic==='✅')cnt++;
        return {date:t.date,statusText:iconToText(ic)};
      });
      return { name:p.name, percent:Math.round(cnt/inRange.length*100), details, note:p.note||'' };
    });
    setReportData({totalTrainings:inRange.length,data:report});
    alert('Auswertung erstellt');
  };

  // RENDER
  if(!loggedInUser){
    return (
      <div className="login-screen">
        <h2>Bitte einloggen</h2>
        <input placeholder="Benutzername" value={loginName} onChange={e=>setLoginName(e.target.value)}/>
        <input type="password" placeholder="Passwort" value={loginPass} onChange={e=>setLoginPass(e.target.value)}/>
        <button onClick={handleLogin}>Einloggen</button>
        {loginError&&<p className="login-error">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="App">
      <header><h1>⚽ Fußball-App {version}</h1></header>
      <div className="controls mobile-controls">
        <button className="main-func-btn" onClick={addTraining}>➕ Training</button>
        <button className="main-func-btn" onClick={()=>setShowTeam(!showTeam)}>👥 Team</button>
        <button className="main-func-btn" onClick={()=>setShowTrainings(!showTrainings)}>{showTrainings?'Trainings verbergen':'Trainings anzeigen'}</button>
        <button className="main-func-btn" onClick={()=>setShowReport(!showReport)}>{showReport?'Auswertung verbergen':'Auswertung'}</button>
        {loggedInUser==='Matthias'&&<button className="main-func-btn" onClick={()=>setShowAdmin(!showAdmin)}>👤 Admin</button>}
      </div>

      {loggedInUser==='Matthias'&&showAdmin&&(
        <section className="admin-section">
          <h2>Admin</h2>
          <div className="add-player-form">
            <input placeholder="Neuer Nutzer" value={newUserName} onChange={e=>setNewUserName(e.target.value)}/>
            <input placeholder="Passwort" value={newUserPass} onChange={e=>setNewUserPass(e.target.value)}/>
            <button onClick={addNewUser}>➕</button>
          </div>
          <ul>{users.map((u,i)=>(
            <li key={u.name}>
              {u.name}
              <input value={u.password} onChange={e=>updateUserPassword(i,e.target.value)}/>
              <button onClick={()=>deleteUser(i)}>❌</button>
            </li>
          ))}</ul>
        </section>
      )}

      {showTeam&&(
        <section className="player-management">
          <h2>Teamverwaltung</h2>
          <div className="add-player-form">
            <input placeholder="Name" value={newName} onChange={e=>setNewName(e.target.value)}/>
            <select value={newRole} onChange={e=>setNewRole(e.target.value)}>
              <option>Spieler</option><option>Trainer</option>
            </select>
            <input placeholder="Notiz" value={newNote} onChange={e=>setNewNote(e.target.value)}/>
            <input placeholder="Mitglied seit (DD.MM.YYYY)" value={newMemberSince} onChange={e=>setNewMemberSince(e.target.value)}/>
            <button onClick={addPlayer}>➕</button>
          </div>
          <ul>{trainersFirst.map(p=>(
            editPlayerId===p.name
            ? <li key={p.name}>
                <input value={playerDraft.name} onChange={e=>setPlayerDraft(d=>({...d,name:e.target.value}))}/>
                <input value={playerDraft.note} onChange={e=>setPlayerDraft(d=>({...d,note:e.target.value}))} onBlur={e=>handlePlayerNoteBlur(playerDraft,e.target.value)}/>
                <input value={playerDraft.memberSince} onChange={e=>setPlayerDraft(d=>({...d,memberSince:e.target.value}))} onBlur={e=>handlePlayerNoteBlur(playerDraft,e.target.value)}/>
                <select value={playerDraft.isTrainer?'Trainer':'Spieler'} onChange={e=>setPlayerDraft(d=>({...d,isTrainer:e.target.value==='Trainer'}))}/>
                <button onClick={saveEditPlayer}>💾</button>
                <button onClick={cancelEditPlayer}>✖️</button>
              </li>
            : <li key={p.name}>
                <span className={p.isTrainer?'role-trainer':'role-player'}>{p.name}</span>
                <span className="note">[{p.note}]</span>
                <span className="memberSince">(seit {p.memberSince||'-'})</span>
                <select value={p.isTrainer?'Trainer':'Spieler'} onChange={e=>changeRole(p,e.target.value)}/>
                <button onClick={()=>startEditPlayer(p)}>✏️</button>
                <button onClick={()=>deletePlayer(p)}>❌</button>
              </li>
          ))}</ul>
        </section>
      )}

      {showTrainings&&(
        <section className="trainings-list">
          <div className="training-filter">
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/>
            <input placeholder="Suche" value={searchText} onChange={e=>setSearchText(e.target.value)}/>
            <button onClick={()=>{setFilterDate('');setSearchText('');}}>✖️</button>
          </div>
          {trainingsToShow.map((t,i)=>(
            <div key={t.date+i} className="training">
              <h3 onClick={()=>setExpandedTraining(expandedTraining===i?null:i)}>
                📅 {t.date} {expandedTraining===i?'🔽':'▶️'}
              </h3>
              {expandedTraining===i&&<>
                <div>Ersteller: {t.createdBy}</div>
                {t.isEditing
                  ? <div>
                      <input type="date" value={editDateValue} onChange={e=>setEditDateValue(e.target.value)}/>
                      <button onClick={()=>saveEditedDate(t,editDateValue)}>💾</button>
                      <button onClick={()=>setEditDateIdx(null)}>✖️</button>
                    </div>
                  : <button onClick={()=>{const parts=t.date.split(', ')[1].split('.');setEditDateValue(`${parts[2]}-${parts[1]}-${parts[0]}`);setEditDateIdx(i);}}>✏️ Datum</button>
                }
                <textarea
                  rows={2}
                  value={t.note}
                  onChange={e=>{const u=[...trainings];u[i].note=e.target.value;setTrainings(u);}}
                  onBlur={e=>saveTrainingNote(t,e.target.value)}
                />
                {/* Teilnehmer-Status & Buttons wie gehabt */}
                <button onClick={()=>addTraining()}>➕</button>
                <button onClick={()=>deleteTraining(t)}>🗑️</button>
              </>}
            </div>
          ))}
          {trainingsToShow.length===0&&<p>Keine Trainings</p>}
        </section>
      )}

      {showReport&&(
        <section className="report-section">
          <h2>Auswertung</h2>
          <div className="report-form">
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/>
            <button onClick={computeReport}>▶️</button>
          </div>
          {reportData&&(
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
        <p>Ersteller: <strong>Matthias Kopf</strong></p>
        <button onClick={handleLogout}>Logout</button>
      </footer>
    </div>
  );
}

// Hilfsfunktion sortTrainings
function sortTrainings(arr) {
  return arr.slice().sort((a, b) => {
    const ad = (a.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    const bd = (b.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    return bd.localeCompare(ad);
  });
}
