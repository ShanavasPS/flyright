import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const base=path.dirname(fileURLToPath(import.meta.url));
const endpoint='http://127.0.0.1:9337';
const tabs=await(await fetch(`${endpoint}/json/list`)).json();
const page=tabs.find(t=>t.type==='page')??await(await fetch(`${endpoint}/json/new?about:blank`,{method:'PUT'})).json();
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0;const pending=new Map();
socket.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
await send('Page.enable');await send('Runtime.enable');
async function shoot(file,out,width,height){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`file://${base}/${file}`});
  for(let i=0;i<60;i++){
    if(await evaluate(`document.readyState==='complete'&&location.href.endsWith('${file}')`))break;
    await new Promise(r=>setTimeout(r,100));
  }
  await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
  await evaluate('document.fonts.ready');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(base,out),Buffer.from(shot.data,'base64'));
  console.log(`${out}: ${width} × ${height}`);
}
for(const mode of ['light','night'])await shoot(`editorial.html?export=${mode}`,`flyright-ios27-editorial-${mode}.png`,1080,1350);
await shoot('video-frame.html','video-frame.png',1080,1920);
await shoot('editorial.html','editorial-preview.png',1440,1100);
socket.close();
