import {spawn} from 'node:child_process';
import {writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const sim=process.argv[2];
if(!sim)throw new Error('Pass the isolated, prepared screenshot-account simulator UDID.');
const work=await mkdtemp(path.join(tmpdir(),'flyright-ios27-take-'));
const raw=path.join(work,'screen-recording.mp4');
const result=path.join(work,'tour.xcresult');
const marks={};
let recorder,recorderDone,recordingStartedAt,buffer='',log='',done=false;
const test=spawn('xcodebuild',[
  'test-without-building','-project',path.join(here,'Capture.xcodeproj'),
  '-scheme','FlyRightSocialCapture','-destination',`platform=iOS Simulator,id=${sim}`,
  '-derivedDataPath','/private/tmp/flyright-ios27-social-build',
  '-resultBundlePath',result,'-parallel-testing-enabled','NO',
  '-only-testing:FlyRightSocialCapture/FlyRightSocialCapture/testTour',
  'CODE_SIGNING_ALLOWED=NO',
],{stdio:['ignore','pipe','pipe']});

function startRecording(){
  recorder=spawn('xcrun',['simctl','io',sim,'recordVideo','--codec=h264',raw],{stdio:['ignore','ignore','pipe']});
  recorderDone=new Promise(resolve=>recorder.on('exit',resolve));
  recorder.stderr.on('data',data=>{
    const line=data.toString();
    if(line.includes('Recording started'))recordingStartedAt=Date.now()/1000;
    process.stdout.write(line);
  });
}
function output(data){
  const chunk=data.toString();log+=chunk;buffer+=chunk;
  const lines=buffer.split('\n');buffer=lines.pop();
  for(const line of lines){
    const m=line.match(/SOCIAL_CAPTURE_([A-Z]+) ([\d.]+)/);
    if(m){
      marks[m[1]]=Number(m[2]);console.log(line.trim());
      if(m[1]==='READY')startRecording();
      if(m[1]==='DONE'){done=true;recorder?.kill('SIGINT');}
    }else if(/error:|failed|passed|Test Case|Testing started/.test(line))console.log(line.trim());
  }
}
test.stdout.on('data',output);test.stderr.on('data',output);
const timeout=setTimeout(()=>{test.kill('SIGTERM');recorder?.kill('SIGINT');},240_000);
const code=await new Promise(resolve=>test.on('exit',resolve));
clearTimeout(timeout);
if(!done)recorder?.kill('SIGINT');
if(recorderDone)await recorderDone;
const meta={sim,work,raw,result,recordingStartedAt,marks,testExitCode:code,complete:done&&code===0};
await writeFile(path.join(work,'capture.log'),log);
await writeFile(path.join(work,'take.json'),JSON.stringify(meta,null,2));
await writeFile(path.join(here,'latest-take.json'),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta,null,2));
if(!meta.complete)process.exitCode=1;
