const escapeHtml = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plane = '<i class="plane" aria-hidden="true"></i>';
// Mirror the native RunningBorder: 1.5px stroke, 30% highlight, 3.2s clockwise
// lap. Shared phase makes the live card and its pointer read as the same flight.
const runningBorder = ()=>'<svg class="running-border" aria-hidden="true" focusable="false"><rect pathLength="100" /></svg>';
let borderObserver;
function sizeRunningBorders(){
  borderObserver?.disconnect();
  const size=svg=>{
    const {width,height}=svg.getBoundingClientRect();
    const radius=parseFloat(getComputedStyle(svg.parentElement).borderTopLeftRadius);
    const rect=svg.querySelector('rect');
    for(const [key,value] of Object.entries({x:.75,y:.75,width:Math.max(0,width-1.5),height:Math.max(0,height-1.5),rx:Math.max(0,radius-.75)}))rect.setAttribute(key,value);
  };
  borderObserver=new ResizeObserver(entries=>entries.forEach(e=>size(e.target)));
  const phase=-(performance.now()%3200)/1000+'s';
  for(const svg of document.querySelectorAll('.running-border')){svg.style.setProperty('--sweep-delay',phase);size(svg);borderObserver.observe(svg);}
}
const date = iso=>new Date(iso.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const clock = iso=>iso.slice(11,16);
const arrival = f=>clock(f.scheduledArrival)+(f.scheduledArrival.slice(0,10)>f.scheduledDeparture.slice(0,10)?' +1':'');
const route = (f,hero=false)=>`<div class="route"><div><div class="code">${f.fromCode}</div>${hero?'':`<div class="route-city">${f.fromCity}</div>`}<div class="route-time">${clock(f.scheduledDeparture)}</div></div><div class="route-mid"><div class="route-track">${plane}</div>${hero?'':f.duration}</div><div class="route-end"><div class="code">${f.toCode}</div>${hero?'':`<div class="route-city">${f.toCity}</div>`}<div class="route-time">${arrival(f)}</div></div></div>`;
const stats = small=>small?'<div class="stats-strip"><div><small>All-time</small>28 trips · 54,230 km · 12 countries</div><span>›</span></div>':'<div class="stats-card"><small>Your travels so far</small><strong>54,230 <span style="font-size:20px">km</span></strong><p>28 trips · 12 countries · 86 hours aloft</p></div>';
const heading = (g,dates)=>`<div class="trip-heading" data-group="${g.id}"><span class="flag" aria-hidden="true">${flags[g.country]||''}</span><strong>${g.title}</strong><time>${dates}</time></div>`;
const stay = s=>`<div class="stay-marker"><i class="marker-icon stay-icon" aria-hidden="true"></i><span class="stay-label">Stay ·</span><span class="stay-detail"><strong>${s.days} days</strong> in ${s.place}</span></div>`;
const connection = c=>`<div class="connection-marker"><i class="marker-icon connection-icon" aria-hidden="true"></i>${c.layover} connection in ${c.viaCode==='LHR'?'London':c.viaCode}</div>`;
function tabs(){return `<div class="footer-tabs" aria-label="Existing app navigation">${[['journeys','Flights'],['updates','Updates'],['people','Friends'],['world','World'],['claims','Claims']].map(([key,label],i)=>`<span class="${i===0?'active':''}"><i class="tabicon" style="mask-image:var(--icon-${key})" aria-hidden="true"></i>${label}</span>`).join('')}</div>`;}
