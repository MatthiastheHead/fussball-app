import test from 'node:test';
import assert from 'node:assert/strict';
import { slots, score, suggest, movePlayer } from './squadUtils.js';
test('8+1 enthält acht Feldplätze und genau ein Tor, alle innerhalb des Feldes', () => {
 const result = slots('3-3-2'); assert.equal(result.length, 9); assert.equal(result.filter(s => s.role === 'keeper').length, 1);
 assert.equal(new Set(result.map(s => `${s.x}:${s.y}`)).size, 9);
 assert.ok(result.every(s => s.x >= 5 && s.x <= 95 && s.y >= 5 && s.y <= 95));
});
test('Vorschlag berücksichtigt Leistung und Positionen, lässt Gäste und fehlende Daten manuell', () => {
 const people = ['TW','IV','ST','IV','ST','IV','TW'].map((position, i) => ({ id: String(i), name: String(i), mainPosition: position }));
 people[4].guest = true; people[5].inactive = true;
 const stats = people.slice(0,6).map(p => ({ id:p.id, total:4, attendance:1, average:p.id === '1' ? 1 : 3 }));
 const result = suggest(people,stats,'1-1',1);
 assert.deepEqual(result.map(p => [p.personId,p.role]), [['0','keeper'],['3','field'],['2','field'],['1','bench']]);
 assert.equal(new Set(result.map(p => p.personId)).size,result.length);
 assert.deepEqual(suggest(people,[],'1-1',2),[]);
});
test('Fehlende Sterne bleiben neutral, null Sterne zählen; Verschieben verändert nur die Auswahl', () => {
 assert.equal(score({total:4,attendance:.75,average:null}),75);
 assert.equal(score({total:4,attendance:1,average:0}),60);
 assert.equal(score({total:0,attendance:null,average:null}),null);
 const rows=[{personId:'a',x:50,y:50},{personId:'b',x:20,y:30}];
 const moved=movePlayer(rows,'a',-5,105); assert.deepEqual(moved[0],{personId:'a',x:5,y:95}); assert.deepEqual(moved[1],rows[1]); assert.equal(rows[0].x,50);
});

test('Standardformationen passen zum Spielmodus; kleinere Kader verwerfen keine Spielerinnen', async () => {
 const { FORMATIONS, reconfigure } = await import('./squadUtils.js');
 for (const [count, formations] of Object.entries(FORMATIONS)) for (const f of formations) assert.equal(slots(f).length, Number(count) + 1);
 const lineup = slots('3-3-2').map((s,i)=>({...s,personId:String(i)}));
 assert.throws(()=>reconfigure(lineup,{fieldPlayers:6,formation:'2-3-1',benchSize:2}), /zuerst/);
 const changed=reconfigure(lineup,{fieldPlayers:8,formation:'2-4-2',benchSize:2});
 assert.deepEqual(changed.map(p=>p.personId),lineup.map(p=>p.personId)); assert.equal(changed[1].x,100/3);
});
test('Kapitänin und Vizekapitäninnen rücken nur aus dem gewählten Kader nach', async () => {
 const { leadership } = await import('./squadUtils.js');
 assert.deepEqual(leadership([{personId:'v1'},{personId:'v2'}],'c',['v1','v2']),{captainId:'v1',viceCaptainIds:['v2']});
 assert.deepEqual(leadership([{personId:'c'},{personId:'v2'}],'c',['v1','v2']),{captainId:'c',viceCaptainIds:['v2']});
});


test('Gastspielerinnen werden im Vorschlag berücksichtigt', () => {
  const people = [
    { id: 'p:1', name: 'Stamm', mainPosition: 'IV', positions: [], guest: false, inactive: false },
    { id: 'p:2', name: 'Gast', mainPosition: 'ST', positions: [], guest: true, inactive: false },
    { id: 'p:3', name: 'Tor', mainPosition: 'TW', positions: [], guest: false, inactive: false },
  ];
  const stats = [{ id: 'p:1', total: 4, attendance: 1, average: 3 }, { id: 'p:3', total: 4, attendance: 1, average: 3 }];
  const result = suggest(people, stats, '1-1', 1);
  const guest = result.find(row => row.personId === 'p:2');
  assert.ok(guest);
  assert.equal(guest.guest, true);
});
