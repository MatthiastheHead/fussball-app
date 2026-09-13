const test = require('node:test');
const assert = require('node:assert/strict');
const Squad = require('./models/Squad');
const { settings, profile, game } = require('./squadUtils');
const { mayAccess } = require('./accessUtils');
const id = '111111111111111111111111', guestId = '222222222222222222222222';
const candidates = [{id:`p:${id}`,name:'Mia',guest:false},{id:`g:${guestId}`,name:'Gast',guest:true}];
const input = {fieldPlayers:8,benchSize:4,formation:'3-3-2',opponent:'FC Test',location:'Platz',date:'2026-09-20',time:'10:00',from:'2026-08-01',to:'2026-09-19',lineup:[{personId:`p:${id}`,role:'keeper',position:'TW',x:50,y:89}],captainId:`p:${id}`};
test('Spielvalidierung verhindert doppelte Plätze, ungültige Termine und falsche Kadergrößen', () => {
 assert.equal(game(input,candidates).lineup[0].name,'Mia');
 for(const change of [{date:'2026-02-30'},{to:'2026-09-21'},{time:'25:00'},{formation:'4-4-2'},{captainId:'unbekannt'},{lineup:[...input.lineup,...input.lineup]},{lineup:[{...input.lineup[0],x:101}]}]) assert.throws(()=>game({...input,...change},candidates));
 assert.throws(()=>game(input,[{...candidates[0],inactive:true}]));
 assert.throws(()=>game({...input,lineup:[input.lineup[0],{...input.lineup[0],personId:candidates[1].id}]},candidates));
 assert.equal(game({...input,lineup:[{...input.lineup[0],personId:candidates[1].id}],captainId:''},candidates).lineup[0].guest,true);
 assert.throws(()=>settings({...input,benchSize:-1}));
});
test('Profile validieren Fuß, Positionen und Nummern ohne reguläre Spieler zu verändern', () => {
 const p={name:'Gast',foot:'links',mainPosition:'TW',positions:['IV','IV'],number:'12'};
 assert.deepEqual(profile(p).positions,['IV']);
 for(const change of [{foot:'egal'},{mainPosition:'XYZ'},{positions:['XYZ']},{number:'123'},{name:''}]) assert.throws(()=>profile({...p,...change}));
});
function harness() {
 const routes={}; const doc=new Squad({key:'squads',__v:0}); let saves=0;
 doc.save=async()=>{await doc.validate();doc.__v++;saves++;return doc;};
 const app={}; for(const method of ['get','post','put']) app[method]=(path,access,handler)=>{routes[`${method} ${path}`]={access,handler};};
 const admin=(req,res,next)=>!req.auth?res.status(401).json({}):!req.auth.isAdmin?res.status(403).json({}):next();
 require('./squadRoutes')({app,Squad:{findOne:async()=>doc},Player:{find:()=>({lean:async()=>[{_id:id,name:'Mia'}]}),exists:async()=>true},Training:{find:()=>({lean:async()=>[
 {date:'Do, 10.09.2026',participants:{Mia:'✅'},ratings:{Mia:3}},
 {date:'Fr, 11.09.2026',participants:{Mia:'✅'},ratings:{}},
 {date:'Sa, 12.09.2026',participants:{Mia:'❌'},ratings:{Mia:3}},
 {date:'So, 13.09.2026',participants:{Mia:'❌'},inactiveReasons:{Mia:'Pausiert'}},
 {date:'Mo, 14.09.2026',participants:{Andere:'✅'}},
 {date:'Do, 01.10.2026',participants:{Mia:'❌'}}
 ]})},requireAdmin:admin,requireAccess:key=>(req,res,next)=>!req.auth?res.status(401).json({}):!mayAccess({name:req.auth.username,...req.auth},key)?res.status(403).json({}):next()});
 function invoke(route,body={},auth={username:'Trainer',isAdmin:true}) {return new Promise(resolve=>{const res={code:200,set(){return this;},status(code){this.code=code;return this;},json(data){resolve({code:this.code,data});}};const req={body,auth,query:{from:'2026-09-01',to:'2026-09-20'}};routes[route].access(req,res,()=>routes[route].handler(req,res));});}
 return {invoke,doc,routes,get saves(){return saves;}};
}
test('Spielkader-Endpunkte benötigen Bereichsrechte, Einstellungen ausschließlich Adminrechte', async()=>{
 const h=harness();for(const route of Object.keys(h.routes)){assert.equal((await h.invoke(route,{},null)).code,401);assert.equal((await h.invoke(route,{}, {username:'Gesperrt',permissions:{squads:false}})).code,403);}
 for(const route of ['get /squads/admin','put /squads/settings','post /squads/profiles']) assert.equal((await h.invoke(route,{}, {username:'Trainer'})).code,403);
 assert.equal((await h.invoke('get /squads',{}, {username:'Trainer'})).code,200);
});
test('Speichern erhält Servernamen und Audit, veraltete Version überschreibt nichts',async()=>{
 const h=harness();const result=await h.invoke('post /squads/games',{...input,version:0,createdBy:'Falsch'});
 assert.equal(result.code,200);assert.equal(result.data.games[0].createdBy,'Trainer');assert.equal(result.data.games[0].lineup[0].name,'Mia');
 assert.equal((await h.invoke('post /squads/games',{...input,version:0})).code,409);assert.equal(h.saves,1);
});
test('Gastprofil anlegen, bearbeiten und deaktivieren bleibt getrennt von Mannschaft',async()=>{
 const h=harness();const p={name:'Gast',foot:'links',mainPosition:'ST',positions:[],version:0};
 const result=await h.invoke('post /squads/profiles',p);assert.equal(result.code,200);
 const guest=result.data.candidates.find(p=>p.guest);assert.ok(guest);assert.equal(result.data.candidates.filter(p=>!p.guest).length,1);
 const edited=await h.invoke('post /squads/profiles',{...p,id:String(guest._id),version:1,inactive:true});assert.equal(edited.code,200);assert.equal(edited.data.candidates.find(p=>p.guest).inactive,true);
});
test('Statistik zählt nur vorhandene Trainings, schließt Pausen aus und wertet fehlende Sterne neutral',async()=>{
 const result=await harness().invoke('get /squads/statistics');assert.equal(result.code,200);
 assert.deepEqual(result.data[0],{id:`p:${id}`,total:3,attended:2,rated:1,average:3,attendance:2/3});
});
