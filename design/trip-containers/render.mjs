import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir, 'previews'), { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9443/json/list')).json();
const target = tabs.find(t => t.type === 'page') ?? await (await fetch('http://127.0.0.1:9443/json/new?about:blank', { method: 'PUT' })).json();
if (!target) throw new Error('Start isolated Chrome on port 9443.');
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
async function select(id, view = 'groups') { await evaluate(`scenarioId=${JSON.stringify(id)};viewMode=${JSON.stringify(view)};render()`); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); }
async function overview(file) { const compare = await rect('.compare'); await screenshot(file, { x: 0, y: 0, width: 1440, height: Math.ceil(compare.y + compare.height + 24) }); }
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'canvas.html')).href });
await evaluate('new Promise(r=>document.readyState==="complete"?r():addEventListener("load",r,{once:true}))');
await evaluate('document.fonts.ready');

const fixtures=JSON.parse(await readFile(path.join(dir,'scenarios.json'),'utf8'));
for(const s of fixtures){
  await select(s.id);
  await check(`${s.id}: every flight once in its original group order`, `[...document.querySelectorAll('.phone')].every(p=>JSON.stringify([...p.querySelectorAll('.trip-group [data-flight]')].map(e=>e.dataset.flight))===JSON.stringify(scenario().sections.flatMap(s=>s.data.filter(e=>e.kind==='flight').map(e=>e.journey.id))))`);
  await check(`${s.id}: flag, title and dates inside each flat container`, `[...document.querySelectorAll('.phone')].every(p=>p.querySelectorAll('.trip-group').length===scenario().sections.flatMap(s=>s.data.filter(e=>e.kind==='header')).length&&[...p.querySelectorAll('.trip-group')].every(g=>g.querySelector(':scope > .trip-heading .flag')&&g.querySelector(':scope > .trip-heading strong')&&g.querySelector(':scope > .trip-heading time')&&!g.querySelector('.trip-group')))`);
  await check(`${s.id}: stays and connections retained`, `[...document.querySelectorAll('.phone')].every(p=>p.querySelectorAll('.stay-marker').length===scenario().sections.flatMap(s=>s.data.filter(e=>e.kind==='stay')).length&&p.querySelectorAll('.connection-marker').length===scenario().sections.flatMap(s=>s.data.filter(e=>e.connection)).length)`);
  await check(`${s.id}: no full-width trip separator in any proposal`, `!document.querySelector('[data-option=a] .trip-separator,[data-option=b] .trip-separator,[data-option=c] .trip-separator')`);
  await check(`${s.id}: one live card and one countdown when live`, `[...document.querySelectorAll('.phone')].every(p=>p.querySelectorAll('[data-live-card]').length===${s.hero?1:0}&&p.querySelectorAll('.countdown').length===${s.hero?1:0})`);
  await check(`${s.id}: all three proposals share identical inner content`, `(()=>{const content=o=>{const c=document.querySelector('#phone-'+o+' .screen').cloneNode(true);c.querySelectorAll('.running-border').forEach(e=>e.remove());return c.innerHTML};return ['b','c'].every(o=>content(o)===content('a'))})()`);
  await check(`${s.id}: no horizontal overflow`, `document.documentElement.scrollWidth<=innerWidth&&['a','b','c'].every(o=>{const p=document.querySelector('#phone-'+o+' .screen');return p.scrollWidth<=p.clientWidth+1})`);
}
await select('canada');
await check('YYZ to BOS remains in Canada and the resumed stay follows the US continued header', `(()=>{const p=document.querySelector('#phone-a'),ca=p.querySelector('[data-flight="canada-back"]').closest('.trip-group'),us=p.querySelector('[data-flight="back"]').closest('.trip-group');return ca.querySelector('.trip-heading').textContent.includes('Canada trip')&&us.querySelector('.trip-heading').textContent.includes('US trip continued')&&us.children[1].classList.contains('stay-marker')&&us.children[1].textContent.includes('9 days')})()`);
await check('A, B and C all have an enclosing fill and border', `['a','b','c'].every(o=>{const s=getComputedStyle(document.querySelector('#phone-'+o+' .trip-group'));return s.boxShadow!=='none'&&(s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.backgroundImage!=='none')})`);
await overview('overview.png');
for(const o of ['a','b','c'])await screenshot(`previews/canada-${o}.png`,await rect('#phone-'+o));
await evaluate(`document.querySelector('#theme').click()`);await overview('overview-dark.png');
await evaluate(`document.querySelector('#theme').click()`);
for(const id of ['return','connections','independent','oneway']){
  await select(id);await overview(`previews/${id}.png`);
}
await select('independent');
await check('Current reference still contains the independent-trip separator', `document.querySelectorAll('#phone-current .trip-separator').length===1`);
await evaluate(`document.querySelector('#baseline').click()`);
await check('Current comparison can be opened without replacing an option', `!document.querySelector('[data-option=current]').hidden&&document.querySelectorAll('.option:not([hidden])').length===4`);
await evaluate(`document.querySelector('#baseline').click()`);
await select('first-live','top');
await check('First live flight expands under its group heading after the small stats summary', `[...document.querySelectorAll('.phone')].every(p=>p.querySelector('.screen').firstElementChild.classList.contains('stats-strip')&&p.querySelector('[data-live-card]').parentElement.classList.contains('trip-group')&&!p.querySelector('[data-jump]'))`);
await overview('previews/first-live.png');
await select('later-live','top');
await check('Later live flight keeps the original full row with an upward link', `[...document.querySelectorAll('.phone')].every(p=>p.querySelector('.screen').firstElementChild.hasAttribute('data-live-card')&&p.querySelector('[data-live-row] [data-flight]').dataset.flight==='canada-back'&&p.querySelector('.live-row-action').textContent==='View live card ↑')`);
await check('Only the live card and active row animate; the group border stays still', `[...document.querySelectorAll('.phone')].every(p=>p.querySelectorAll('.running-border').length===2&&!p.querySelector('.trip-group > .running-border'))`);
await overview('previews/later-live-top.png');
await evaluate(`document.querySelector('#phone-a .hero-context').click()`);
await evaluate('new Promise(r=>setTimeout(r,650))');
await check('Downward live shortcut reaches its row', `document.querySelector('#phone-a .screen').scrollTop>200`);
await evaluate(`document.querySelector('#phone-a .live-row-action').click()`);
await evaluate('new Promise(r=>setTimeout(r,650))');
await check('Upward row shortcut returns to live card', `document.querySelector('#phone-a .screen').scrollTop<10`);
const animationStart=await evaluate(`getComputedStyle(document.querySelector('#phone-a .running-border rect')).strokeDashoffset`);
await evaluate('new Promise(r=>setTimeout(r,250))');
await check('Live border advances through its animation', `getComputedStyle(document.querySelector('#phone-a .running-border rect')).strokeDashoffset!==${JSON.stringify(animationStart)}`);
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await check('Reduced motion holds the live border still', `getComputedStyle(document.querySelector('#phone-a .running-border rect')).animationName==='none'`);
await send('Emulation.setEmulatedMedia',{features:[]});
await select('later-live','live');await overview('previews/later-live-group.png');
for(const width of [390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['canada','connections','later-live']){
    await select(id);
    await check(`${width}px / ${id}: no page or preview overflow`, `document.documentElement.scrollWidth<=innerWidth&&['a','b','c'].every(o=>{const p=document.querySelector('#phone-'+o+' .screen');return p.scrollWidth<=p.clientWidth+1})`);
  }
  if(width===390){await select('canada');await screenshot('previews/mobile-canvas.png',{x:0,y:0,width,height:844});}
}
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1700,deviceScaleFactor:1,mobile:false});
await select('canada');
await check('No browser runtime errors',JSON.stringify(errors.length===0));
await writeFile(path.join(dir,'review.json'),JSON.stringify({reviewed:'2026-09-23',scope:'Canvas only. No application implementation or native testing.',checks,runtimeErrors:errors},null,2)+'\n');
const nodes=[{id:'intro',type:'text',x:0,y:-190,width:1380,height:150,text:'# Trip containers · design options\n\nA filled border around each flag, title, date range, flights and stays. No full-width trip separator. Open design/trip-containers/canvas.html for eight scenarios, light/dark appearance and current comparison. Canvas only; app unchanged.'}];
for(const [i,[o,name,description]] of [['a','A / Soft surface','Light fill and quiet outline.'],['b','B / Clear outline','Deeper fill and stronger silver border.'],['c','C / Title band · Selected','Updated: 12 px below the header, 16 px outer corners.']].entries()){
  nodes.push({id:'label-'+o,type:'text',x:i*480,y:0,width:440,height:100,text:`## ${name}\n\n${description}`},{id:'preview-'+o,type:'file',file:`design/trip-containers/previews/canada-${o}.png`,x:i*480,y:120,width:427,height:1020});
}
nodes.push({id:'live-note',type:'text',x:0,y:1190,width:1380,height:100,text:'## The live behavior stays the same\n\nFirst flight expands inside its group. Later live flights retain the original row and both jump links. Only the flight border animates.'},{id:'first-live',type:'file',file:'design/trip-containers/previews/first-live.png',x:0,y:1320,width:1380,height:1460},{id:'later-live',type:'file',file:'design/trip-containers/previews/later-live-group.png',x:1440,y:1320,width:1380,height:1460});
await writeFile(path.join(dir,'trip-containers.canvas'),JSON.stringify({nodes,edges:[]},null,2)+'\n');
await sharp(path.join(dir,'overview.png')).resize({width:1440}).toFile(path.join(dir,'previews/overview-preview.png'));
console.log(JSON.stringify({canvasChecks:checks.length,passed:checks.every(c=>c.pass),runtimeErrors:errors},null,2));
socket.close();
