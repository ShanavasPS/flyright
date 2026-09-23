import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
const previewUrl = 'http://127.0.0.1:9453/canvas.html';
await mkdir(path.join(dir, 'previews'), { recursive: true });
const target = await (await fetch('http://127.0.0.1:9452/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
let seq = 0;
const pending = new Map(), errors = [], checks = [];
socket.on('message', raw => {
  const msg = JSON.parse(raw);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p?.reject(new Error(msg.error.message)) : p?.resolve(msg.result); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
const check = async (label, expression) => { const pass = !!(await evaluate(expression)); checks.push({ label, pass }); if (!pass) throw new Error(label); };
// Layout reads flush style changes even while native simulator checks have
// put Chrome in the background (where animation frames can be suspended).
const frame = () => evaluate('document.body.offsetHeight');
const capture = async (file, selector) => {
  const clip = await evaluate(selector ? `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()` : '({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})');
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  await writeFile(path.join(dir, file), Buffer.from(result.data, 'base64'));
};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: previewUrl });
// Navigation can briefly leave the old about:blank context reporting complete.
let loaded = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try { loaded = !!(await evaluate('document.querySelector("#scenario") && typeof render === "function"')); } catch { /* navigation replaced the execution context */ }
  if (loaded) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!loaded) throw new Error('Canvas did not finish loading.');
await evaluate('document.fonts.ready');
for (const width of [1600, 390, 320]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    for (const scenario of ['india', 'canada', 'continued', 'long', 'unknown']) {
      await evaluate(`document.querySelector('#scenario').value=${JSON.stringify(scenario)};document.querySelector('#scenario').dispatchEvent(new Event('change'))`);
      for (const large of [false, true]) {
        await evaluate(`document.body.classList.toggle('text-large',${large})`); await frame();
        await check(`${width}px / ${theme} / ${scenario} / ${large ? 'large' : 'normal'}: readable header, no overflow`, `[...document.querySelectorAll('.trip-head,.trip-title,.trip-dates,.phone')].every(e=>e.scrollWidth<=e.clientWidth+1)&&document.documentElement.scrollWidth<=innerWidth`);
      }
      await check(`${width}px / ${theme} / ${scenario}: same flight content in all options`, `new Set([...document.querySelectorAll('.group-body')].map(e=>e.innerHTML)).size===1`);
      await check(`${width}px / ${theme} / ${scenario}: complete title and dates`, `[...document.querySelectorAll('.trip-head')].every(e=>e.querySelector('.trip-title').textContent===examples[scenarioId].title&&e.querySelector('.trip-dates').textContent===examples[scenarioId].dates)`);
    }
  }
}
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
await evaluate(`document.body.classList.remove('text-large');document.querySelector('#scenario').value='india';document.querySelector('#scenario').dispatchEvent(new Event('change'));document.documentElement.dataset.theme='light'`); await frame();
await capture('overview.png');
for (const id of ['a', 'b', 'c', 'd']) await capture(`previews/option-${id}.png`, `.option-${id}`);
await evaluate(`document.querySelector('#theme').click()`); await frame();
await check('Appearance control switches theme', `document.documentElement.dataset.theme==='dark'`);
await capture('overview-dark.png');
await evaluate(`document.querySelector('[data-view="c"]').click()`); await frame();
await check('Focus control isolates an option', `document.querySelectorAll('.option:not([hidden])').length===1&&!document.querySelector('.option-c').hidden`);
await evaluate(`document.querySelector('[data-view="all"]').click();document.querySelector('#theme').click();document.querySelector('#size').click()`); await frame();
await check('Text size control works', `document.body.classList.contains('text-large')`);
await evaluate(`document.querySelector('#size').click();document.querySelector('#scenario').value='long';document.querySelector('#scenario').dispatchEvent(new Event('change'))`); await frame();
await capture('previews/long-title.png');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
await evaluate(`document.querySelector('[data-view="a"]').click()`); await frame();
await capture('previews/mobile.png');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
await evaluate(`document.querySelector('#scenario').value='india';document.querySelector('#scenario').dispatchEvent(new Event('change'));document.querySelector('[data-view="all"]').click()`); await frame();
await check('No browser runtime errors', JSON.stringify(errors.length === 0));
await writeFile(path.join(dir, 'review.json'), JSON.stringify({ reviewed: '2026-09-23', scope: 'Canvas only. No trip-group application code changes.', checks, runtimeErrors: errors }, null, 2) + '\n');
const nodes = [{ id: 'intro', type: 'text', x: 0, y: -160, width: 1460, height: 120, text: '# Trip-group header leads\n\nFour options; canvas only. Open design/trip-header-leads/canvas.html for five examples, light/dark appearance, larger text and individual focus. A is the recommended compact direction.' }];
for (let index = 0; index < 4; index++) {
  const id = 'abcd'[index];
  const png = await readFile(path.join(dir, `previews/option-${id}.png`));
  const height = Math.round(356 * png.readUInt32BE(20) / png.readUInt32BE(16));
  nodes.push({ id, type: 'file', file: `design/trip-header-leads/previews/option-${id}.png`, x: index * 380, y: 0, width: 356, height });
}
await writeFile(path.join(dir, 'trip-header-leads.canvas'), JSON.stringify({ nodes, edges: [] }, null, 2) + '\n');
console.log(JSON.stringify({ checks: checks.length, passed: checks.every(c => c.pass), errors }));
socket.close();
