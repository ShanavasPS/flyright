import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.dirname(here);
const take=JSON.parse(await fs.readFile(path.join(here,'latest-take.json'),'utf8'));
if(!take.complete||!take.recordingStartedAt)throw new Error('A complete verified take is required.');
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',take.raw],{encoding:'utf8'}));
const stream=probe.streams.find(s=>s.codec_type==='video');
const width=704,height=Math.round(width*stream.height/stream.width/2)*2;
const x=(1080-width)/2,y=262,r=82;
const start=Math.max(0,take.marks.FLIGHTS-take.recordingStartedAt-1);
const duration=Math.min(Number(probe.format.duration)-start,take.marks.DONE-take.recordingStartedAt-start);
const mask=path.join(take.work,'screen-mask.png');
await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="black"/><rect width="${width}" height="${height}" rx="${r}" fill="white"/></svg>`)).png().toFile(mask);
const final=path.join(out,'flyright-ios27-demo.mp4');
const filters=[
  '[0:v]format=rgb24[bg]',
  `[1:v]setpts=PTS-STARTPTS,fps=60,scale=${width}:${height}:flags=lanczos,setsar=1,format=rgba[phone]`,
  '[2:v]format=gray[mask]',
  '[phone][mask]alphamerge[rounded]',
  `[bg][rounded]overlay=${x}:${y}:shortest=1,format=yuv420p[v]`,
].join(';');
const args=['-y','-hide_banner','-loglevel','warning','-stats',
  '-loop','1','-framerate','60','-i',path.join(out,'video-frame.png'),
  '-ss',start.toFixed(3),'-i',take.raw,
  '-loop','1','-framerate','60','-i',mask,
  '-filter_complex',filters,'-map','[v]','-an','-t',duration.toFixed(3),
  '-c:v','libx264','-preset','medium','-crf','19','-r','60','-movflags','+faststart',final];
const child=spawn('ffmpeg',args,{stdio:'inherit'});
const code=await new Promise(resolve=>child.on('exit',resolve));
if(code!==0)throw new Error(`ffmpeg exited ${code}`);
execFileSync('ffmpeg',['-y','-loglevel','error','-ss','1','-i',final,'-frames:v','1',path.join(out,'demo-poster.png')]);
const finalProbe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',final],{encoding:'utf8'}));
const report={...take,source:{width:stream.width,height:stream.height,frameRate:stream.avg_frame_rate},edit:{start,duration,speed:1,syntheticInterpolation:false},output:{file:final,width:1080,height:1920,fps:60,duration:Number(finalProbe.format.duration),bytes:Number(finalProbe.format.size)}};
await fs.writeFile(path.join(here,'video-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.output,null,2));
