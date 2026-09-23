import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir, 'previews'), { recursive: true });
const target = await (await fetch('http://127.0.0.1:9444/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map(), errors = [], checks = [];
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(new Error(m.error.message)) : p?.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
const rect = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);
const screenshot = async (file, clip) => { await evaluate("document.querySelector('.toast').hidden=true"); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } }); await writeFile(path.join(dir, file), Buffer.from(r.data, 'base64')); };
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const check = async (label, expression) => { const pass = !!(await evaluate(expression)); checks.push({ label, pass }); if (!pass) throw new Error(`Canvas check failed: ${label}`); };
const select = async value => evaluate(`document.querySelector('#scenario').value=${JSON.stringify(value)};document.querySelector('#scenario').dispatchEvent(new Event('change'))`);
const panel = async name => click(`[data-panel="${name}"]`);
async function overview(file, name = 'options') { const r = await rect(`#${name} .compare`); await screenshot(file, { x: 0, y: 0, width: 1440, height: Math.ceil(r.y + r.height + 32) }); }

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'canvas.html')).href });
  await evaluate('new Promise(r=>document.readyState==="complete"?r():addEventListener("load",r,{once:true}))');
  await evaluate('document.fonts.ready');
  await panel('options');
  await check('All embedded images load offline', `[...document.images].every(i=>i.complete&&i.naturalWidth>0)`);
  await check('Three distinct traveller treatments', `document.querySelector('#phone-a').textContent.includes('Keep this trip up to date.')&&document.querySelector('#phone-b').textContent.includes('Saved with your flight')&&document.querySelector('#phone-c').textContent.includes('Subscribe closer to take-off.')`);
  await overview('overview.png');
  for (const o of ['a', 'b', 'c']) await screenshot(`previews/option-${o}.png`, await rect('#phone-' + o));
  await click('#theme'); await overview('overview-dark.png');
  await click('#theme');
  await click('#phone-a [data-action=paywall]');
  await check('A opens the proposed explanation before pricing', `document.querySelector('#dialog-body').textContent.includes('What Pro adds')&&!document.querySelector('#dialog [data-plan]')`);
  await click('#dialog [data-action=trip-plans]');
  await check('Trip offer states account access and recurring monthly billing', `document.querySelector('#dialog').open&&document.querySelector('#dialog-body').textContent.includes('across your flights')&&document.querySelector('#dialog-body').textContent.includes('Renews monthly until cancelled')`);
  await screenshot('previews/contextual-paywall.png', await rect('#dialog'));
  await click('#dialog [data-plan=yearly]');
  await check('Yearly shows the full annual charge and renewal', `document.querySelector('#dialog-body').textContent.includes('€29.99 / year')&&document.querySelector('#dialog-body').textContent.includes('Renews yearly until cancelled')`);
  await click('#close-dialog');
  await click('#phone-a [data-action=dismiss]');
  await check('Dismissing A preserves free trip and removes the automatic card', `document.querySelector('#phone-a').textContent.includes('HEL')&&document.querySelector('#phone-a').textContent.includes('Live updates off')&&!document.querySelector('#phone-a').textContent.includes('Keep this trip up to date.')`);
  await click('#phone-c [data-action=reminder]'); await click('#dialog [data-action=set-reminder]');
  await check('Reminder does not start a subscription', `document.querySelector('#phone-c').textContent.includes('You have not subscribed.')&&document.querySelector('#phone-c').textContent.includes('Reminder set')`);
  await screenshot('previews/reminder-set.png', await rect('#phone-c'));
  await select('soon');
  await check('Close to travel changes C from reminder to timely Pro entry', `document.querySelector('#phone-c').textContent.includes('Flying soon? Add live updates.')&&!document.querySelector('#phone-c [data-action=reminder]')`);
  await overview('previews/flying-soon.png');
  for (const kind of ['past', 'follower']) {
    await select(kind);
    await check(`${kind} has no acquisition button in any option`, `!document.querySelector('#option-grid [data-action=paywall],#option-grid [data-action=reminder]')`);
    await check(`${kind} keeps useful free content`, `[...document.querySelectorAll('#option-grid .phone')].every(p=>p.textContent.includes(${JSON.stringify(kind === 'past' ? 'Add another flight' : 'Above the clouds.')}))`);
    await screenshot(`previews/${kind}.png`, await rect('#phone-a'));
  }
  await panel('family');
  await overview('family-and-postcards.png', 'family');
  for (const name of ['family', 'post', 'history']) await screenshot(`previews/${name}.png`, await rect('#phone-' + name));
  await evaluate(`document.querySelector('#draft-text').value='My words should stay here.';document.querySelector('#draft-text').dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('#phone-post [data-action=paywall]'); await click('#close-dialog');
  await check('Dismissed paywall keeps postcard draft', `document.querySelector('#draft-text').value==='My words should stay here.'`);
  await click('#phone-post [data-action=paywall]'); await click('#dialog [data-action=purchase]'); await click('#dialog [data-action=return-draft]');
  await check('Preview purchase returns to draft with explicit Publish', `document.querySelector('#draft-text').value==='My words should stay here.'&&!!document.querySelector('#phone-post [data-action=publish]')&&!document.querySelector('#phone-post').textContent.includes('Postcard published')`);
  await evaluate(`draft='A little closer to you. See you when we land!';draftState='Draft · only you';renderSupport()`);
  await panel('plans');
  await overview('subscribe-and-cancel.png', 'plans');
  for (const name of ['plan', 'cancel', 'expired']) await screenshot(`previews/${name}.png`, await rect('#phone-' + name));
  await check('Cancellation and expiry have distinct outcomes', `document.querySelector('#phone-cancel').textContent.includes('Your Pro stays active.')&&document.querySelector('#phone-expired').textContent.includes('Live updates off')`);
  await panel('rules');
  await check('Scope includes both the rules and ten workstreams', `document.querySelectorAll('.scope-item').length===10&&document.querySelector('#rules').textContent.includes('three-follower paywall')`);
  await screenshot('previews/product-rules.png', { x: 0, y: 0, width: 1440, height: 1200 });
  await panel('prompts');
  await click('[data-action=first-reset]');
  await check('Revised prompt board has one large introduction and compact later/contextual entries', `!!document.querySelector('#phone-first [data-large-intro]')&&!document.querySelector('#phone-return [data-large-intro]')&&!document.querySelector('#phone-inbound [data-large-intro]')&&document.querySelectorAll('#phone-inbound [data-action=trip-offer]').length===1`);
  await check('Three trip groups and six legs share one account status entry', `document.querySelectorAll('#phone-return .journey-group').length===3&&document.querySelectorAll('#phone-return .journey-leg').length===6&&document.querySelectorAll('#phone-return [data-account-status]').length===1&&!document.querySelector('#phone-return .journey-group [data-action=trip-offer]')`);
  await overview('revised-prompts.png', 'prompts');
  for (const name of ['first', 'return', 'inbound']) await screenshot(`previews/revised-${name}.png`, await rect('#phone-' + name));
  await click('#theme'); await overview('revised-prompts-dark.png', 'prompts'); await click('#theme');
  await click('[data-action=repeat-preview]');
  await check('Reopening consumes the introduction even without explicit dismissal', `!document.querySelector('#phone-first [data-large-intro]')&&document.querySelector('#phone-first').textContent.includes('Live updates off')`);
  await panel('family'); await panel('prompts');
  await check('Switching screens does not restore the large introduction', `!document.querySelector('#phone-first [data-large-intro]')`);
  await click('#phone-return [data-action=hide-home-card]');
  await check('Home close hides the card without opening Pro; trip details retain it', `homeCardHidden&&!document.querySelector('#phone-return [data-account-status]')&&!document.querySelector('#dialog').open&&!!document.querySelector('#phone-inbound [data-trip-status]')&&!document.querySelector('#phone-inbound [data-action=hide-home-card]')`);
  await overview('home-card-dismissed.png', 'prompts');
  await screenshot('previews/home-card-dismissed.png', await rect('#phone-return'));
  await panel('family'); await panel('prompts');
  await click('#phone-return .journey-group[data-trip=tokyo]');
  await check('Home dismissal survives navigation and opening another trip', `homeCardHidden&&!document.querySelector('#phone-return [data-account-status]')&&document.querySelector('#phone-inbound [data-action=trip-offer]').dataset.trip==='tokyo'`);
  await click('[data-action=timing-active]'); await click('[data-action=timing-reset]');
  await check('Home dismissal survives the active-to-free preview', `homeCardHidden&&!document.querySelector('#phone-return [data-account-status]')`);
  await click('[data-action=home-card-reset]');
  await click('#phone-return .journey-group[data-trip=paris]');

  await click('#phone-inbound [data-action=trip-offer]');
  await check('Trip status opens the short Pro offer with the three paid benefits', `document.querySelector('#dialog-body').textContent.includes('What Pro adds')&&document.querySelector('#dialog-body').textContent.includes('Updates where available')&&document.querySelectorAll('#dialog-body .features li').length===3&&!document.querySelector('#dialog-body').textContent.includes('Where is your plane')`);
  await check('The initial offer retains Paris and keeps the timing choice short', `document.querySelector('#dialog-body').textContent.includes('Paris trip')&&document.querySelector('#dialog [data-action=trip-reminder]').dataset.trip==='paris'&&!document.querySelector('#dialog-body .cal')&&document.querySelector('#dialog-body').textContent.trim().split(/\\s+/).length<80`);
  await screenshot('previews/inbound-offer.png', await rect('#dialog'));
  await screenshot('previews/short-pro-modal.png', await rect('#dialog'));
  await click('#dialog [data-action=trip-reminder]');
  await check('The next step shows the selected Paris reminder date and delivery', `document.querySelector('#dialog-body').textContent.includes('19 November')&&document.querySelector('#dialog-body').textContent.includes('Helsinki time')&&document.querySelector('#dialog-body').textContent.includes('never start or charge')`);
  await click('#dialog [data-action=confirm-trip-reminder]');
  await check('Choosing a Paris reminder does not opt London or Tokyo in', `tripReminders.size===1&&tripReminders.has('paris')&&document.querySelector('#phone-return .journey-group[data-trip=paris]').textContent.includes('Pro reminder')&&!document.querySelector('#phone-return .journey-group[data-trip=london]').textContent.includes('Pro reminder')`);
  await click('#phone-return .journey-group[data-trip=tokyo]');
  await click('#phone-inbound [data-action=trip-offer]');
  await check('Opening another trip updates the Pro offer and its reminder', `document.querySelector('#dialog-body').textContent.includes('Tokyo trip')&&document.querySelector('#dialog [data-action=trip-reminder]').dataset.trip==='tokyo'`);
  await click('#dialog [data-action=trip-plans]');
  await check('Plans retain the trip chosen through the list', `document.querySelector('#dialog-body').textContent.includes('Tokyo trip · HEL → HND')`);
  await click('#close-dialog');
  await panel('timing');
  await click('[data-action=timing-reset]');
  await overview('multiple-trips-timing.png', 'timing');
  for (const name of ['offer','confirm']) await screenshot(`previews/timing-${name}.png`, await rect('#phone-timing-'+name));
  await click('#theme'); await overview('multiple-trips-timing-dark.png', 'timing'); await click('#theme');
  await check('The user-requested offer has a single reminder button', `document.querySelector('#phone-timing-offer [data-action=trip-reminder]').textContent==='Remind me 2 days before this trip'&&!!document.querySelector('#phone-timing-offer [data-action=trip-plans]')&&!!document.querySelector('#phone-timing-offer [data-action=trip-reminder]')`);
  await click('#phone-timing-confirm [data-action=confirm-trip-reminder]');
  await check('Reminder retains Free and one status entry across the trip list', `tripReminders.has('london')&&!timingProActive&&document.querySelector('#phone-timing-saved').textContent.includes('Live updates off')&&document.querySelector('#phone-timing-saved').textContent.includes('Pro reminder · 6 Oct')&&document.querySelectorAll('#phone-timing-saved [data-account-status]').length===1`);
  await screenshot('previews/timing-saved.png', await rect('#phone-timing-saved'));
  await overview('multiple-trips-reminder-set.png', 'timing');
  await click('[data-action=timing-due]');
  await check('An opted-in due reminder reuses the same compact status position', `document.querySelectorAll('#phone-timing-saved [data-account-status]').length===1&&!!document.querySelector('#phone-timing-saved [data-due-reminder]')&&document.querySelector('#phone-timing-saved').textContent.includes('London in 2 days')&&!document.querySelector('#phone-timing-saved [data-large-intro]')`);
  await screenshot('previews/timing-due.png', await rect('#phone-timing-saved'));
  await click('#phone-return .journey-group[data-trip=london]');
  await click('[data-action=home-card-reset]');
  await click('#phone-return [data-action=hide-home-card]');
  await check('An explicitly requested reminder never restores a hidden home card', `!document.querySelector('#phone-return [data-account-status]')&&!document.querySelector('#phone-timing-saved [data-account-status]')&&!!document.querySelector('#phone-inbound [data-trip-reminder-due]')&&!!document.querySelector('#phone-inbound [data-trip-status]')`);
  await screenshot('previews/reminder-in-trip-details.png', await rect('#phone-inbound'));
  await click('[data-action=home-card-reset]'); await panel('timing');

  await click('#phone-timing-saved [data-action=dismiss-due]');
  await click('[data-action=timing-due]');
  await check('Dismissed reminder cannot automatically reappear', `!document.querySelector('#phone-timing-saved [data-due-reminder]')&&tripReminders.size===0`);
  await check('Within two days no past reminder can be created', `!document.querySelector('#phone-timing-offer [data-action=trip-reminder]')&&!document.querySelector('#phone-timing-confirm [data-action=confirm-trip-reminder]')&&document.querySelector('#phone-timing-offer').textContent.includes('You’re flying soon.')`);
  await screenshot('previews/timing-soon.png', await rect('#phone-timing-offer'));
  await click('[data-action=timing-reset]');
  await click('#phone-timing-offer [data-action=trip-plans]');
  await check('Plans keep the selected trip and offer a route back to timing', `document.querySelector('#dialog-body').textContent.includes('London trip')&&document.querySelector('#dialog-body').textContent.includes('across your flights')&&!!document.querySelector('#dialog [data-action=trip-reminder]')&&document.querySelector('#dialog [data-plan=monthly]').getAttribute('aria-pressed')==='true'`);
  await screenshot('previews/timing-plans.png', await rect('#dialog'));
  await click('#dialog [data-action=trip-reminder]');
  await click('#close-dialog');
  await check('Closing an unconfirmed reminder schedules nothing', `tripReminders.size===0&&!timingProActive`);
  await click('#phone-timing-confirm [data-action=confirm-trip-reminder]');
  await click('[data-action=timing-active]');
  await check('Account Pro cancels acquisition reminders and hides timing upsells', `tripReminders.size===0&&!document.querySelector('#timing [data-action=trip-offer],#timing [data-action=trip-plans],#timing [data-action=trip-reminder]')&&document.querySelector('#phone-timing-saved').textContent.includes('Pro active')`);
  await screenshot('previews/timing-active.png', await rect('#phone-timing-saved'));
  await click('[data-action=timing-reset]');
  await click('#phone-timing-confirm [data-action=confirm-trip-reminder]');
  await click('#phone-timing-offer [data-action=trip-plans]');
  await click('#dialog [data-action=purchase]');
  await click('#close-dialog');
  await check('The purchase-success preview activates account Pro and clears reminders', `timingProActive&&tripReminders.size===0&&!document.querySelector('#phone-timing-saved [data-action=trip-offer]')`);
  await click('[data-action=timing-reset]');


  await panel('claims');
  await overview('claims-and-pro.png', 'claims');
  for (const name of ['check', 'gate', 'active']) await screenshot(`previews/claim-${name}.png`, await rect('#phone-claim-' + name));
  await click('#phone-claim-gate [data-action=claim-paywall]');
  await check('Claim processing offer is Pro and retains the correct flight context', `document.querySelector('#dialog-body').textContent.includes('Prepare this claim with Pro.')&&document.querySelector('#dialog-body').textContent.includes('12 June')`);
  await screenshot('previews/claim-offer.png', await rect('#dialog'));
  await click('#dialog [data-action=purchase]');
  await check('Claim purchase resumes review without automatic filing', `document.querySelector('#dialog-body').textContent.includes('Review the letter')&&!!document.querySelector('#dialog [data-action=claim-return]')`);
  await click('#dialog [data-action=claim-return]');
  await evaluate(`document.querySelector('#eligibility-policy').value='all-pro';document.querySelector('#eligibility-policy').dispatchEvent(new Event('change'))`);
  await check('All-Pro alternative labels unchecked eligibility honestly', `document.querySelector('#phone-claim-gate').textContent.includes('Not checked')&&!document.querySelector('#phone-claim-gate').textContent.includes('Not eligible')&&!document.querySelector('#phone-claim-check [data-action=manual-check]')`);
  await overview('claims-all-pro-alternative.png', 'claims');
  await evaluate(`document.querySelector('#eligibility-policy').value='manual-free';document.querySelector('#eligibility-policy').dispatchEvent(new Event('change'))`);
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const name of ['prompts', 'timing', 'claims', 'options', 'family', 'plans', 'rules']) {
      await panel(name);
      if (name === 'options') await select('upcoming');
      await check(`${width}px / ${name}: no page or phone horizontal overflow`, `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('#${name} .screen')].every(p=>p.scrollWidth<=p.clientWidth+1)`);
    }
    if (width === 390) { await panel('options'); await screenshot('previews/mobile-canvas.png', { x: 0, y: 0, width, height: 1000 }); }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
  await panel('options'); await select('upcoming');
  await check('No browser runtime errors', JSON.stringify(errors.length === 0));
  await writeFile(path.join(dir, 'review.json'), JSON.stringify({ reviewed: '2026-09-23', scope: 'Design preview only; no native app or backend tests.', checks, runtimeErrors: errors }, null, 2) + '\n');
  const nodes = [
    { id: 'intro', type: 'text', x: 0, y: -270, width: 1260, height: 230, text: '# Free to remember. Pro when you travel.\n\nFree: past/upcoming flights, following, reading postcards, receiving a Pro traveller’s shared live updates. Pro: live monitoring, postcard publishing and claim processing. One large introduction per account, then compact entries; allow permanent home dismissal and use the same Live updates off card in trip details.\n\nRecommendation: A as entry, B to explain, C as an optional reminder. Canvas proposal only. Open design/free-and-pro/canvas.html for interactions and the complete product scope.' },
  ];
  for (const [i, [name, title, note]] of [
    ['a', 'A · One-time introduction', 'First meaningful exposure only; later visits and new trips stay compact.'],
    ['b', 'B · New explanation sheet', 'Reached from A. Open flow.html for the clarified placement.'],
    ['c', 'C · Closer to departure', 'Choose a reminder; subscribe only when ready.'],
  ].entries()) {
    nodes.push({ id: 'label-' + name, type: 'text', x: i * 440, y: 0, width: 400, height: 110, text: `## ${title}\n\n${note}` });
    nodes.push({ id: 'option-' + name, type: 'file', file: `design/free-and-pro/previews/option-${name}.png`, x: i * 440, y: 130, width: 400, height: 880 });
  }
  const rows = [
    ['family', 'A free parent receives', 'Live updates funded by the traveller; free reading and replies.'],
    ['post', 'Publishing is Pro', 'Preserve the draft through purchase or dismissal.'],
    ['history', 'Existing postcards remain free', 'Add a clear path to earlier postcards.'],
    ['plan', 'Start close to travel', 'Monthly first; all prices in this board are illustrative.'],
    ['cancel', 'Renewal cancelled', 'Access remains through the verified expiry date.'],
    ['expired', 'Free account continues', 'Keep history and followers. Stop fresh monitoring and publishing.'],
  ];
  for (const [i, [name, title, note]] of rows.entries()) {
    const x = (i % 3) * 440, y = 1110 + Math.floor(i / 3) * 1110;
    nodes.push({ id: 'label-' + name, type: 'text', x, y, width: 400, height: 110, text: `## ${title}\n\n${note}` });
    nodes.push({ id: 'screen-' + name, type: 'file', file: `design/free-and-pro/previews/${name}.png`, x, y: y + 130, width: 400, height: 880 });
  }
  nodes.push({ id: 'scope', type: 'text', x: 0, y: 3380, width: 1260, height: 560, text: '## Required changes\n\n1. Explicit owner-monitoring, author-publishing and follower-reading capabilities.\n2. Remove three-follower monetization from server and UI.\n3. Separate free saving/import from paid live data and polling.\n4. Keep authorised follower access free; share provider work.\n5. Gate publishing server-side; preserve drafts and private photos.\n6. Contextual trip prompts, suppression and opt-in reminders.\n7. Clear cancellation/expiry/restore and retained history.\n8. Update remote paywall, onboarding, web, stores and support.\n9. Plan existing-user transition, active-flight grace and Galaxy billing exception.\n10. Validate free family access, expiry, privacy, old clients and provider cost.\n\nClaim processing stays Pro. Compare manual-free versus all-Pro eligibility in the Claims panel. Large introduction once per account; use the Live updates off card in trip details after home dismissal. Decide postcard window and migration/grace. Seats are saved details, not a supported automatic alert.\n\nSee design/free-and-pro/README.md for source audit, boundaries, rollout and acceptance.' });
  await writeFile(path.join(dir, 'free-and-pro.canvas'), JSON.stringify({ nodes, edges: [] }, null, 2) + '\n');
  // The follow-up canvas clarifies the placement of the proposed explanation.
  const flowChecks = [];
  const flowCheck = async (label, expression) => { const pass = !!(await evaluate(expression)); flowChecks.push({ label, pass }); if (!pass) throw new Error(`Flow preview check failed: ${label}`); };
  const flowShot = async (file, selector = '#flow-phone') => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...await rect(selector), scale: 1 } });
    await writeFile(path.join(dir, file), Buffer.from(r.data, 'base64'));
  };
  await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'flow.html')).href });
  await new Promise(resolve => setTimeout(resolve, 200));
  await evaluate('document.fonts.ready');
  await flowCheck('Default view explicitly labels the explanation as a new sheet', `step===3&&document.querySelector('#explanation').textContent.includes('No. The app has trip details')&&!!document.querySelector('#flow-phone .benefit-sheet')`);
  await flowShot('previews/flow-step-3.png');
  for (const n of [1, 2, 4, 5]) {
    await click(`[data-step="${n}"]`);
    await flowShot(`previews/flow-step-${n}.png`);
  }
  await click('#restart');
  await click('#flow-phone [data-action=save]');
  await flowCheck('Saving returns to the free trip without opening a sheet', `step===2&&!document.querySelector('#flow-phone .benefit-sheet')&&document.querySelector('#flow-phone').textContent.includes('See Pro for this trip')`);
  await click('#return-visit');
  await flowCheck('Later visit uses compact entry even without explicit dismissal', `introSeen&&document.querySelector('#flow-phone').textContent.includes('Live updates off')&&!document.querySelector('#flow-phone').textContent.includes('Keep this trip up to date.')`);
  await click('[data-step="1"]'); await click('#flow-phone [data-action=save]');
  await flowCheck('Another saved trip does not reset the account introduction', `introSeen&&document.querySelector('#flow-phone').textContent.includes('Live updates off')`);
  await click('#flow-phone [data-action=explain]');
  await flowCheck('Only the Pro entry opens the explanation', `step===3&&!!document.querySelector('#flow-phone .benefit-sheet')`);
  await click('#flow-phone .benefit-sheet [data-action=decline]');
  await flowCheck('Declining returns to saved trip and collapses the offer', `step===2&&declined&&!document.querySelector('#flow-phone .benefit-sheet')&&document.querySelector('#flow-phone').textContent.includes('Live updates off')`);
  await flowShot('previews/flow-declined.png');
  await click('#flow-phone [data-action=explain]');
  await click('#flow-phone .benefit-sheet [data-action=plans]');
  await flowCheck('Plans follow an explicit See plans tap', `step===4&&!!document.querySelector('#flow-phone [data-plan=monthly]')`);
  await click('#flow-phone [data-action=subscribe]');
  await flowCheck('Subscribe requests store confirmation before Pro is active', `step===4&&storeOpen&&!subscribed`);
  await click('#flow-phone [data-action=cancel-store]');
  await flowCheck('Cancelling store purchase remains on plans', `step===4&&!storeOpen&&!subscribed`);
  await click('#flow-phone [data-action=subscribe]');
  await click('#flow-phone [data-action=purchase-failed]');
  await flowCheck('Failed purchase preserves the free state', `step===4&&!subscribed&&document.querySelector('#flow-phone').textContent.includes('Purchase not completed')`);
  await click('#flow-phone [data-action=subscribe]');
  await click('#flow-phone [data-action=confirm]');
  await flowCheck('Confirmed purchase returns to the same trip with honest future coverage', `step===5&&subscribed&&document.querySelector('#flow-phone').textContent.includes('Pro active')&&document.querySelector('#flow-phone').textContent.includes('supported window')`);
  for (const value of ['past', 'follower', 'pro']) {
    await evaluate(`document.querySelector('#case').value=${JSON.stringify(value)};document.querySelector('#case').dispatchEvent(new Event('change'))`);
    await flowCheck(`${value} has no explanation or acquisition button`, `!document.querySelector('#flow-phone .benefit-sheet,#flow-phone [data-action=explain],#flow-phone [data-action=subscribe]')`);
  }
  await click('[data-step="3"]');
  const walkthroughRect = await rect('.flow-stage');
  const captureWhole = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: Math.ceil(walkthroughRect.y + walkthroughRect.height + 24), scale: 1 } });
    await writeFile(path.join(dir, file), Buffer.from(r.data, 'base64'));
  };
  await captureWhole('flow-walkthrough.png');
  await click('#compare');
  const compareRect = await rect('#all-screens');
  const compareCapture = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: Math.ceil(compareRect.y + compareRect.height + 16), scale: 1 } });
    await writeFile(path.join(dir, file), Buffer.from(r.data, 'base64'));
  };
  await compareCapture('flow-overview.png');
  await click('#theme'); await compareCapture('flow-overview-dark.png'); await click('#theme');
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    for (const view of ['walk', 'compare']) {
      await click('#' + view);
      await flowCheck(`${width}px / ${view}: no horizontal overflow`, `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('${view==='walk'?'#flow-phone':'#all-screens'} .screen,${view==='walk'?'#flow-phone':'#all-screens'} .sheet-body')].every(e=>e.scrollWidth<=e.clientWidth+1)`);
    }
  }
  await flowCheck('No browser runtime errors', JSON.stringify(errors.length === 0));
  await writeFile(path.join(dir, 'flow-review.json'), JSON.stringify({ reviewed: '2026-09-23', scope: 'Design flow only; no app or backend implementation.', checks: flowChecks, runtimeErrors: errors }, null, 2) + '\n');
  const flowNodes = [{ id: 'intro', type: 'text', x: 0, y: -300, width: 2180, height: 250, text: '# When does “trip readiness” appear?\n\nIt does not exist in the app today. This proposal calls it “What Pro adds to this trip”: a new optional sheet opened only after tapping the saved trip’s Pro card. Existing trip details and the travel-day checklist are different.\n\nExisting: add flight → saved confirmation → Flights; Pro paywall. Proposed: inline Pro card, explanation sheet and travel-focused paywall content. No automatic explanation or checkout after saving. Open design/free-and-pro/flow.html for the interactive flow.' }];
  const stages = [
    ['1', 'Save a flight', 'Existing entry and confirmation. Remains free.'],
    ['2', 'See the saved trip', 'First visit: introduction. Later visits/new trips: compact entry.'],
    ['3', 'What Pro adds to this trip', 'NEW SHEET. This is the earlier option B.'],
    ['4', 'Choose a plan', 'Existing paywall + proposed travel-focused copy.'],
    ['5', 'Return to the same trip', 'After successful store confirmation.'],
  ];
  for (const [index, [number, title, note]] of stages.entries()) {
    flowNodes.push({ id: `step-${number}-label`, type: 'text', x: index * 480, y: 0, width: 400, height: 130, text: `## ${number}. ${title}\n\n${note}` });
    flowNodes.push({ id: `step-${number}`, type: 'file', file: `design/free-and-pro/previews/flow-step-${number}.png`, x: index * 480, y: 160, width: 400, height: 880 });
  }
  flowNodes.push({ id: 'free', type: 'file', file: 'design/free-and-pro/previews/flow-declined.png', x: 960, y: 1330, width: 400, height: 880 }, { id: 'free-label', type: 'text', x: 820, y: 1130, width: 680, height: 150, text: '## Close / Not now / Continue free\n\nReturn to the same saved trip. No lost flight or purchase. Consume the one-time introduction; retain a quiet “See Pro” entry on later visits and new trips. Parents reading someone else’s updates, past-flight logging and active subscribers skip acquisition entirely.' });
  const flowEdges = [
    { id: 'save', fromNode: 'step-1', fromSide: 'right', toNode: 'step-2', toSide: 'left', label: 'Save → brief confirmation' },
    { id: 'learn', fromNode: 'step-2', fromSide: 'right', toNode: 'step-3', toSide: 'left', label: 'Tap “See Pro for this trip”' },
    { id: 'plans', fromNode: 'step-3', fromSide: 'right', toNode: 'step-4', toSide: 'left', label: 'Tap “See plans”' },
    { id: 'purchase', fromNode: 'step-4', fromSide: 'right', toNode: 'step-5', toSide: 'left', label: 'Subscribe → store confirms' },
    ...['2', '3', '4'].map(n => ({ id: `decline-${n}`, fromNode: `step-${n}`, fromSide: 'bottom', toNode: 'free-label', toSide: 'top', label: n==='2'?'Not now':n==='3'?'Not now / close':'Continue free' })),
  ];
  await writeFile(path.join(dir, 'pro-flow.canvas'), JSON.stringify({ nodes: flowNodes, edges: flowEdges }, null, 2) + '\n');
  const revisedNodes = [{ id: 'intro', type: 'text', x: 0, y: -300, width: 1400, height: 240, text: '# Revised Pro prompts and claims\n\nKeep live monitoring, postcard publishing AND claim processing in Pro. Replace the aircraft upsell with Live updates off in trip details; allow permanent home dismissal. Show one large introduction per account, then compact entries even on new trips. No unsolicited near-departure nudge.\n\nOpen design/free-and-pro/canvas.html. Revised prompts, Before take-off and Claims & Pro are the latest proposal. All changes are canvas-only.' }];
  for (const [i, [name, title, note]] of [
    ['first', 'First relevant visit', 'Large introduction once per account; consume after exposure/visit.'],
    ['return', 'Three trips, one status row', 'One home entry with ×. Closing hides it on later visits and trips; Pro stays in trip details.'],
    ['inbound', 'Open Paris, keep Paris', 'Live updates off → a shorter Pro offer for Paris. The reminder date appears in the next step.'],
  ].entries()) {
    revisedNodes.push({ id: 'label-' + name, type: 'text', x: i * 480, y: 0, width: 400, height: 120, text: `## ${title}\n\n${note}` }, { id: 'screen-' + name, type: 'file', x: i * 480, y: 150, width: 400, height: 880, file: `design/free-and-pro/previews/revised-${name}.png` });
  }
  for (const [i, [name, title, note]] of [
    ['check', 'Manual eligibility: recommended free', 'Automatic possible-claim alerts are Pro. The HTML also previews all checks gated.'],
    ['gate', 'Claim preparation: Pro', 'Keep any known verdict; upgrade to prepare the claim.'],
    ['active', 'Return to the claim after purchase', 'Review the same flight and details. No automatic letter sending.'],
  ].entries()) {
    revisedNodes.push({ id: 'claim-label-' + name, type: 'text', x: i * 480, y: 3680, width: 400, height: 120, text: `## ${title}\n\n${note}` }, { id: 'claim-' + name, type: 'file', x: i * 480, y: 3830, width: 400, height: 880, file: `design/free-and-pro/previews/claim-${name}.png` });
  }
  revisedNodes.push({id:'home-closed-label',type:'text',x:1440,y:0,width:400,height:120,text:'## After closing on home\n\nTrips remain. The home card stays hidden across visits and future trips; the same status card remains inside trip details.'},{id:'home-closed',type:'file',x:1440,y:150,width:400,height:880,file:'design/free-and-pro/previews/home-card-dismissed.png'});
  revisedNodes.push({id:'timing-intro',type:'text',x:0,y:1110,width:1400,height:180,text:'# After a Pro tap: choose the timing\n\nFlights defaults to the next owned trip. Details retain the opened trip. Pro is account-wide; reminders are trip-specific. The requested offer includes a single Remind me 2 days before this trip button, with extra separation before Continue free. Open canvas.html → Before take-off to try the interaction.'});
  for (const [i,[name,title,note]] of [
    ['offer','1 · Pro offer','Three short benefits and one reminder button. Continue free is separated by 24px; reminder details follow on the next step.'],
    ['confirm','2 · Confirm reminder','Selected trip, exact date and departure-local time. No purchase.'],
    ['saved','3 · Back to all trips','A small label on the chosen trip; a dismissed home status stays hidden.'],
    ['due','4 · Requested reminder arrives','Use home only while its card remains visible. A requested reminder stays accessible in the trip.'],
    ['plans','Alternative · See plans now','Monthly first, account-wide access, recurring terms. Timing remains reachable.'],
    ['active','After purchase · Pro active','Cancel acquisition reminders. Each flight starts monitoring in its supported window.'],
  ].entries()) {
    const x=(i%3)*480, y=1350+Math.floor(i/3)*1160;
    revisedNodes.push({id:'timing-label-'+name,type:'text',x,y,width:400,height:120,text:`## ${title}\n\n${note}`},{id:'timing-'+name,type:'file',x,y:y+150,width:400,height:880,file:`design/free-and-pro/previews/timing-${name}.png`});
  }
  await writeFile(path.join(dir, 'revised-prompts.canvas'), JSON.stringify({ nodes: revisedNodes, edges: [
    { id:'hide-home',fromNode:'screen-return',fromSide:'bottom',toNode:'home-closed',toSide:'bottom',label:'Tap × → hidden on home permanently'},
    { id:'details-after-close',fromNode:'home-closed',fromSide:'left',toNode:'screen-inbound',toSide:'right',label:'Open a trip → Live updates off'},
    { id:'pro-offer',fromNode:'screen-return',fromSide:'bottom',toNode:'timing-offer',toSide:'left',label:'Tap See Pro → next trip'},
    { id:'detail-offer',fromNode:'screen-inbound',fromSide:'right',toNode:'timing-offer',toSide:'right',label:'Tap Pro → selected trip'},
    { id:'reminder-confirm',fromNode:'timing-offer',fromSide:'right',toNode:'timing-confirm',toSide:'left',label:'Remind me before this trip'},
    { id:'reminder-save',fromNode:'timing-confirm',fromSide:'right',toNode:'timing-saved',toSide:'left',label:'Set reminder · still Free'},
    { id:'reminder-due',fromNode:'timing-saved',fromSide:'bottom',toNode:'timing-due',toSide:'top',label:'Requested reminder is due'},
    { id:'plans-now',fromNode:'timing-offer',fromSide:'bottom',toNode:'timing-plans',toSide:'top',label:'See plans now'},
    { id:'pro-active',fromNode:'timing-plans',fromSide:'right',toNode:'timing-active',toSide:'left',label:'Confirmed purchase'},
    { id: 'first-return', fromNode: 'screen-first', fromSide: 'right', toNode: 'screen-return', toSide: 'left', label: 'Next visit, another trip or dismissal' },
    { id: 'claim-processing', fromNode: 'claim-check', fromSide: 'right', toNode: 'claim-gate', toSide: 'left', label: 'Known result → request claim preparation' },
    { id: 'claim-confirmed', fromNode: 'claim-gate', fromSide: 'right', toNode: 'claim-active', toSide: 'left', label: 'Confirmed Pro → review claim' },
  ] }, null, 2) + '\n');
  console.log(JSON.stringify({ flowChecks: flowChecks.length, passed: flowChecks.every(c => c.pass) }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, passed: checks.every(c => c.pass), runtimeErrors: errors }, null, 2));
} finally { ws.close(); }
