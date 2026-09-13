import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normal, bold } from './squadPdfFont.js';
import { POSITIONS } from './squadUtils.js';
const clean = text => String(text || '').replace(/[\u0000-\u001f]/g, ' ');
const dateLabel = date => String(date).split('-').reverse().join('.');
export function createSquadPdf(game, { generatedBy, generatedAt }) {
  const stamp = new Date(generatedAt);
  if (!generatedBy || Number.isNaN(stamp.getTime())) throw new Error('Benutzer oder Exportzeit fehlen.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  for (const [style, data] of Object.entries({ normal, bold })) { doc.addFileToVFS(`Squad-${style}.ttf`, data); doc.addFont(`Squad-${style}.ttf`, 'Squad', style); }
  const navy = [15, 34, 49], green = [37, 102, 77];
  const leaders = game.viceCaptainIds || [];
  const badge = p => game.captainId === p.personId ? 'C' : leaders.includes(p.personId) ? `V${leaders.indexOf(p.personId) + 1}` : '';
  const text = (value, x, y, size = 10, color = navy, weight = 'normal') => { doc.setFont('Squad', weight); doc.setFontSize(size); doc.setTextColor(...color); doc.text(clean(value), x, y); };
  text('SquadHQ | Spielkader', 14, 19, 20, navy, 'bold');
  doc.setFontSize(12);
  const heading = doc.splitTextToSize(clean(game.opponent), 180);
  doc.setFontSize(12); doc.text(heading, 14, 28);
  let y = 29 + heading.length * 5;
  text(`${dateLabel(game.date)} | ${game.time} Uhr | ${game.fieldPlayers}+1 | ${game.formation}`, 14, y, 10);
  y += 6; doc.setFontSize(10); const location = doc.splitTextToSize(`Spielort: ${clean(game.location) || 'Noch offen'}`, 180); doc.text(location, 14, y); y += location.length * 5 + 5;
  const px = 32, py = y, pw = 146, ph = Math.min(175, 244 - py);
  doc.setFillColor(...green); doc.rect(px, py, pw, ph, 'F');
  doc.setDrawColor(215, 236, 218); doc.setLineWidth(.4); doc.rect(px, py, pw, ph); doc.line(px, py + ph / 2, px + pw, py + ph / 2);
  doc.circle(px + pw / 2, py + ph / 2, 17); doc.rect(px + pw * .23, py, pw * .54, ph * .16); doc.rect(px + pw * .23, py + ph * .84, pw * .54, ph * .16);
  text('ANGRIFF', px + 3, py + 5, 7, [226, 239, 228]);
  const players = game.lineup.filter(p => p.role !== 'bench');
  players.forEach(p => {
    const x = px + pw * p.x / 100, yy = py + ph * p.y / 100;
    doc.setFillColor(...(p.role === 'keeper' ? [252, 188, 85] : [188, 242, 104])); doc.setDrawColor(240, 255, 224); doc.roundedRect(x - 5, yy - 5, 10, 9, 2, 2, 'FD');
    doc.setFontSize(8); doc.setFont('Squad', 'bold'); doc.setTextColor(...navy); doc.text(p.position || 'F', x, yy + .5, { align: 'center' });
    const mark = badge(p); if (mark) text(mark, x + 6, yy - 3, 8, [255, 255, 255], 'bold');
    const name = clean(p.name); const short = name.length > 16 ? `${name.slice(0, 15)}.` : name;
    doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.text(short, x, yy + 9, { align: 'center' });
  });
  text(`Aufstellung: ${players.length}/${game.fieldPlayers + 1} | Ersatzbank: ${game.lineup.filter(p => p.role === 'bench').length}/${game.benchSize}`, 14, py + ph + 9, 10);
  text('C = Kapitänin | V1 / V2 = Vizekapitäninnen. Vollständiger Kader auf der Folgeseite.', 14, py + ph + 16, 8);
  doc.addPage(); text('Kader und Ersatzbank', 14, 20, 18, navy, 'bold');
  autoTable(doc, { rowPageBreak: 'avoid', startY: 29, margin: { top: 20, left: 14, right: 14, bottom: 24 }, theme: 'grid',
    head: [['Spielerin', 'Bereich', 'Position', 'Funktion']],
    body: [...game.lineup].sort((a,b) => ['keeper','field','bench'].indexOf(a.role) - ['keeper','field','bench'].indexOf(b.role)).map(p => [clean(p.name) + (p.guest ? ' (Gast)' : ''), {keeper:'Tor',field:'Feld',bench:'Ersatzbank'}[p.role], POSITIONS[p.position] || 'Offen', badge(p)]),
    styles: { font: 'Squad', fontSize: 10, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: navy }, columnStyles: {0:{cellWidth:66},1:{cellWidth:31},2:{cellWidth:60},3:{cellWidth:25}},
  });
  const pages = doc.getNumberOfPages();
  const footer = `${stamp.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} | ${clean(generatedBy)}`;
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('Squad', 'normal'); doc.setFontSize(7); doc.setTextColor(...navy); doc.text(doc.splitTextToSize(footer, 163), 14, 282); text(`${page}/${pages}`, 184, 286, 8); }
  return doc;
}
