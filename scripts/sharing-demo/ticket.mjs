import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const out = new URL('../../demo/out/sharing/', import.meta.url);
await mkdir(out, { recursive: true });
const width = 600, height = 800;
const items = [
  { text: 'E-TICKET RECEIPT', x: 44, y: 67, size: 15, color: '#587085' },
  { text: 'Your London getaway', x: 44, y: 110, size: 29, bold: true },
  { text: 'Finnair', x: 44, y: 173, size: 19, bold: true },
  { text: 'AY1331', x: 44, y: 213, size: 29, bold: true },
  { text: '20 Sep 2026', x: 352, y: 213, size: 23 },
  { text: 'HEL', x: 44, y: 318, size: 57, bold: true },
  { text: 'LHR', x: 386, y: 318, size: 57, bold: true },
  { text: 'Helsinki', x: 44, y: 353, size: 20 },
  { text: 'London Heathrow', x: 350, y: 353, size: 20 },
  { text: '08:00', x: 44, y: 407, size: 29, bold: true },
  { text: '09:10', x: 386, y: 407, size: 29, bold: true },
  { text: 'Departure', x: 44, y: 437, size: 14, color: '#587085' },
  { text: 'Arrival', x: 386, y: 437, size: 14, color: '#587085' },
  { text: 'PASSENGER', x: 44, y: 514, size: 12, color: '#587085' },
  { text: 'Alex Taylor', x: 44, y: 548, size: 23 },
  { text: 'CABIN', x: 352, y: 514, size: 12, color: '#587085' },
  { text: 'Economy', x: 352, y: 548, size: 23 },
  { text: 'Booking reference: DEMO26', x: 44, y: 616, size: 17 },
  { text: 'All times are local.', x: 44, y: 650, size: 14, color: '#587085' },
  { text: 'SAMPLE ITINERARY - NOT VALID FOR TRAVEL', x: 44, y: 751, size: 11, color: '#587085' },
];
// PDF text remains selectable; the PNG exercises the app's real OCR reader.
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).join(' ');
const pdfText = s => s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
let stream = `1 1 1 rg 0 0 ${width} ${height} re f\n`;
stream += '0.18 0.43 0.78 RG 2 w 44 656 m 556 656 l S\n';
for (const i of items) stream += `${rgb(i.color || '#142D49')} rg BT /${i.bold ? 'F2' : 'F1'} ${i.size} Tf ${i.x} ${height-i.y} Td (${pdfText(i.text)}) Tj ET\n`;
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
];
let pdf = '%PDF-1.4\n'; const offsets = [0];
objects.forEach((o,i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
pdf += offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile(new URL('Helsinki-to-London.pdf',out),pdf);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><path d="M44 144 H556" stroke="#2E6EC7" stroke-width="2"/>${items.map(i=>`<text x="${i.x}" y="${i.y}" font-family="Helvetica,Arial,sans-serif" font-size="${i.size}" font-weight="${i.bold ? 700 : 400}" fill="${i.color || '#142D49'}">${i.text}</text>`).join('')}</svg>`;
await sharp(Buffer.from(svg),{density:216}).png().toFile(new URL('Helsinki-to-London.png',out).pathname);
console.log(out.pathname);
