// Local design-preview state only. Nothing is scheduled, purchased or persisted.
const previewTrips = {
  london: { name: 'London', code: 'LHR', flight: 'AY1331', dates: '8–12 Oct', depart: '8 October · 08:00', out: '8 Oct', back: '12 Oct', month: 'OCT', day: '6', remind: '6 October · 08:00', short: '6 Oct' },
  paris: { name: 'Paris', code: 'CDG', flight: 'AY1571', dates: '21–23 Nov', depart: '21 November · 08:00', out: '21 Nov', back: '23 Nov', month: 'NOV', day: '19', remind: '19 November · 08:00', short: '19 Nov' },
  tokyo: { name: 'Tokyo', code: 'HND', flight: 'AY061', dates: '15–26 Jan', depart: '15 January · 08:00', out: '15 Jan', back: '26 Jan', month: 'JAN', day: '13', remind: '13 January · 08:00', short: '13 Jan' },
};
let chosenTrip = 'london', detailTrip = 'paris', timingSoon = false, timingProActive = false, offerEntry = 'list', tripPlanActive = false, dueTrip = null, homeCardHidden = false;
const tripReminders = new Set();
const selectedTrip = () => previewTrips[chosenTrip];
const tripLabel = () => `${selectedTrip().name} trip · HEL → ${selectedTrip().code} · ${selectedTrip().out}`;
function tripOptions(id) { return Object.entries(previewTrips).map(([key, t]) => `<option value="${key}" ${key === id ? 'selected' : ''}>${t.name} · ${t.dates}</option>`).join(''); }
function tripGroup(id, saved = tripReminders.has(id)) {
  const t = previewTrips[id];
  return `<button class="journey-group" data-action="open-trip-detail" data-trip="${id}" aria-label="Open ${t.name} trip details"><span class="journey-band"><strong>${t.name} trip</strong><span>${t.dates} <span aria-hidden="true">›</span></span></span><span class="journey-leg"><code>HEL → ${t.code}</code><span>${t.out} · 08:00</span></span><span class="journey-leg"><code>${t.code} → HEL</code><span>${t.back} · Return</span></span>${saved && !timingProActive ? `<span class="journey-reminder">Pro reminder · ${t.short}</span>` : ''}</button>`;
}
function multiTripStatus() {
  if (timingProActive) return `<div class="active-note" data-account-status><strong>Pro active</strong><div class="micro">Monitoring is included while Pro is active.<br>Each flight starts within its supported window.</div></div>`;
  if (homeCardHidden) return '';
  if (dueTrip && tripReminders.has(dueTrip)) return `<div class="active-note live-off" data-account-status data-due-reminder><div class="live-off-copy"><strong>${previewTrips[dueTrip].name} in 2 days</strong><div class="micro">Your requested Pro reminder.<br>Live updates off. <button class="link-button inline-action" data-action="dismiss-due">Dismiss</button></div></div><button class="link-button" style="width:auto;white-space:nowrap" data-action="trip-offer" data-trip="${dueTrip}" data-entry="list">See Pro</button><button class="card-close" data-action="hide-home-card" aria-label="Hide live updates card from home">×</button></div>`;
  const count = tripReminders.size;
  return liveUpdatesEntry('london', true, count);
}
function liveUpdatesEntry(id, home = false, reminderCount = 0) {
  return `<div class="active-note live-off" ${home ? 'data-account-status' : 'data-trip-status'}><div class="live-off-copy"><strong>Live updates off</strong><div class="micro">${home ? 'For your upcoming flights' : 'For this trip'}${home && reminderCount ? `<br>${reminderCount} Pro reminder${reminderCount === 1 ? '' : 's'} set` : ''}</div></div><button class="link-button live-off-pro" data-action="trip-offer" data-trip="${id}" data-entry="${home ? 'list' : 'details'}">See Pro</button>${home ? '<button class="card-close" data-action="hide-home-card" aria-label="Hide live updates card from home" title="Hide from home">×</button>' : ''}</div>`;
}
function tripDetailsBody(id) {
  const t = previewTrips[id];
  return `<div class="card compact"><div class="row"><strong>${t.name} trip</strong><code>${t.flight}</code></div><div class="route"><div class="airport"><strong>HEL</strong><span>Helsinki</span></div><div class="route-line"></div><div class="airport"><strong>${t.code}</strong><span>${t.name}</span></div></div><p class="caption">${t.depart} · Saved schedule</p><div class="flight-note">${timingProActive ? 'Pro active · Monitoring starts closer to departure' : 'Your saved details stay available'}</div></div>${timingProActive ? '<div class="active-note">Live flight details will appear when available.</div>' : liveUpdatesEntry(id)}${tripReminders.has(id) && !timingProActive ? `<div class="micro" ${dueTrip === id ? 'data-trip-reminder-due' : ''}>${dueTrip === id ? 'Your Pro reminder · Flying in 2 days' : 'Pro reminder set · ' + t.short} <button class="link-button inline-action" data-action="${dueTrip === id ? 'dismiss-due' : 'manage-trip-reminder'}" data-trip="${id}">${dueTrip === id ? 'Dismiss' : 'Manage'}</button></div>` : ''}<div class="card compact"><h3>Your boarding pass</h3><div class="detail-row"><span>Seat</span><code>12A</code></div><div class="detail-row"><span>Notes & private photos</span><span class="state">Available</span></div></div>`;
}
function closerCard(id) {
  const t = previewTrips[id], saved = tripReminders.has(id);
  if (timingSoon) return '<p class="caption timing-soon">You’re flying soon. Choose Pro when you’re ready.</p>';
  return `<button class="timing-choice" data-action="${saved ? 'manage-trip-reminder' : 'trip-reminder'}" data-trip="${id}">${saved ? 'Manage reminder' : 'Remind me 2 days before this trip'}</button>`;
}
function journeyOfferMarkup(id, dialog = false, source = 'list') {
  const t = previewTrips[id];
  return `<div class="offer-content"><p class="micro">${t.name} trip · ${t.dates}</p><h${dialog ? '2 id="dialog-title"' : '3'}>What Pro adds</h${dialog ? '2' : '3'}><ul class="features"><li>Live gate, terminal, delay & belt updates</li><li>Postcards for your people</li><li>Delay claim preparation</li></ul><p class="micro">Updates where available. Family follows free.</p><button class="primary" data-action="trip-plans" data-trip="${id}">See plans</button>${closerCard(id)}<button class="link-button quiet-button" data-action="${dialog ? 'close' : 'timing-continue-free'}">Continue free</button></div>`;
}
function reminderMarkup(id, dialog = false) {
  const t = previewTrips[id], saved = tripReminders.has(id);
  return `<span class="pill">${saved ? 'Reminder set' : 'Your travel, your timing'}</span><h${dialog ? '2 id="dialog-title"' : '3'}>${saved ? 'You’re still on Free.' : 'Remind me before take-off.'}</h${dialog ? '2' : '3'}><p class="caption">${t.name} trip · HEL → ${t.code}<br>Departs ${t.depart} · Helsinki time</p><div class="card compact"><div class="cal"><div class="cal-day"><span>${t.month}</span><strong>${t.day}</strong></div><div><strong>${t.remind}</strong><div class="micro">Helsinki time · 2 days before</div></div></div><p class="caption">One reminder with this trip in FlyRight. It also appears on home if you haven’t hidden the card.</p></div><p class="micro" style="margin-top:16px">Live updates stay off until you subscribe. We never start or charge for Pro automatically.</p><div class="button-stack"><button class="primary" data-action="${saved ? 'trip-plans' : 'confirm-trip-reminder'}" data-trip="${id}">${saved ? 'See Pro plans now' : 'Set reminder'}</button><button class="link-button quiet-button" data-action="${saved ? 'remove-trip-reminder' : 'close'}" data-trip="${id}">${saved ? 'Cancel reminder' : 'Not now'}</button></div><p class="micro">Optional push delivery would need a separate opt-in and notification permission.</p>`;
}
function openTripOffer(id = 'london', source = 'list') {
  chosenTrip = id; offerEntry = source; tripPlanActive = false; introConsumed = true; readinessOpen = false;
  context = 'trip';
  renderRefined(); renderTiming();
  openDialog(journeyOfferMarkup(id, true, source));
}
function openTripPlans(id) {
  chosenTrip = id; tripPlanActive = true; plan = 'monthly'; context = 'trip';
  openDialog(planCopy(true));
}
function renderTiming() {
  $('#timing-trip').value = chosenTrip;
  $('#timing-window').value = timingSoon ? 'soon' : 'later';
  phone('phone-timing-offer', 'FlyRight Pro', 'Opened by your Pro tap', journeyOfferMarkup(chosenTrip));
  phone('phone-timing-confirm', timingSoon ? 'Flying soon' : 'Pro reminder', selectedTrip().name + ' trip', timingSoon ? `<div class="card compact"><h3>The reminder time has passed.</h3><p class="caption">Choose Pro now for ${selectedTrip().name}, or keep using Free. No reminder is created automatically.</p><div class="button-stack"><button class="primary" data-action="trip-plans" data-trip="${chosenTrip}">See plans</button><button class="link-button quiet-button" data-action="timing-continue-free">Continue free</button></div></div>` : reminderMarkup(chosenTrip));
  phone('phone-timing-saved', 'Flights', '3 upcoming trips · 6 flights', multiTripStatus() + Object.keys(previewTrips).map(id => tripGroup(id)).join(''));
  if (timingProActive) {
    phone('phone-timing-offer', 'FlyRight Pro', 'Account access is active', `<div class="card"><span class="pill">Pro active</span><h3>Your flights are covered while Pro is active.</h3><p class="caption">Monitoring starts within each flight’s supported window. Your family follows for free.</p></div>`);
    phone('phone-timing-confirm', 'Pro reminder', 'No acquisition reminder needed', `<div class="active-note"><strong>Reminders cancelled</strong><p class="caption" style="margin-top:8px">Pro is active. We won’t remind you to subscribe or revive these reminders after expiry.</p></div>`);
  }
  for (const id of ['phone-timing-offer', 'phone-timing-confirm']) {
    const top = document.querySelector('#' + id + ' .app-top');
    top.innerHTML = '<span class="micro">FlyRight</span><button class="close" aria-label="Close offer" data-action="timing-continue-free">×</button>';
  }
  $('#timing-state').textContent = timingProActive ? 'Preview: Pro is active for the account. No acquisition prompt; reminders are cancelled.' : tripReminders.size ? `Preview: ${[...tripReminders].map(id => previewTrips[id].name).join(', ')} reminder set. Live updates remain off.` : 'Try it: choose a trip, then Set reminder. The trip gets a reminder label. A hidden home card stays hidden.';
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.action, id = b.dataset.trip || chosenTrip;
  if (a === 'trip-offer') openTripOffer(id, b.dataset.entry || 'list');
  else if (a === 'hide-home-card') { homeCardHidden = true; introConsumed = true; renderRefined(); renderTiming(); toast('Hidden from home. Pro is still available in trip details.'); }
  else if (a === 'home-card-reset') { homeCardHidden = false; renderRefined(); renderTiming(); }
  else if (a === 'open-trip-detail') { detailTrip = id; renderRefined(); showPanel('prompts'); $('#phone-inbound').scrollIntoView({ block: 'center', behavior: 'auto' }); }
  else if (a === 'trip-plans') openTripPlans(id);
  else if (a === 'trip-reminder' || a === 'manage-trip-reminder') {
    chosenTrip = id;
    if (timingSoon && !tripReminders.has(id)) { toast('Preview: the 2-day reminder window has passed. Choose Pro now or continue free.'); return; }
    openDialog(reminderMarkup(id, true));
  } else if (a === 'confirm-trip-reminder') {
    if (timingSoon || timingProActive) return;
    tripReminders.add(id); chosenTrip = id; closeDialog(); renderRefined(); renderTiming();
    toast(`Preview: ${previewTrips[id].name} reminder saved. Still on Free; no notification scheduled.`);
  } else if (a === 'remove-trip-reminder') {
    tripReminders.delete(id); if (dueTrip === id) dueTrip = null; closeDialog(); renderRefined(); renderTiming(); toast('Preview: reminder cancelled.');
  } else if (a === 'timing-continue-free') { closeDialog(); toast('Preview: your flights stay saved. No subscription or reminder created.'); }
  else if (a === 'timing-active') { timingProActive = true; tripReminders.clear(); dueTrip = null; renderRefined(); renderTiming(); }
  else if (a === 'timing-due') { if (!tripReminders.size) { toast('Set a reminder first. No unsolicited reminder is shown.'); return; } dueTrip = tripReminders.has(chosenTrip) ? chosenTrip : [...tripReminders][0]; timingSoon = true; renderRefined(); renderTiming(); }
  else if (a === 'dismiss-due') { tripReminders.delete(dueTrip); dueTrip = null; renderRefined(); renderTiming(); }
  else if (a === 'timing-reset') { timingProActive = false; timingSoon = false; tripReminders.clear(); dueTrip = null; chosenTrip = 'london'; renderRefined(); renderTiming(); }
});
$('#timing-trip').addEventListener('change', e => { chosenTrip = e.target.value; offerEntry = 'list'; renderTiming(); });
$('#timing-window').addEventListener('change', e => { timingSoon = e.target.value === 'soon'; renderTiming(); });
