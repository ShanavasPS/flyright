import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir, 'previews'), { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9442/json/list')).json();
const target = tabs.find(t => t.type === 'page') ?? await (await fetch('http://127.0.0.1:9442/json/new?about:blank', { method: 'PUT' })).json();
if (!target) throw new Error('Start isolated Chrome on port 9442.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
let seq = 0;
const pending = new Map();
const errors = [];
socket.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(new Error(m.error.message)) : p?.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const rect = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);
const screenshot = async (file, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); await writeFile(path.join(dir, file), Buffer.from(r.data, 'base64')); };
const checks = [];
async function check(label, expression) { const pass = !!(await evaluate(expression)); checks.push({ label, pass }); if (!pass) throw new Error(`Canvas check failed: ${label}`); }
async function select(id, view = 'top') { await evaluate(`scenarioId=${JSON.stringify(id)};viewMode=${JSON.stringify(view)};render()`); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); }
async function overview(file) { const compare = await rect('.compare'); await screenshot(file, { x: 0, y: 0, width: 1440, height: Math.ceil(compare.y + compare.height + 24) }); }
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'canvas.html')).href });
await evaluate('new Promise(r=>document.readyState==="complete"?r():addEventListener("load",r,{once:true}))');
await evaluate('document.fonts.ready');

for (const s of JSON.parse(await readFile(path.join(dir, 'scenarios.json'), 'utf8'))) {
  await select(s.id);
  await check(`${s.id}: one live card per option, or none outside the travel window`, `[...document.querySelectorAll('.phone')].every(p=>p.querySelectorAll('[data-live-card]').length===${s.heroId ? 1 : 0})`);
  await check(`${s.id}: current list matches source row order`, `JSON.stringify([...document.querySelectorAll('#phone-current .flight-card')].map(e=>e.dataset.flight))===JSON.stringify(scenario().currentSections.flatMap(s=>s.data.filter(r=>r.kind==='flight').map(r=>r.journey.id)))`);
  await check(`${s.id}: A keeps each flight in the itinerary without a second countdown`, `(()=>{const s=scenario(),p=document.querySelector('#phone-anchor');const ids=[...p.querySelectorAll('.flight-card,[data-pointer]')].map(e=>e.dataset.flight||e.dataset.pointer);return JSON.stringify(ids)===JSON.stringify(s.rows.filter(f=>s.rows.length!==1||!s.hero).map(f=>f.id))&&p.querySelectorAll('.countdown').length===(s.hero?1:0)})()`);
  await check(`${s.id}: B shows every flight once in travel order`, `JSON.stringify([...document.querySelectorAll('#phone-inline [data-flight]')].map(e=>e.dataset.flight))===JSON.stringify(scenario().rows.map(f=>f.id))`);
  await check(`${s.id}: every stay retains its duration and order`, `[...document.querySelectorAll('.phone')].every(p=>JSON.stringify([...p.querySelectorAll('.stay-detail')].map(e=>e.textContent))===JSON.stringify(scenario().groups.flatMap(g=>g.entries.filter(e=>e.kind==='stay').map(e=>e.stay.days+' days in '+e.stay.place))))`);
  await check(`${s.id}: flat country groups, no internal full-width separator`, `!document.querySelector('.trip-separator,.trip-group .trip-group')`);
  await check(`${s.id}: no horizontal overflow`, `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.screen')].every(p=>p.scrollWidth<=p.clientWidth+1)`);
}
await select('homebound');
await check('Current final-flight omission files the remaining itinerary under its year', `document.querySelector('#phone-current .section-label').textContent==='2027'`);
await check('Both proposals retain Current trip until the trip finishes', `['anchor','inline'].every(m=>document.querySelector('#phone-'+m+' .section-label').textContent==='Current trip')`);
await select('connection');
await check('Current omission removes the first connection marker; both alternatives retain it', `document.querySelectorAll('#phone-current .connection-marker').length===0&&['anchor','inline'].every(m=>document.querySelectorAll('#phone-'+m+' .connection-marker').length===1)`);
await select('canada');
await check('The YYZ to BOS pointer is below the Canada stay and before the continued US heading', `(()=>{const p=document.querySelector('#phone-anchor [data-pointer]');return p.previousElementSibling.classList.contains('stay-marker')&&p.nextElementSibling.textContent.includes('US trip continued')&&p.nextElementSibling.nextElementSibling.textContent.includes('9 days in the US')})()`);
await check('Proposed live card identifies the Canada group', `document.querySelector('#phone-anchor .hero-context').textContent.includes('Canada trip')`);
await evaluate(`document.querySelector('#phone-anchor .hero-context').click()`);
await evaluate('new Promise(r=>setTimeout(r,600))');
await check('Live card’s group shortcut moves to its itinerary position', `document.querySelector('#phone-anchor .screen').scrollTop>100`);
await evaluate(`document.querySelector('#phone-anchor [data-pointer]').click()`);
await evaluate('new Promise(r=>setTimeout(r,600))');
await check('Compact pointer returns to the single live card', `document.querySelector('#phone-anchor .screen').scrollTop<20`);
await evaluate(`document.querySelector('#phone-inline .jump-live').click()`);
await evaluate('new Promise(r=>setTimeout(r,600))');
await check('B’s shortcut moves to its inline live card', `document.querySelector('#phone-inline .screen').scrollTop>100`);

await select('outbound'); await overview('overview.png');
for (const mode of ['current','anchor','inline']) await screenshot(`previews/outbound-${mode}.png`, await rect('#phone-' + mode));
await evaluate(`document.querySelector('#theme').click()`); await overview('overview-dark.png');
await evaluate(`document.querySelector('#theme').click()`);
await select('canada'); await overview('previews/canada-top.png');
await select('canada', 'place'); await overview('previews/canada-position.png');
for (const mode of ['current','anchor','inline']) await screenshot(`previews/canada-${mode}.png`, await rect('#phone-' + mode));
await select('homebound', 'place'); await overview('previews/homebound-position.png');
await select('connection'); await overview('previews/connection.png');
await select('oneway'); await overview('previews/one-flight.png');
for (const width of [390, 320]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
  for (const id of ['outbound', 'canada', 'homebound']) {
    await select(id);
    await check(`${width}px / ${id}: no page or phone overflow`, `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.screen')].every(p=>p.scrollWidth<=p.clientWidth+1)`);
  }
  if (width === 390) { await select('outbound'); await screenshot('previews/mobile-canvas.png', { x: 0, y: 0, width, height: 844 }); }
}
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });
await select('outbound');
await check('No JavaScript runtime errors', JSON.stringify(errors.length === 0));
await writeFile(path.join(dir, 'review.json'), JSON.stringify({ reviewed: '2026-09-23', scope: 'Design artifact only; no app implementation or native testing', fixtures: 'Generated by the existing pure trip grouping functions', checks, runtimeErrors: errors }, null, 2) + '\n');
const nodes = [{ id: 'intro', type: 'text', x: 0, y: -210, width: 1340, height: 170, text: '# Live flights in grouped trips\n\nCurrent behavior and two alternatives. A keeps the live card at the top and a compact route pointer in its original place. B expands the flight inside its group. Design only. Open design/live-trip-grouping/canvas.html for eight travel moments, both themes and working shortcuts.' }];
for (const [i, [id, title, description]] of [['current','00 / Current','The live row is omitted; the US group starts with a stay.'],['anchor','A / Keep a small pointer · Recommended','One live card, with the original route position retained.'],['inline','B / Expand in its group','The flight stays put; later live flights require a shortcut or scroll.']].entries()) {
  nodes.push({ id:'title-'+id, type:'text', x:i*460, y:0, width:420, height:120, text:`## ${title}\n\n${description}` }, { id:'phone-'+id, type:'file', file:`design/live-trip-grouping/previews/outbound-${id}.png`, x:i*460, y:140, width:400, height:930 });
  nodes.push({ id:'canada-'+id, type:'file', file:`design/live-trip-grouping/previews/canada-${id}.png`, x:i*460, y:1230, width:400, height:930 });
}
nodes.push({ id:'canada-label', type:'text', x:0, y:1100, width:1340, height:100, text:'## Canada → US · the same list, scrolled to the live flight’s place\n\nYYZ → BOS stays in Canada. US trip continued starts with its nine-day stay. No nesting or separator inside this overall trip.' });
await writeFile(path.join(dir, 'live-trip-grouping.canvas'), JSON.stringify({ nodes, edges: [] }, null, 2) + '\n');
await sharp(path.join(dir, 'overview.png')).resize({ width: 1440 }).toFile(path.join(dir, 'previews/overview-preview.png'));
console.log(JSON.stringify({ canvasChecks: checks.length, passed: checks.every(c => c.pass), runtimeErrors: errors }, null, 2));
socket.close();
