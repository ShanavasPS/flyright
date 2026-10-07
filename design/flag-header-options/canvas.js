const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readPreference = key => { try { return localStorage.getItem('flyright-compact-headers-' + key); } catch { return null; } };
const savePreference = (key, value) => { try { localStorage.setItem('flyright-compact-headers-' + key, value); } catch { /* The canvas also works with storage disabled. */ } };
const state = { view: 'all', scenario: 'upcoming', theme: readPreference('theme') === 'light' ? 'light' : 'dark', strength: 30, large: false, pick: readPreference('pick') };

const directions = [
  { id: 'a', number: '01', name: 'Right fade', descriptor: 'A little flag at the right, fading into the title band.', recommended: true,
    headline: 'A small change to the existing header.',
    detail: 'The trip name and dates share one compact row. A faded country flag appears at the right edge. All flight cards remain directly underneath.',
    points: [['48-pixel title band', 'A short name and its dates fit on one line, using 16-pixel title text. Longer content wraps only when needed.'], ['The flights stay visible', 'A one-way trip still shows its complete flight card. There are no collapsing headers or summary-only states.'], ['A quiet destination cue', 'The country artwork is part of the background. The separate flag icon is removed.']] },
  { id: 'b', number: '02', name: 'Soft wash', descriptor: 'A faint flag across the same compact title band.',
    headline: 'A softer wash across the header.',
    detail: 'The country flag fills the small title band at low opacity. A protective fade keeps the name readable. The header height and flight cards are identical to the other options.',
    points: [['The same footprint', '48 pixels for ordinary names and dates. There is no additional destination label, flight count or expanded title area.'], ['Low-contrast artwork', 'The flag reads as a subtle background wash. The intensity slider lets you make it quieter.'], ['Full cards for every flight', 'Single flights, return flights and connections all keep their normal rows below the header.']] },
  { id: 'c', number: '03', name: 'Corner fade', descriptor: 'A small angled flag crop tucked into the right corner.',
    headline: 'Just a hint of country in the corner.',
    detail: 'A feathered diagonal reveals the flag only near the right edge. The rest of the title band stays calm, with the same one-line name and dates.',
    points: [['A smaller flag area', 'The artwork occupies the right part of the background and fades toward the text.'], ['Existing card structure', 'The enclosing border, flight rows, stays and connections use the same layout in all four options.'], ['Easy to compare', 'Switch between directions to judge only the flag treatment, without changing the trip structure.']] },
  { id: 'd', number: '04', name: 'Lower fade', descriptor: 'A faint flag rising from the lower edge of the header.',
    headline: 'Colour at the edge, space for the text.',
    detail: 'The flag fades upward from the bottom of the compact title band. This gives the header a softer edge while keeping the destination and date on one row.',
    points: [['A vertical fade', 'The flag is most visible at the lower edge and disappears toward the top.'], ['Always a full itinerary', 'Every flight stays visible in the list, including single-flight destination groups. Scroll through the full trip as usual.'], ['Grouping stays familiar', 'Multi-country trips retain their existing flat groups and travel order. A resumed stay appears before the flight home.']] },
];

const cities = { HEL: 'Helsinki', LHR: 'London', ARN: 'Stockholm', LAS: 'Las Vegas', HND: 'Tokyo', JFK: 'New York', LGA: 'New York', YYZ: 'Toronto', BOS: 'Boston', VIE: 'Vienna', SJJ: 'Sarajevo', TBS: 'Tbilisi' };
const airlines = { AY: 'Finnair', BA: 'British Airways', AC: 'Air Canada', OS: 'Austrian' };
const flight = (id, number, from, to, date, depart, arrive, duration) => ({ type: 'flight', id, number, from, to, date, depart, arrive, duration });
const stay = (days, place) => ({ type: 'stay', days, place });
const connection = (duration, place) => ({ type: 'connection', duration, place });
const uk = { id: 'uk', title: 'UK trip', country: 'GB', place: 'London', dates: '8–10 Oct', kind: 'Round trip', route: 'HEL → LHR → HEL', entries: [flight('uk-out','AY1337','HEL','LHR','8 Oct','16.00','17.05','3h 05m'),stay(2,'London'),flight('uk-back','AY1338','LHR','HEL','10 Oct','18.10','23.00','2h 50m')] };
const usa = { id: 'us-vegas', title: 'US trip', country: 'US', place: 'Las Vegas', dates: '28 Nov', kind: 'With connections', route: 'HEL → ARN → LHR → LAS', entries: [flight('vegas-1','AY801','HEL','ARN','28 Nov','07.00','07.10','1h 10m'),connection('4h 20m','Stockholm'),flight('vegas-2','BA777','ARN','LHR','28 Nov','11.30','13.25','2h 55m'),connection('2h 40m','London'),flight('vegas-3','BA275','LHR','LAS','28 Nov','16.05','18.55','10h 50m')] };
const japan = { id: 'japan', title: 'Japan trip', country: 'JP', place: 'Tokyo', dates: '12 Dec', kind: 'One way', route: 'HEL → HND', entries: [flight('japan-out','AY61','HEL','HND','12 Dec','18.30','14.25 +1','12h 55m')] };
const multi = [
  { id: 'us-first', title: 'US trip', country: 'US', place: 'New York', dates: '1–10 Jun', kind: 'First destination', route: 'HEL → JFK', entries: [flight('us-out','AY5','HEL','JFK','1 Jun','14.00','15.55','8h 55m'),stay(9,'the US')] },
  { id: 'canada', title: 'Canada trip', country: 'CA', place: 'Toronto', dates: '10–14 Jun', kind: 'Next destination', route: 'LGA → YYZ → BOS', entries: [flight('ca-out','AC701','LGA','YYZ','10 Jun','10.00','11.40','1h 40m'),stay(4,'Canada'),flight('ca-back','AC770','YYZ','BOS','14 Jun','14.00','15.40','1h 40m')] },
  { id: 'us-continued', title: 'US trip continued', country: 'US', place: 'Boston', dates: '14–24 Jun', kind: 'Return visit', route: 'BOS → HEL', entries: [stay(9,'the US'),flight('us-home','AY8','BOS','HEL','23 Jun','18.00','08.00 +1','7h')] },
];
const edge = [
  { id: 'long', title: 'Bosnia and Herzegovina trip', country: 'BA', place: 'Sarajevo', dates: '28 Dec 2026 – 8 Jan 2027', kind: 'Round trip', route: 'HEL → VIE → SJJ → HEL', entries: [flight('ba-1','AY1471','HEL','VIE','28 Dec','09.30','11.00','2h 30m'),connection('2h 15m','Vienna'),flight('ba-2','OS757','VIE','SJJ','28 Dec','13.15','14.25','1h 10m'),stay(11,'Sarajevo'),flight('ba-3','AY1938','SJJ','HEL','8 Jan','15.00','19.00','3h')] },
  { id: 'unknown', title: 'Trip to TBS', country: null, place: 'Tbilisi', dates: '12 Feb', kind: 'One way', route: 'HEL → TBS', entries: [flight('unknown-1','AY1991','HEL','TBS','12 Feb','13.00','18.35','3h 35m')] },
];
const scenarios = {
  upcoming: { groups: [uk, japan], label: 'Upcoming trips', description: 'A return trip and a single flight. Every flight card stays visible below its compact header.' },
  oneway: { groups: [japan], label: 'Upcoming trip', description: 'One flight, shown as a complete card with its route, date, airline and times.' },
  connections: { groups: [usa], label: 'Upcoming trip', description: 'Three flights, one US group. Stockholm and London stay as connections, with their own times between flights.' },
  multi: { groups: multi, label: 'Upcoming journey', description: 'US → Canada → US continued. Every flight stays in the list; the resumed US stay comes before the final flight home.' },
  edge: { groups: edge, label: 'Upcoming trips', description: 'Long names and dates wrap when needed. A missing country gets a plain header and its full flight card.' },
};

function flagSvg(country) {
  let shapes = '';
  if (country === 'GB') shapes = '<rect width="600" height="300" fill="#012169"/><path d="M0 0L600 300M600 0L0 300" stroke="white" stroke-width="60"/><path d="M0 0L300 150M300 150L600 300M600 0L300 150M300 150L0 300" stroke="#C8102E" stroke-width="24"/><path d="M300 0V300M0 150H600" stroke="white" stroke-width="100"/><path d="M300 0V300M0 150H600" stroke="#C8102E" stroke-width="60"/>';
  if (country === 'US') {
    shapes = '<rect width="600" height="300" fill="white"/>' + Array.from({length:7},(_,i)=>`<rect y="${i*46.154}" width="600" height="23.077" fill="#B31942"/>`).join('') + '<rect width="240" height="161.54" fill="#0A3161"/>';
    for(let row=0;row<9;row++) for(let col=0;col<(row%2?5:6);col++) { const x=20+col*40+(row%2?20:0),y=10+row*17.7; const points=Array.from({length:10},(_,j)=>{const a=-Math.PI/2+j*Math.PI/5,r=j%2?3:7;return `${x+Math.cos(a)*r},${y+Math.sin(a)*r}`}).join(' ');shapes+=`<polygon points="${points}" fill="white"/>`; }
  }
  if (country === 'CA') shapes = '<rect width="600" height="300" fill="white"/><path fill="#D80621" d="M0 0H150V300H0ZM450 0H600V300H450Z"/><path fill="#D80621" d="M300 52l-16 31-18-9 10 66-27-24-9 13-27-7 10 31-12 7 64 50-6 20 27-5-2 41h12l-2-41 27 5-6-20 64-50-12-7 10-31-27 7-9-13-27 24 10-66-18 9z"/>';
  if (country === 'JP') shapes = '<rect width="600" height="300" fill="white"/><circle cx="300" cy="150" r="90" fill="#BC002D"/>';
  if (country === 'BA') { shapes='<rect width="600" height="300" fill="#002395"/><path d="M205 0H505V300Z" fill="#FECB00"/>';for(let i=-1;i<9;i++){const x=190+i*37.5,y=i*37.5;shapes+=`<polygon points="${Array.from({length:10},(_,j)=>{const a=-Math.PI/2+j*Math.PI/5,r=j%2?6:14;return `${x+Math.cos(a)*r},${y+Math.sin(a)*r}`}).join(' ')}" fill="white"/>`;}}
  return shapes ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${shapes}</svg>` : '';
}
function artwork(country) { return country ? `<div class="flag-art" aria-hidden="true">${flagSvg(country)}</div>` : ''; }
function header(group) {
  return `<header class="trip-heading">${artwork(group.country)}<h3 class="trip-title">${escapeHtml(group.title)}</h3><time class="trip-dates">${escapeHtml(group.dates)}</time></header>`;
}
function flightCard(f) {
  const airline = f.number.slice(0,2);
  return `<button class="flight" data-flight="${f.id}" aria-label="View ${airlines[airline] || airline} ${f.number}, ${cities[f.from]} to ${cities[f.to]}, ${f.date}"><div class="flight-top"><span class="airline" aria-hidden="true">${airline}</span><code>${f.number}</code><span class="flight-date">${f.date}</span></div><div class="route"><div><strong class="airport-code">${f.from}</strong><span class="airport-city">${cities[f.from]}</span><time class="airport-time">${f.depart}</time></div><div class="route-middle"><div class="flight-path"><i class="icon plane" aria-hidden="true"></i></div>${f.duration}</div><div class="end-airport"><strong class="airport-code">${f.to}</strong><span class="airport-city">${cities[f.to]}</span><time class="airport-time">${f.arrive}</time></div></div></button>`;
}
function entryHtml(entry) {
  if(entry.type==='flight') return flightCard(entry);
  if(entry.type==='stay') return `<div class="stay"><i class="icon stay-icon" aria-hidden="true"></i><span>Stay · <strong>${entry.days} days</strong> in ${entry.place}</span></div>`;
  return `<div class="connection"><i class="icon connection-icon" aria-hidden="true"></i><span>${entry.duration} connection in ${entry.place}</span></div>`;
}
function groupHtml(group) {
  return `<section class="trip-group${group.country?'':' unknown'}" data-group="${group.id}" aria-label="${escapeHtml(group.title)}">${header(group)}<div class="group-body">${group.entries.map(entryHtml).join('')}</div></section>`;
}
function phone(direction) {
  const scenario = scenarios[state.scenario];
  return `<div class="device style-${direction.id}" data-theme="${state.theme}"><div class="statusbar"><span>9:41</span><div class="hardware" aria-hidden="true"><span class="signal"><i></i><i></i><i></i><i></i></span><span class="battery"></span></div></div><div class="app-heading"><strong>Flights</strong><span class="avatar" aria-hidden="true">S</span></div><div class="screen-scroll" tabindex="0" role="region" aria-label="${direction.name} flight list, scroll to see more"><div class="app-caption"><span>${scenario.label}</span><span>${scenario.groups.length} ${scenario.groups.length===1?'trip':'groups'}</span></div>${scenario.groups.map(groupHtml).join('')}</div><div class="tabbar" aria-label="App navigation preview">${[['journeys','Flights'],['updates','Updates'],['world','World'],['people','Friends'],['claims','Claims']].map(([key,label],i)=>`<span class="${i===0?'active':''}"><i class="icon" style="mask-image:var(--icon-${key})" aria-hidden="true"></i>${label}</span>`).join('')}</div><div class="homebar" aria-hidden="true"></div></div>`;
}
function inspector(direction) {
  const sample = scenarios[state.scenario].groups[0];
  return `<aside class="inspector" aria-label="${direction.name} design notes"><button class="back-compare" data-view="all">← Back to all four</button><div class="inspector-kicker">Direction ${direction.number} / ${direction.name}</div><h2>${direction.headline}</h2><p>${direction.detail}</p><div class="anatomy-label"><span>Compact header · Actual type size</span><span>48 px for a short title</span></div><div class="anatomy device style-${direction.id}" data-theme="${state.theme}"><div class="trip-group ${sample.country?'':'unknown'}">${header(sample)}</div></div><div class="design-points">${direction.points.map(([title,description],i)=>`<div class="design-point"><span class="point-num">0${i+1}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}</div><button class="inspector-pick" data-pick="${direction.id}" aria-pressed="${state.pick===direction.id}">${state.pick===direction.id?'Your preferred direction':'Keep this as my favourite'}</button><p class="inspector-foot">Saved only in this browser. This does not change the app.</p></aside>`;
}
function render() {
  const visible = directions.filter(d=>state.view==='all'||state.view===d.id);
  $('#board').classList.toggle('focus',state.view!=='all');
  $('#board').innerHTML = visible.map(direction=>`<article class="direction" data-direction="${direction.id}"><div class="direction-head"><div class="direction-kicker"><span class="number">${direction.number} / Compact header</span>${direction.recommended?'<span class="recommend">Recommended</span>':''}</div><h2>${direction.name}</h2><p>${direction.descriptor}</p></div>${phone(direction)}<div class="direction-bottom"><button class="explore" data-view="${direction.id}">Explore direction <span aria-hidden="true">↗</span></button><button class="pick" data-pick="${direction.id}" aria-pressed="${state.pick===direction.id}">${state.pick===direction.id?'✓ Favourite':'Save favourite'}</button></div></article>`).join('') + (state.view==='all'?'':inspector(visible[0]));
  updateControls();
}
function updateControls() {
  $$('.view-switch [data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
  $('#scenario').value = state.scenario;
  $('#scenario-description').textContent = scenarios[state.scenario].description;
  $('#strength').value = state.strength;
  $('#strength-value').textContent = state.strength + '%';
  document.documentElement.style.setProperty('--flag-strength',state.strength/100);
  $('#light').setAttribute('aria-pressed',String(state.theme==='light'));
  $('#dark').setAttribute('aria-pressed',String(state.theme==='dark'));
  $('#large').setAttribute('aria-pressed',String(state.large));
  document.body.classList.toggle('large-type',state.large);
}
function selectView(id, scroll = true) {
  if(id!=='all'&&!directions.some(d=>d.id===id)) return;
  state.view=id;
  history.replaceState(null,'',id==='all'?'#compare':'#'+id);
  render();
  if(scroll) $('.toolbar').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function selectScenario(id, focusGroup) {
  if(!scenarios[id]) return;
  state.scenario=id;render();
  if(focusGroup) $$('.screen-scroll').forEach(screen=>{const group=$(`[data-group="${focusGroup}"]`,screen);if(group)screen.scrollTop+=group.getBoundingClientRect().top-screen.getBoundingClientRect().top-12;});
}
let toastTimer;
function toast(message) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600); }
function choose(id) {
  state.pick=state.pick===id?null:id;savePreference('pick',state.pick||'');
  $$('[data-pick]').forEach(button=>{const selected=button.dataset.pick===state.pick;button.setAttribute('aria-pressed',String(selected));button.textContent=button.classList.contains('inspector-pick')?(selected?'Your preferred direction':'Keep this as my favourite'):(selected?'✓ Favourite':'Save favourite');});
  toast(state.pick?`${directions.find(d=>d.id===id).name} saved as your favourite.`:'Favourite cleared.');
}
function openFlight(id) {
  const group=scenarios[state.scenario].groups.find(g=>g.entries.some(e=>e.id===id));
  const f=group?.entries.find(e=>e.id===id);if(!f)return;
  $('#flight-detail').innerHTML=`<p class="detail-eyebrow">${airlines[f.number.slice(0,2)]||f.number.slice(0,2)} · ${f.number} · ${f.date}</p><h2 id="flight-dialog-title" class="detail-title">${cities[f.from]}<br>to ${cities[f.to]}</h2><div class="detail-route"><div><strong>${f.from}</strong><span>${cities[f.from]}</span><time>${f.depart}</time></div><i class="icon plane" aria-hidden="true"></i><div><strong>${f.to}</strong><span>${cities[f.to]}</span><time>${f.arrive}</time></div></div><div class="detail-chip">${f.duration} · Local airport times</div><p class="detail-bottom">Part of <strong>${group.title}</strong> · ${group.dates}<br>Illustrative flight details for this design preview.</p>`;
  $('#flight-dialog').showModal();
}
function renderFlow() {
  $('#grouping-flow').innerHTML=multi.map((group,i)=>`<div class="flow-card"><div class="flow-index">0${i+1} / ${group.place}</div><button data-flow="${group.id}" aria-label="Preview ${group.title} in the canvas"><div class="mini-header">${artwork(group.country)}<strong>${group.title}</strong><small>${group.dates}</small></div><div class="mini-body">${group.entries.map(e=>e.type==='flight'?`<div>${e.from} → ${e.to}</div>`:`<div class="mini-stay"><i class="icon stay-icon" aria-hidden="true"></i>${e.days} days in ${e.place}</div>`).join('')}</div></button></div>`).join('');
}
document.addEventListener('click',event=>{
  const view=event.target.closest('[data-view]');if(view){selectView(view.dataset.view);return;}
  const pick=event.target.closest('[data-pick]');if(pick){choose(pick.dataset.pick);return;}
  const f=event.target.closest('[data-flight]');if(f){openFlight(f.dataset.flight);return;}
  const flow=event.target.closest('[data-flow]');if(flow){selectScenario('multi',flow.dataset.flow);$('.toolbar').scrollIntoView({block:'start',behavior:'smooth'});}
});
$('#scenario').addEventListener('change',event=>selectScenario(event.target.value));
for(const theme of ['light','dark'])$('#'+theme).addEventListener('click',()=>{state.theme=theme;savePreference('theme',theme);$$('.device').forEach(device=>device.dataset.theme=theme);updateControls();});
$('#strength').addEventListener('input',event=>{state.strength=Number(event.target.value);updateControls();});
$('#large').addEventListener('click',()=>{state.large=!state.large;updateControls();});
$('#reset').addEventListener('click',()=>{Object.assign(state,{view:'all',scenario:'upcoming',theme:'dark',strength:30,large:false});savePreference('theme','dark');history.replaceState(null,'','#compare');render();toast('Canvas reset. Your favourite is kept.');});
$('#try-multi').addEventListener('click',()=>{selectScenario('multi');$('.toolbar').scrollIntoView({block:'start',behavior:'smooth'});});
$('.dialog-close').addEventListener('click',()=>$('#flight-dialog').close());
$('#flight-dialog').addEventListener('click',event=>{if(event.target===$('#flight-dialog')){const r=$('#flight-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('#flight-dialog').close();}});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||$('#flight-dialog').open)return;
  if(/^[1-4]$/.test(event.key))selectView(directions[Number(event.key)-1].id);
  if(event.key==='Escape'&&state.view!=='all')selectView('all');
});
window.addEventListener('hashchange',()=>{const value=location.hash.slice(1);selectView(directions.some(d=>d.id===value)?value:'all',false);});
const initialView=location.hash.slice(1);if(directions.some(d=>d.id===initialView))state.view=initialView;
render();renderFlow();
