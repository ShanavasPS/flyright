import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { concepts, iconSvg } from './concepts.mjs';
import { horizonSvg } from './horizon.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
await mkdir(path.join(dir,'references'),{recursive:true});
const sourceArg=process.argv.indexOf('--reference-root');
const referenceRoot=sourceArg<0?null:process.argv[sourceArg+1];
const references=[
  {id:'ref-p2a',source:'check-11-def.svg',code:'Reference P2a',name:'Bold',origin:'Your reference · globe composition',summary:'A strong globe horizon, a larger aircraft, and a bolder route.',description:'My preferred starting point from your reference. The curved horizon connects the identity to the World tab, while the solid route gives the flight a clear direction.',tradeoff:'The radar rings, destination target and glow compete for attention as the icon gets smaller.'},
  {id:'ref-p2c',source:'check-13-def.svg',code:'Reference P2c',name:'Close-up',origin:'Your reference · aircraft placement',summary:'A large diagonal aircraft crossing a globe that fills the tile.',description:'The strongest aircraft placement in the reference set. Its diagonal attitude and larger scale are the ideas carried into Horizon, with the globe grid and endpoint removed.',tradeoff:'The globe grid and multiple route details add texture but contribute little at home-screen size.'},
  {id:'ref-a',source:'check-0-def.svg',code:'Reference A',name:'Glass contrail',origin:'Your reference · identity continuity',summary:'A metallic check rises into a white aircraft on night navy.',description:'A familiar continuation of the contrail-check identity. The continuous trail is clearer than the current dotted check and connects directly to our simpler A / Contrail.',tradeoff:'The bevel and highlights make the check visually heavy. This is a rendered visual, not a verified native glass asset.'},
];
const items=[{id:'e',code:'New E',name:'Horizon',origin:'New synthesis · recommended',group:'shortlist',summary:'A quiet globe curve, one silver route and a larger diagonal aircraft.',description:'Combines P2a’s curved globe with P2c’s aircraft scale and diagonal placement. A single silver route and one origin point carry the flight across the surface, using FlyRight’s existing navy palette.',tradeoff:'A richer illustration than Contrail. The aircraft remains clear at small sizes; the route becomes a secondary detail.',svg:horizonSvg()}];
for(const reference of references){
  const file=path.join(dir,'references',`${reference.id}.svg`);
  if(referenceRoot)await writeFile(file,await readFile(path.join(referenceRoot,reference.source)));
  const svg=await readFile(file,'utf8');
  if(/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=/i.test(svg))throw new Error(`Unexpected active content in ${file}`);
  items.push({...reference,group:'shortlist',svg});
}
items.push(...concepts.map(c=>({id:c.id,code:`Original ${c.id.toUpperCase()}`,name:c.name,origin:'Our first canvas',group:'originals',summary:c.summary,description:c.rationale,tradeoff:c.tradeoff,svg:iconSvg(c.id,{size:1024,mode:'dark',mask:'rounded',uid:'comparison'})})));
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;');
const label=(value,x,y,size=16,weight=500,color='#0c1b36')=>`<text x="${x}" y="${y}" font-family="Helvetica Neue,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(value)}</text>`;
const nodes=[{id:'intro',type:'text',x:0,y:-230,width:1544,height:170,text:'# FlyRight · Recommendations + original options\n\nNew E / Horizon combines the reference globe composition with a larger diagonal aircraft. The three reference icons are unchanged from your linked artifact. Original A–D are included below.\n\nOpen design/icon-directions/comparison.html for interactive size and grayscale checks.'}];
const overviewTiles=[];
for(const [index,item] of items.entries()){
  const stem=`compare-${item.id}`;
  const png=await sharp(Buffer.from(item.svg)).resize(1024,1024).png().toBuffer();
  await writeFile(path.join(dir,'assets',`${stem}.svg`),item.svg);
  await writeFile(path.join(dir,'assets',`${stem}.png`),png);
  item.png=`assets/${stem}.png`;
  item.data=`data:image/svg+xml;base64,${Buffer.from(item.svg).toString('base64')}`;
  const parts=[{input:await sharp(png).resize(200).toBuffer(),left:80,top:44}];
  for(const [j,size] of [40,24,16].entries())parts.push({input:await sharp(png).resize(size).toBuffer(),left:44+j*92,top:418-size});
  const frame=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="462"><rect width="360" height="462" rx="24" fill="#f2f5f9"/>${label(item.code+(item.id==='e'?' · Recommended':''),24,28,12,600,'#5a6a7e')}${label(item.name,24,288,26,700)}${label(item.origin,24,317,12,500,'#5a6a7e')}<path d="M24 345H336" stroke="#e3e8ef"/>${label('Small-size comparison',24,372,12,500,'#5a6a7e')}${[40,24,16].map((size,j)=>label(`${size} px`,40+j*92,444,11,500,'#5a6a7e')).join('')}</svg>`;
  const card=await sharp(Buffer.from(frame)).composite(parts).png().toBuffer();
  await writeFile(path.join(dir,'assets',`${stem}-board.png`),card);
  const x=(index%4)*400,y=Math.floor(index/4)*790;
  nodes.push({id:`image-${item.id}`,type:'file',file:`design/icon-directions/assets/${stem}-board.png`,x,y,width:360,height:462});
  nodes.push({id:`notes-${item.id}`,type:'text',x,y:y+490,width:360,height:260,text:`## ${item.code} / ${item.name}\n\n${item.description}\n\n**Consideration:** ${item.tradeoff}`});
  overviewTiles.push({input:card,left:48+(index%4)*382,top:170+Math.floor(index/4)*510});
}
nodes.push({id:'source',type:'text',x:0,y:1590,width:1560,height:160,text:'## Source and scope\n\nReference: https://claude.ai/artifact/ELZJdh8ydFd5i6bgq93am4 (saved source reviewed 2026-09-21). P2a, P2c and A are reproduced unchanged; New E is our new interpretation. Original A–D remain as drawn in the first canvas.\n\nMy shortlist: E / Horizon for the globe direction; A / Contrail for a simpler graphic identity. No app assets have been installed or changed.'});
await writeFile(path.join(dir,'comparison.canvas'),JSON.stringify({nodes,edges:[]},null,2)+'\n');
const overviewFrame=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1235"><rect width="1600" height="1235" fill="#fff"/>${label('FlyRight / Identity study 02',48,48,18,700)}${label('Recommendations + original options',48,108,34,700)}${label('New Horizon concept and three references above. Our original four below.',48,140,16,500,'#5a6a7e')}${label('My recommendation: New E / Horizon. Keep Original A / Contrail as the strongest simple signature.',48,1194,16,600)}</svg>`;
await sharp(Buffer.from(overviewFrame)).composite(overviewTiles).png().toFile(path.join(dir,'comparison-overview.png'));
const current=await sharp(path.join(root,'assets/images/icon.png')).resize(80).png().toBuffer();
const template=await readFile(path.join(dir,'comparison.template.html'),'utf8');
await writeFile(path.join(dir,'comparison.html'),template.replace('__COMPARISON_DATA__',()=>JSON.stringify(items.map(({svg,source,...item})=>item)).replaceAll('<','\\u003c')).replace('__CURRENT_ICON__',`data:image/png;base64,${current.toString('base64')}`));
console.log(`Rendered ${items.length} directions, comparison.html, comparison.canvas and comparison-overview.png.`);
