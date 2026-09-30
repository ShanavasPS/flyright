/** Writes the run's review page (index.html) and findings.csv: every state as
 * one row, default and capped shots side by side for each platform. */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateName } from './build-flows.mjs';

const PASSES = ['B0', 'B', 'B2', 'A', 'C'];
const PLATFORMS = ['ios', 'android'];
const LABEL = { ios: 'iPhone', android: 'Android' };
const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function cell(out, report, platform, state, scale) {
  const file = `${platform}/${state.pass}/${stateName(state)}__${scale}.png`;
  if (!existsSync(join(out, file))) {
    const expected = report.states.some((s) => s.platform === platform && s.name === stateName(state));
    return `<div class="shot empty">${expected ? 'Not captured' : '—'}</div>`;
  }
  const missed = Boolean(state.anchor) && !existsSync(join(out, platform, state.pass, '_seen', `${stateName(state)}__${scale}.png`));
  const drift = (report.drift ?? []).find(
    (d) => d.platform === platform && d.pass === state.pass && d.file === `${stateName(state)}__${scale}.png` && d.changed,
  );
  const badges = [
    missed ? '<span class="badge warn">Anchor not seen</span>' : '',
    drift ? `<span class="badge bad">Drift ${(drift.share * 100).toFixed(2)}%</span>` : '',
  ].join('');
  return `<figure class="shot"><a href="${file}" target="_blank"><img loading="lazy" src="${file}" alt="${escape(`${stateName(state)} ${platform} ${scale}`)}"></a><figcaption>${scale === 'cap' ? 'Above the cap' : 'Default'}${badges}</figcaption></figure>`;
}

export function buildSheet(out, manifest, report) {
  const scales = report.baseline ? ['normal'] : ['normal', 'cap'];
  const rows = [];
  for (const pass of PASSES) {
    const states = manifest.states.filter((state) => state.pass === pass);
    if (!states.length) continue;
    rows.push(`<h2 id="pass-${pass}">${escape(manifest.passes?.[pass] ?? pass)} <small>Pass ${pass}</small></h2>`);
    for (const state of states) {
      const problem = PLATFORMS.some((platform) =>
        report.states.some((s) => s.platform === platform && s.name === stateName(state) && (!s.captured || s.anchorMissed)),
      );
      const shots = PLATFORMS.map(
        (platform) =>
          `<div class="platform" data-platform="${platform}"><h4>${LABEL[platform]}</h4><div class="pair">${scales
            .map((scale) => cell(out, report, platform, state, scale))
            .join('')}</div></div>`,
      ).join('');
      rows.push(
        `<section class="state${problem ? ' problem' : ''}${state.skip ? ' skipped' : ''}"><header><h3><span class="id">${escape(state.id)}</span> ${escape(state.title ?? '')} <span class="st">${escape(state.state)}</span></h3>${
          state.skip ? `<p class="note">Skipped: ${escape(state.skip)}</p>` : state.note ? `<p class="note">${escape(state.note)}</p>` : ''
        }</header>${state.skip ? '' : `<div class="platforms">${shots}</div>`}</section>`,
      );
    }
  }
  const engages = (report.engages ?? [])
    .map(
      (e) =>
        `<li>${LABEL[e.platform]} ${escape(e.name)}: ${
          !e.complete ? 'incomplete' : e.holds ? 'identical at all three sizes — the cap holds' : `differs (${e.shares.map((s) => `${(s * 100).toFixed(2)}%`).join(', ')})`
        }</li>`,
    )
    .join('');
  const captured = report.states.filter((s) => s.captured).length;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Large text run</title>
<style>
:root{--bg:#fff;--card:#fff;--line:#e3e8ef;--text:#0b1424;--muted:#5a6a7e;--tint:#1e6be0;--warn:#a9720b;--bad:#d93036;--sel:#e8eef6}
@media (prefers-color-scheme:dark){:root{--bg:#070f20;--card:#101d34;--line:#1b2c4a;--text:#f2f6fb;--muted:#8fa2bb;--tint:#4e9bf5;--warn:#f2b441;--bad:#f2555a;--sel:#1b2c4a}}
body{margin:0;background:var(--bg);color:var(--text);font:500 14px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:1500px;margin:0 auto;padding:24px 16px 64px}
h1{margin:0 0 4px;font-size:28px}h2{margin:40px 0 12px;font-size:20px}h2 small{color:var(--muted);font-weight:500}
.lead{color:var(--muted);margin:0 0 16px}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);padding:12px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap}
.bar button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer}
.bar button[aria-pressed=true]{background:var(--sel);border-color:var(--tint)}
.state{border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0;background:var(--card)}
.state h3{margin:0;font-size:16px}.id{color:var(--tint)}.st{color:var(--muted);font-weight:500}
.note{margin:4px 0 0;color:var(--muted)}
.platforms{display:flex;gap:24px;flex-wrap:wrap;margin-top:12px}
.platform h4{margin:0 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.pair{display:flex;gap:8px}
.shot{margin:0;width:220px}.shot img{width:100%;border-radius:10px;border:1px solid var(--line);display:block}
.shot figcaption{font-size:12px;color:var(--muted);margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}
.shot.empty{height:120px;border:1px dashed var(--line);border-radius:10px;display:grid;place-items:center;color:var(--muted)}
.badge{border-radius:6px;padding:0 6px;font-weight:700}.warn{color:var(--warn)}.bad{color:var(--bad)}
body.only-problems .state:not(.problem){display:none}
body.hide-ios [data-platform=ios],body.hide-android [data-platform=android]{display:none}
ul{margin:8px 0 0;padding-left:20px}
@media (max-width:600px){.shot{width:44vw}}
</style></head><body><main>
<h1>Large text run</h1>
<p class="lead">FlyRight ${escape(report.version)} (${escape(report.commit)}) · ${escape(report.startedAt.slice(0, 16).replace('T', ' '))} UTC · ${captured} of ${report.states.length} screenshots captured${report.baseline ? ' · baseline (default text only)' : ' · iPhone at AX3, Android at font scale 2.0 for the capped shots'}</p>
${engages ? `<p><b>Cap engages check</b></p><ul>${engages}</ul>` : ''}
${report.errors.length ? `<p class="bad"><b>Errors:</b> ${report.errors.map((e) => escape(`${e.platform}: ${e.error}`)).join('; ')}</p>` : ''}
<div class="bar"><button data-toggle="only-problems" aria-pressed="false">Only problems</button><button data-toggle="hide-android" aria-pressed="false">Hide Android</button><button data-toggle="hide-ios" aria-pressed="false">Hide iPhone</button>${PASSES.map((p) => `<a href="#pass-${p}"><button>${p}</button></a>`).join('')}</div>
${rows.join('\n')}
</main><script>
document.querySelectorAll('[data-toggle]').forEach((b)=>b.addEventListener('click',()=>{const on=document.body.classList.toggle(b.dataset.toggle);b.setAttribute('aria-pressed',on);}));
</script></body></html>
`;
  writeFileSync(join(out, 'index.html'), html);

  const csv = ['ID,state,platform,severity,problem,component,normal shot,cap shot'];
  for (const s of report.states.filter((s) => s.scale === scales.at(-1))) {
    const issue = !s.captured ? 'not captured' : s.anchorMissed ? 'anchor not seen' : '';
    const [id, ...rest] = s.name.split('-');
    csv.push(`${id},${rest.join('-')},${s.platform},,${issue},,${s.platform}/${s.pass}/${s.name}__normal.png,${s.platform}/${s.pass}/${s.name}__cap.png`);
  }
  writeFileSync(join(out, 'findings.csv'), `${csv.join('\n')}\n`);
}
