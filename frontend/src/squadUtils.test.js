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
