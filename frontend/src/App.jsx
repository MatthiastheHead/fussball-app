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
  const min= String(dateObj.getMinutes()).padStart(2,'0');
  return `${d}.${m}.${y} ${h}:${min}`;
};

const parseGermanDate = (str) => {
  const part = str.includes(',') ? str.split(', ')[1] : str;
  if (!part) return new Date(0);
  const [d,m,y] = part.split('.');
  return new Date(+y, +m-1, +d);
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
  const [expandedReportRow, setExpandedReportRow] = useState(null);

  const version = '2.0';

  // === LOAD INITIAL DATA ===
  useEffect(() => {
    fetch(API + '/users').then(r=>r.json()).then(setUsers).catch(()=>setUsers([]));
    fetch(API + '/players')
      .then(r=>r.json())
      .then(data=>setPlayers(data.map(p=>({
        ...p,
        note: p.note || '',
        memberSince: p.memberSince || ''
      }))))
      .catch(()=>setPlayers([]));
    fetch(API + '/trainings')
      .then(r=>r.json())
      .then(data=>setTrainings(data.map(t=>({
        ...t,
        note: t.note || '',
        participants: t.participants || {},
        trainerStatus: t.trainerStatus || {}
      }))))
      .catch(()=>setTrainings([]));
  }, []);

  // === AUTH ===
  const handleLogin = () => {
    const user = users.find(u=>u.name===loginName.trim()&&u.password===loginPass);
    if (user) {
      setLoggedInUser(user.name);
      setLoginError('');
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

  // === ADMIN ===
  const addNewUser = () => {
    if (!newUserName.trim() || !newUserPass) return alert('Nutzer & Passwort angeben.');
    const updated = [...users, { name:newUserName.trim(), password:newUserPass }];
    fetch(API+'/users',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setUsers).then(()=>alert('Nutzer angelegt')).catch(()=>alert('Fehler'));
    setNewUserName(''); setNewUserPass('');
  };

  // === TEAM / PLAYERS CRUD ===
  const startEditPlayer = p => {
    setEditPlayer(p.name);
    setPlayerDraft({ ...p });
  };
  const saveEditPlayer = () => {
    const idx = players.findIndex(x=>x.name===editPlayer);
    if (idx<0) return;
    const updated=[...players];
    updated[idx] = playerDraft;
    fetch(API+'/players',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Spieler gespeichert')).catch(()=>alert('Fehler'));
    setEditPlayer(null);
  };
  const cancelEditPlayer = ()=>setEditPlayer(null);

  const addPlayer = () => {
    if (!newName.trim()) return alert('Name angeben.');
    const obj = {
      name: newName.trim(),
      isTrainer: newRole==='Trainer',
      note: newNote,
      memberSince: newMemberSince
    };
    const updated = [...players, obj];
    fetch(API+'/players',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Spieler hinzugefügt')).catch(()=>alert('Fehler'));
    setNewName(''); setNewRole('Spieler'); setNewNote(''); setNewMemberSince('');
  };

  const handlePlayerNoteBlur = (p, val) => {
    const idx = players.findIndex(x=>x.name===p.name);
    if (idx<0) return;
    const updated=[...players];
    updated[idx].note=val;
    fetch(API+'/players',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Notiz gespeichert')).catch(()=>alert('Fehler'));
  };

  const changeRole = (p, role) => {
    const idx=players.findIndex(x=>x.name===p.name);
    if(idx<0) return;
    const updated=[...players];
    updated[idx].isTrainer = role==='Trainer';
    fetch(API+'/players',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Rolle geändert')).catch(()=>alert('Fehler'));
  };

  const deletePlayer = (p) => {
    if (!window.confirm(`"${p.name}" löschen?`)) return;
    const updated = players.filter(x=>x.name!==p.name);
    fetch(API+'/players',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json()).then(setPlayers).then(()=>alert('Gelöscht')).catch(()=>alert('Fehler'));
  };

  // === TRAININGS CRUD ===
  const addTraining = () => {
    if(!loggedInUser) return alert('Bitte einloggen.');
    const now=new Date();
    const d=String(now.getDate()).padStart(2,'0');
    const m=String(now.getMonth()+1).padStart(2,'0');
    const y=now.getFullYear();
    const wd=['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const date=`${wd}, ${d}.${m}.${y}`;
    const obj={ date, participants:{}, trainerStatus:{}, note:'', createdBy:loggedInUser, lastEdited:{by:loggedInUser,at:formatDateTime(now)} };
    const updated=[...trainings,obj];
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note: t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert('Training hinzugefügt')).catch(()=>alert('Fehler'));
  };

  const deleteTraining = t => {
    if(!window.confirm('Training löschen?')) return;
    const updated = trainings.filter(x=>!(x.date===t.date&&x.createdBy===t.createdBy));
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note:t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert('Training gelöscht')).catch(()=>alert('Fehler'));
  };

  const saveTrainingNote = (t,val) => {
    const idx = trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0) return;
    const updated=[...trainings];
    updated[idx].note=val;
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note:t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert('Notiz gespeichert')).catch(()=>alert('Fehler'));
  };

  const saveEditedDate = (t,val) => {
    if(!val) return;
    const [y,m,d]=val.split('-');
    const dateObj=new Date(y,m-1,d);
    const wd=['So','Mo','Di','Mi','Do','Fr','Sa'][dateObj.getDay()];
    const date=`${wd}, ${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
    const now=new Date();
    const idx = trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0) return;
    const updated=[...trainings];
    updated[idx].date=date;
    updated[idx].isEditing=false;
    updated[idx].lastEdited={by:loggedInUser,at:formatDateTime(now)};
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note:t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert('Datum aktualisiert')).catch(()=>alert('Fehler'));
    setEditDateIdx(null);
  };

  const updateParticipation = (t,name,icon) => {
    const now=new Date(),ts=formatDateTime(now);
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0) return;
    const updated=[...trainings];
    updated[idx].participants={...updated[idx].participants,[name]:icon};
    updated[idx].lastEdited={by:loggedInUser,at:ts};
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note:t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert(`Status ${name}→${iconToText(icon).trim()}`)).catch(()=>alert('Fehler'));
  };

  const updateTrainerStatus = (t,name,status) => {
    const now=new Date(),ts=formatDateTime(now);
    const idx=trainings.findIndex(x=>x.date===t.date&&x.createdBy===t.createdBy);
    if(idx<0) return;
    const updated=[...trainings];
    updated[idx].trainerStatus={...updated[idx].trainerStatus,[name]:status};
    updated[idx].lastEdited={by:loggedInUser,at:ts};
    fetch(API+'/trainings',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ reset:true, list:updated })
    })
      .then(r=>r.json())
      .then(data=>setTrainings(
        data.map(t=>({
          ...t,
          note:t.note||'',
          participants:t.participants||{},
          trainerStatus:t.trainerStatus||{}
        }))
      ))
      .then(()=>alert(`Trainer ${name}→${status}`)).catch(()=>alert('Fehler'));
  };

  const sortedPlayers=[...players].sort((a,b)=>a.name.localeCompare(b.name));
  const trainersFirst=[...sortedPlayers].sort((a,b)=>b.isTrainer-a.isTrainer);

  const trainingsToShow=sortTrainings(trainings.filter(t=>{
    let ok=true;
    if(filterDate&&t.date){
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
    if(!fromDate||!toDate) return alert('Bitte Datum wählen');
    const start=new Date(fromDate), end=new Date(toDate);
    if(end<start) return alert('Enddatum>Start');
    const inR=trainings.filter(t=>{const d=parseGermanDate(t.date);return d>=start&&d<=end;});
    if(!inR.length) return alert('Keine Trainings');
    const report=trainersFirst.filter(p=>!p.isTrainer).map(p=>{
      let cnt=0;
      const det=inR.map(t=>{
        const ic=(t.participants&&t.participants[p.name])||'—';
        if(ic==='✅')cnt++;
        return {date:t.date,statusText:iconToText(ic)};
      });
      return {name:p.name,percent:Math.round(cnt/inR.length*100),details:det,note:p.note||''};
    });
    setReportData({totalTrainings:inR.length,data:report});
    alert('Auswertung fertig');
  };

  // === RENDER ===
  if(!loggedInUser){
    return (
      <div className="login-screen modern-dark-blue">
        <div className="login-icon-row">
          <span className="login-icon" role="img" aria-label="fussball">⚽</span>
        </div>
        <h1 className="login-headline">Fußball-App</h1>
        <div className="login-version">Version {version}</div>
        <input placeholder="Benutzername" value={loginName} onChange={e=>setLoginName(e.target.value)}/>
        <input type="password" placeholder="Passwort" value={loginPass} onChange={e=>setLoginPass(e.target.value)}/>
        <button onClick={handleLogin}>Einloggen</button>
        {loginError&&<p className="login-error">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="App">
      <header><h1>⚽ Fußball-App <span className="blue-version">{version}</span></h1></header>

      <div className="controls mobile-controls">
        <button className="main-func-btn" onClick={addTraining}>➕ Training</button>
        <button className="main-func-btn" onClick={()=>setShowTeam(!showTeam)}>👥 Team</button>
        <button className="main-func-btn" onClick={()=>setShowTrainings(!showTrainings)}>{showTrainings?'Trainings ⌄':'Trainings ⌃'}</button>
        <button className="main-func-btn" onClick={()=>setShowReport(!showReport)}>{showReport?'Auswertung ⌄':'Auswertung ⌃'}</button>
        {loggedInUser==='Matthias' && <button className="main-func-btn" onClick={()=>setShowAdmin(!showAdmin)}>👤 Admin</button>}
      </div>

      {/* ... Admin, Team, Trainings, Report, Footer wie oben ... */}

    </div>
  );
}

function sortTrainings(arr){
  return arr.slice().sort((a,b)=>{
    const ad=(a.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    const bd=(b.date||'').split(', ')[1]?.split('.').reverse().join('')||'';
    return bd.localeCompare(ad);
  });
}
