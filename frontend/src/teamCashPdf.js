import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEuro } from './teamCashUtils.js';

const dateLabel = value => value.split('-').reverse().join('.');
const money = value => formatEuro(value).replace(/\u00a0/g, ' ');

export function createTeamCashPdf(report) {
  const generatedAt = new Date(report.generatedAt);
  if (Number.isNaN(generatedAt.getTime()) || !report.generatedBy) {
    throw new Error('Exportdatum oder Benutzer fehlen. Bitte die App neu laden und erneut exportieren.');
  }
  const stamp = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(generatedAt);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Mannschaftskasse', margin, 20);
  doc.setFontSize(12);
  const teamLines = doc.splitTextToSize(report.team, 182);
  doc.text(teamLines, margin, 29);
  const metadataY = 29 + teamLines.length * 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Saison ${report.season} | ${dateLabel(report.from)} bis ${dateLabel(report.to)}`, margin, metadataY + 2);
  autoTable(doc, {
    startY: metadataY + 7,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Anfangsbestand zum Zeitraum', money(report.openingCents)],
      ['Einzahlungen im Zeitraum', `+ ${money(report.depositedCents)}`],
      ['Ausgaben im Zeitraum', `- ${money(report.spentCents)}`],
      ['Endbestand zum Zeitraum', money(report.closingCents)],
    ],
    didParseCell(data) {
      if (data.row.index === 1) data.cell.styles.textColor = [17, 105, 57];
      if (data.row.index === 2) data.cell.styles.textColor = [172, 35, 45];
      if (data.row.index === 3) data.cell.styles.fontStyle = 'bold';
    },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    margin: { top: 19, bottom: 30, left: margin, right: margin },
    head: [['Datum', 'Benutzer', 'Verwendungszweck', 'Buchung', 'Betrag']],
    body: report.transactions.length ? report.transactions.map(t => [
      dateLabel(t.date), t.person || t.createdBy || '', t.purpose,
      t.type === 'deposit' ? 'Einzahlung' : 'Ausgabe',
      `${t.type === 'deposit' ? '+' : '-'} ${money(t.amountCents)}`,
    ]) : [[{ content: 'Keine Buchungen im ausgewählten Zeitraum.', colSpan: 5 }]],
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [27, 65, 106] },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 31 }, 2: { cellWidth: 70 }, 3: { cellWidth: 25 }, 4: { cellWidth: 32, halign: 'right' } },
    rowPageBreak: 'avoid',
    didParseCell(data) {
      if (data.section === 'body' && report.transactions.length && data.column.index >= 3) {
        data.cell.styles.textColor = report.transactions[data.row.index].type === 'deposit' ? [17, 105, 57] : [172, 35, 45];
      }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (page > 1) doc.text(`Mannschaftskasse | Saison ${report.season} | ${dateLabel(report.from)} bis ${dateLabel(report.to)}`, margin, 11);
    doc.text('Stand der aktuell gespeicherten Kasse.', margin, 275);
    doc.text(doc.splitTextToSize(`${stamp} Uhr (Berlin) | Benutzer: ${report.generatedBy}`, 182), margin, 280);
    doc.text(`Seite ${page} von ${pages}`, 196, 291, { align: 'right' });
  }
  return doc;
}

export function teamCashPdfFilename(report) {
  const team = report.team.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `Mannschaftskasse-${team}-Saison-${report.season.replace('/', '-')}-${report.from}-bis-${report.to}.pdf`;
}
