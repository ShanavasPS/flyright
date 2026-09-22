import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import sharp from 'sharp';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
await mkdir(path.join(dir,'previews'),{recursive:true});
const uri=async p=>'data:image/png;base64,'+(await readFile(p)).toString('base64');
const iconRules=[];
for(const name of ['journeys','updates','people','world','claims'])iconRules.push(`--icon-${name}:url("${await uri(path.join(root,'assets/images/tabIcons',name+'@3x.png'))}")`);
for(const name of ['stay','connection'])iconRules.push(`--icon-${name}:url("${await uri(path.join(dir,'marker-icons',name+'.png'))}")`);
let html=await readFile(path.join(dir,'canvas.template.html'),'utf8');
const iconStyle=`<style id="icon-assets">:root{${iconRules.join(';')}}</style>`;
html=html.replace('<!-- ICON_ASSETS -->',iconStyle);
html=html.replace('BRAND_ICON',await uri(path.join(root,'assets/images/icon.png')));
await writeFile(path.join(dir,'canvas.html'),html);

const targets=await (await fetch('http://127.0.0.1:9441/json/list')).json();
const target=targets.find(t=>t.type==='page') ?? await (await fetch('http://127.0.0.1:9441/json/new?about:blank',{method:'PUT'})).json();
if(!target)throw new Error('Start an isolated Chrome with --remote-debugging-port=9441 first.');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
let seq=0;const pending=new Map();const errors=[];
ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(new Error(msg.error.message)):p?.resolve(msg.result)}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text+': '+(msg.params.exceptionDetails.exception?.description||''));});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
async function click(selector){return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)}
async function screenshot(file,clip){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,...(clip?{clip:{...clip,scale:1}}:{})});await writeFile(path.join(dir,file),Buffer.from(r.data,'base64'));}
async function rect(selector){return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`)}
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1700,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:pathToFileURL(path.join(dir,'canvas.html')).href});
await evaluate('new Promise(r=>{if(document.readyState==="complete")r();else addEventListener("load",r,{once:true})})');
await evaluate('document.fonts.ready');
await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const compare=await rect('.compare');
await screenshot('overview.png',{x:0,y:0,width:1440,height:Math.ceil(compare.y+compare.height+24)});
for(const name of ['direct','connections','canada'])await screenshot(`previews/${name}.png`,await rect('#phone-'+name));
await click('#theme');
await screenshot('overview-dark.png',{x:0,y:0,width:1440,height:Math.ceil(compare.y+compare.height+24)});
await click('#theme');
const checks=[];
async function check(label,expression){const pass=await evaluate(expression);checks.push({label,pass:!!pass});if(!pass)throw new Error('Canvas check failed: '+label)}
await check('No new segment tabs or nested trip groups','!document.querySelector(".segmented,.trip-group .trip-group")');
await check('Direct return has two flights and its stay between them','document.querySelector("#phone-direct .trip-group").querySelectorAll(".flight-card").length===2 && document.querySelector("#phone-direct .stay-marker").previousElementSibling.classList.contains("flight-card") && document.querySelector("#phone-direct .stay-marker").nextElementSibling.classList.contains("flight-card")');
await check('Connected return preserves four legs and both layovers','document.querySelectorAll("#phone-connections .flight-card").length===4 && document.querySelectorAll("#phone-connections .connection-marker").length===2');
await check('Stay follows the last outbound connection leg','document.querySelector("#phone-connections .stay-marker").previousElementSibling.textContent.includes("BA175") && document.querySelector("#phone-connections .stay-marker").nextElementSibling.textContent.includes("BA178")');
await check('Selected example has US Canada and continued US headers','JSON.stringify([...document.querySelectorAll("#phone-canada .trip-heading strong")].map(n=>n.textContent))===JSON.stringify(["US trip","Canada trip","US trip continued"])');
await check('Canada example shows every flight once and separate stay lengths','document.querySelectorAll("#phone-canada .flight-card").length===4 && JSON.stringify([...document.querySelectorAll("#phone-canada .stay-detail")].map(n=>n.textContent))===JSON.stringify(["9 days in the US","4 days in Canada","9 days in the US"])');
await check('No horizontal overflow at desktop size','document.documentElement.scrollWidth<=1440 && [...document.querySelectorAll(".screen")].every(n=>n.scrollWidth<=n.clientWidth+1)');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
await check('No horizontal overflow at mobile size','document.documentElement.scrollWidth<=390 && [...document.querySelectorAll(".screen")].every(n=>n.scrollWidth<=n.clientWidth+1)');
await screenshot('previews/mobile-canvas.png',{x:0,y:0,width:390,height:844});
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1700,deviceScaleFactor:1,mobile:false});
await evaluate('window.scrollTo(0,0)');
await check('No runtime errors',JSON.stringify(errors.length===0));
await writeFile(path.join(dir,'review.json'),JSON.stringify({reviewed:'2026-09-22',scope:'Revised design canvas only; no app implementation',checks,runtimeErrors:errors},null,2)+'\n');
const nodes=[{id:'intro',type:'text',x:0,y:-240,width:1420,height:190,text:'# Simple trip grouping · Revised canvas\n\nOne treatment of the existing flight list: a country flag beside the destination title, dates aligned at the right, and a stay count. No nesting, parent trip cards or segment tabs. Three examples of the same design.\n\nOpen design/trip-grouping/canvas.html. Canvas only, no app implementation.'}];
const captions=[['direct','Direct return','US trip · 22 days in the US, between the two flights.'],['connections','Connecting return','US trip · Stay count after the final outbound leg. Muted clock labels connect the London legs; a bed icon and short side lines mark the 22-day stay. Full-width lines separate independent trips only.'],['canada','US → Canada → US continued · Selected','US: HEL → JFK. Canada: LGA → YYZ and YYZ → BOS. US trip continued: header, then the 9-day US stay, then BOS → HEL.']];
for(const [i,[key,title,detail]] of captions.entries()){nodes.push({id:'label-'+key,type:'text',x:i*480,y:0,width:440,height:140,text:'## '+title+'\n\n'+detail},{id:'phone-'+key,type:'file',file:'design/trip-grouping/previews/'+key+'.png',x:i*480+20,y:180,width:400,height:1080});}
nodes.push({id:'rules',type:'text',x:0,y:1320,width:1420,height:200,text:'## Only the small additions\n\nKeep existing flight cards. Connections use a muted clock and vertical dotted line; stays use a bed icon, explicit label, bold duration and short side lines. Full-width separators appear only between independent trips. No separator within US → Canada → US continued. Pair adjacent returns only. An intervening destination gets a separate group. Count local days from the last arrival to the next departure. If that departure is missing, omit the duration.\n\nThis board replaces the earlier nested-trip concepts.'});
await writeFile(path.join(dir,'trip-grouping.canvas'),JSON.stringify({nodes,edges:[]},null,2)+'\n');
console.log(JSON.stringify({scope:'Design canvas only',checks:checks.length,passed:checks.every(c=>c.pass),errors},null,2));
ws.close();
