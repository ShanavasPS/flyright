import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir, 'previews'), { recursive: true });
const target = await (await fetch('http://127.0.0.1:9464/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
const pending = new Map(), errors = [], checks = [];
let seq = 0;
socket.on('message', raw => {
  const message = JSON.parse(raw);
  if (message.id) {
    const task = pending.get(message.id); pending.delete(message.id);
    if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const check = async (label, expression) => {
  const value = await evaluate(expression); const pass = value === true;
  checks.push({ label, pass, ...(pass ? {} : { actual: value }) });
  if (!pass) throw new Error(label + ': ' + JSON.stringify(value));
};
const dimensions = async width => send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
const capture = async filename => {
  await evaluate('document.querySelector("#toast").classList.remove("show"); document.body.offsetHeight');
  const clip = await evaluate('({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})');
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  await writeFile(path.join(dir, filename), Buffer.from(image.data, 'base64'));
};
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'canvas.html')).href });
  for (let attempt = 0; attempt < 80; attempt++) {
    let ready = false; try { ready = await evaluate('typeof state !== "undefined" && document.querySelectorAll(".direction").length > 0'); } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate('document.fonts.ready');
  await dimensions(1600);
  await evaluate('document.querySelector("#reset").click()');
  await check('Four compact header treatments rendered', 'document.querySelectorAll(".direction").length === 4 && document.querySelectorAll("section[data-group]").length === 8');
  await check('Normal headers are 48 pixels in every direction', '[...document.querySelectorAll(".direction .trip-heading")].every(h=>h.getBoundingClientRect().height===48)');
  await check('No collapsed groups or collapse controls exist', '!document.querySelector("details,summary,#expand,.toggle-glyph,.collapsed-route")');
  await check('Return and one-way flights are all displayed', '[...document.querySelectorAll(".direction")].every(d=>d.querySelectorAll(".flight").length===3 && [...d.querySelectorAll(".flight")].every(f=>f.getBoundingClientRect().height>90))');
  await check('Card dimensions are identical across the four treatments', 'new Set([...document.querySelectorAll("[data-flight=uk-out]")].map(f=>f.getBoundingClientRect().height)).size===1');
  await check('Default single-flight card fits completely above the tabs', '[...document.querySelectorAll("[data-flight=japan-out]")].every(f=>f.getBoundingClientRect().bottom<=f.closest(".screen-scroll").getBoundingClientRect().bottom-8)');
  await capture('overview-interactive.png');
  await evaluate('document.querySelector(".trip-heading").click()');
  await check('Tapping a header cannot hide its flights', '[...document.querySelectorAll("[data-group=uk] .flight")].every(f=>f.getBoundingClientRect().height>90)');
  await evaluate('document.querySelector("[data-flight=uk-out]").click()');
  await check('Flight preview shows the tapped flight', 'document.querySelector("#flight-dialog").open && document.querySelector("#flight-detail").textContent.includes("AY1337") && document.querySelector("#flight-detail").textContent.includes("UK trip")');
  await evaluate('document.querySelector(".dialog-close").click()');
  await evaluate('selectScenario("multi")');
  await check('Every flight appears once per design in travel order', '[...document.querySelectorAll(".direction")].every(d=>[...d.querySelectorAll("[data-flight]")].map(b=>b.dataset.flight).join(",")==="us-out,ca-out,ca-back,us-home")');
  await check('Canada return remains in Canada; resumed US stay precedes final flight', '[...document.querySelectorAll("section[data-group=canada]")].every(d=>!!d.querySelector("[data-flight=ca-back]")) && [...document.querySelectorAll("section[data-group=us-continued] .group-body")].every(b=>b.firstElementChild.classList.contains("stay"))');
  await capture('previews/multi-country.png');
  await evaluate('selectScenario("oneway")');
  await check('A single flight remains a full visible card below its header', '[...document.querySelectorAll(".direction")].every(d=>d.querySelectorAll(".flight").length===1 && d.querySelector(".group-body .flight").getBoundingClientRect().height>90 && d.querySelector(".trip-heading").getBoundingClientRect().height===48)');
  await capture('previews/single-flight.png');
  for (const view of ['a', 'b', 'c', 'd']) {
    await evaluate(`selectView('${view}',false)`);
    await check('Focus ' + view + ' has a phone and design rationale', `document.querySelectorAll('.direction').length===1 && document.querySelector('.direction').dataset.direction==='${view}' && document.querySelectorAll('.design-point').length===3`);
    await check('Focus ' + view + ' keeps its sample header compact', 'document.querySelector(".anatomy .trip-heading").getBoundingClientRect().height === 48');
  }
  await evaluate('selectScenario("upcoming"); selectView("a",false); document.querySelector("#light").click()');
  await capture('previews/right-fade-light.png');
  await evaluate('document.querySelector("#dark").click(); selectView("b",false)');
  await capture('previews/soft-wash-dark.png');
  await evaluate('selectView("all",false); document.querySelector("#strength").value="20"; document.querySelector("#strength").dispatchEvent(new Event("input",{bubbles:true}))');
  await check('Flag strength actually changes artwork opacity', 'getComputedStyle(document.querySelector(".style-a .flag-art")).opacity === "0.2"');
  await evaluate('document.querySelector("#reset").click()');
  await evaluate('selectScenario("connections")');
  await check('Connections remain one destination with all three flights and two pauses', '[...document.querySelectorAll(".direction")].every(d=>d.querySelectorAll("section[data-group]").length===1 && d.querySelectorAll("[data-flight]").length===3 && d.querySelectorAll(".connection").length===2 && d.querySelectorAll(".stay").length===0)');
  await evaluate('selectScenario("edge"); document.querySelector("#large").click()');
  await check('Unknown country has no invented flag', '[...document.querySelectorAll("section[data-group=unknown]")].every(d=>!d.querySelector(".flag-art"))');
  for (const width of [1600, 1000, 750, 390, 320]) {
    await dimensions(width);
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.querySelector('#${theme}').click()`);
      await check(`No page overflow at ${width}px / ${theme} / large text`, 'document.documentElement.scrollWidth <= innerWidth + 1');
      await check(`Long names and dates fit at ${width}px / ${theme}`, '(()=>{const bad=[...document.querySelectorAll(".trip-title,.trip-dates,.flight")].filter(e=>e.clientWidth && e.scrollWidth>e.clientWidth+1);return bad.length===0 || bad.map(e=>({class:e.className,width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent.slice(0,70)}))})()');
    }
  }
  await capture('previews/edge-cases-mobile.png');
  await evaluate('document.querySelector("#reset").click()');
  await dimensions(390);
  await capture('previews/mobile.png');
  await evaluate('selectView("d",false)');
  await check('Focused design and notes fit a mobile viewport', 'document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector(".anatomy").getBoundingClientRect().height < 350');
  await capture('previews/lower-fade-mobile.png');
  await dimensions(1600);
  await evaluate('selectView("all",false)');
  await evaluate('document.querySelector("#light").click()');
  await capture('overview-interactive-light.png');
  await evaluate('document.querySelector("#reset").click()');
  await check('No third-party network dependencies in the canvas', 'performance.getEntriesByType("resource").every(r=>r.name.startsWith("file:") || r.name.startsWith("data:"))');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Passed ${checks.length} browser checks. Captured interactive previews.`);
} finally {
  await writeFile(path.join(dir, 'review-interactive.json'), JSON.stringify({ checkedAt: new Date().toISOString(), errors, checks }, null, 2) + '\n');
  socket.close();
}
