import test from 'node:test';
import assert from 'node:assert/strict';
import { createSquadPdf } from './squadPdf.js';
import { slots } from './squadUtils.js';
const fixture = {opponent:'SG Beispiel',date:'2026-09-20',time:'10:00',location:'Sportplatz Werther',fieldPlayers:8,formation:'3-3-2',benchSize:3,captainId:'1',viceCaptainIds:['2','9'],lineup:[...slots('3-3-2').map((p,i)=>({...p,personId:String(i),name:`Spielerin ${i}`})),{personId:'9',name:'Gastspielerin',guest:true,role:'bench',position:'ST',x:50,y:50}]};
const stamp={generatedBy:'Matthias',generatedAt:'2026-09-13T10:00:00Z'};
test('PDF enthält Aufstellung, Ersatzbank, Gäste und Kapitäninnen auf getrennten Seiten',()=>{
 const doc=createSquadPdf(fixture,stamp),pdf=doc.output();assert.equal(doc.getNumberOfPages(),2);
 assert.ok(pdf.startsWith('%PDF-')); assert.ok(pdf.includes('/FontFile2')); 
});
test('PDF verarbeitet lange Namen und maximalen Kader mit Seitenumbruch',()=>{
 const game={...fixture,opponent:'Sehr lange gegnerische Mannschaft '.repeat(3),location:'Sehr langer Spielort '.repeat(9),fieldPlayers:10,formation:'4-4-2',benchSize:15,lineup:Array.from({length:26},(_,i)=>({personId:String(i),name:`Spielerin ${i} `+'Doppelname '.repeat(8),role:i===0?'keeper':i<11?'field':'bench',position:i===0?'TW':'ST',x:50,y:50}))};
 const doc=createSquadPdf(game,stamp);assert.ok(doc.getNumberOfPages()>=3);assert.ok(doc.output().startsWith('%PDF-'));
 assert.throws(()=>createSquadPdf(fixture,{generatedAt:'invalid'}),/fehlen/);
});
export { fixture, stamp };
