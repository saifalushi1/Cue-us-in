import { io } from 'socket.io-client';
import { Connection } from '../src/connection';
const result=document.querySelector('#result')!;
const screen=document.querySelector<HTMLVideoElement>('#screen')!;
const camera=document.querySelector<HTMLVideoElement>('#camera')!;
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
document.querySelector('#sample')!.addEventListener('click',async()=>{
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;const stream=canvas.captureStream(30);let n=0;
  const timer=setInterval(()=>{ctx.fillStyle='#32283f';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#efb48d';ctx.font='100px sans-serif';ctx.fillText('Cue Us In · A screen for two',170,460);ctx.font='50px sans-serif';ctx.fillText('Your movie goes here.',170,560);ctx.fillRect((++n*10)%1800,750,100,10);},33);
  const audio=new AudioContext();await audio.resume();const osc=audio.createOscillator();const gain=audio.createGain();gain.gain.value=.02;const dest=audio.createMediaStreamDestination();osc.connect(gain);gain.connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus'});const chunks:BlobPart[]=[];recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise<void>(r=>{recorder.onstop=()=>r();});recorder.start();result.textContent='Creating a 10-second sample…';await delay(10000);recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());await audio.close();
  const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));const link=document.createElement('a');link.href=url;link.download='cue-us-in-sample.webm';link.textContent='Download sample movie';document.body.appendChild(link);result.textContent='Sample ready. Download it for the movie file test.';
});
async function runTest(){
  const host=io({forceNew:true}),guest=io({forceNew:true});let a:Connection|undefined,b:Connection|undefined;let context:AudioContext|undefined,timer:number|undefined,camTimer:number|undefined;const allTracks:MediaStreamTrack[]=[];
  const lines:string[]=[];const log=(s:string)=>{lines.push(s);result.textContent=lines.join('\n');};
  try{
    log('Connecting two independent clients…');
    await Promise.all([new Promise<void>(r=>host.on('connect',()=>r())),new Promise<void>(r=>guest.on('connect',()=>r()))]);
    const room=await host.emitWithAck('create',{name:'Test host'});
    a=new Connection(host,room.rtcConfig,true,()=>{},s=>log(`Host: ${s}`),e=>log(`ERROR: ${e}`));
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;let n=0;
    const draw=()=>{ctx.fillStyle='#352742';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#efb48d';ctx.font='100px sans-serif';ctx.fillText(`Cue Us In · ${++n}`,150,500);ctx.fillRect((n*15)%1800,700,100,100);};draw();timer=window.setInterval(draw,33);
    let video=canvas.captureStream(30);
    let fileStream:MediaStream|undefined;
    if(new URLSearchParams(location.search).has('file')){
      const player=document.createElement('video') as HTMLVideoElement & {captureStream:()=>MediaStream};player.muted=true;player.loop=true;player.playsInline=true;player.src='/__test-movie';document.body.appendChild(player);await player.play();fileStream=player.captureStream();video.getTracks().forEach(t=>t.stop());video=fileStream;log('Testing a real local WebM file with captureStream().');
    }
    const camCanvas=document.createElement('canvas');camCanvas.width=640;camCanvas.height=360;const camCtx=camCanvas.getContext('2d')!;const cam=camCanvas.captureStream(5);camCtx.fillStyle='teal';camCtx.fillRect(0,0,640,360);
    camTimer=window.setInterval(()=>{camCtx.fillStyle=n%2?'teal':'#276b70';camCtx.fillRect(0,0,640,360);},100);
    let dest:{stream:MediaStream};
    if(fileStream)dest={stream:fileStream};
    else {context=new AudioContext();await context.resume();const osc=context.createOscillator();dest=context.createMediaStreamDestination();const gain=context.createGain();gain.gain.value=.02;osc.connect(gain);gain.connect(dest as MediaStreamAudioDestinationNode);osc.start();}
    allTracks.push(...video.getTracks(),...cam.getTracks(),...dest.stream.getTracks());
    a.tracks=[dest.stream.getAudioTracks()[0],cam.getVideoTracks()[0],video.getVideoTracks()[0],dest.stream.getAudioTracks()[0].clone()];allTracks.push(a.tracks[3]!);
    const joined=await guest.emitWithAck('join',{id:room.id,name:'Test guest'});
    b=new Connection(guest,joined.rtcConfig,false,streams=>{screen.srcObject=streams.screen;camera.srcObject=streams.camera;void screen.play().catch(()=>{});void camera.play().catch(()=>{});},s=>log(`Guest: ${s}`),e=>log(`ERROR: ${e}`));
    host.on('signal',s=>void a!.receive(s));guest.on('signal',s=>void b!.receive(s));await a.offer();
    for(let i=0;i<100&&(!screen.videoWidth||!camera.videoWidth);i++)await delay(100);
    if(screen.videoWidth!==1920||screen.videoHeight!==1080){log(`Video element state: ${screen.readyState}, paused: ${screen.paused}`);const reports=await a.pc!.getStats();reports.forEach(r=>{if(r.type==='outbound-rtp')log(JSON.stringify({kind:r.kind,mid:r.mid,bytes:r.bytesSent,frames:r.framesEncoded}));});log(JSON.stringify(b.remote.screen.getTracks().map(t=>({kind:t.kind,muted:t.muted,state:t.readyState}))));throw new Error(`Expected 1920x1080 screen, received ${screen.videoWidth}x${screen.videoHeight}`);}
    log(`PASS: Screen received at ${screen.videoWidth} × ${screen.videoHeight}`);
    if(camera.videoWidth!==640)throw new Error('Webcam track was not received separately');log('PASS: Separate webcam video received');
    await delay(700);const reports=await b.pc!.getStats();let audio=0,videoCount=0;reports.forEach(r=>{if(r.type==='inbound-rtp'&&r.bytesReceived>0){if(r.kind==='audio')audio++;if(r.kind==='video')videoCount++;}});
    if(audio<2||videoCount<2)throw new Error(`Expected 2 audio + 2 video tracks, got ${audio} + ${videoCount}`);log('PASS: Movie audio and microphone audio both received');
    await b.replace(1,cam.getVideoTracks()[0].clone());allTracks.push(b.tracks[1]!);await delay(500);
    if(a.remote.camera.getVideoTracks().length!==1)throw new Error('Guest webcam not received');log('PASS: Guest can enable webcam after connection');
    let chat=false;guest.on('chat',m=>{if(m.text==='Hello from host')chat=true;});await host.emitWithAck('chat',{text:'Hello from host'});await delay(100);if(!chat)throw new Error('Chat delivery failed');log('PASS: Chat delivered to other participant');
    await a.replace(2,null);await a.replace(3,null);await a.replace(2,video.getVideoTracks()[0]);await a.replace(3,dest.stream.getAudioTracks()[0]);await delay(500);if(b.pc!.connectionState!=='connected')throw new Error('Connection lost during source replacement');log('PASS: Stop and resume movie tracks without disconnecting');
    log('ALL MEDIA CHECKS PASSED. Cross-network TURN testing still required.');
  }catch(e){log(`FAILED: ${e instanceof Error?e.message:e}`);}finally{if(timer)clearInterval(timer);if(camTimer)clearInterval(camTimer);allTracks.forEach(t=>t.stop());await context?.close();a?.close();b?.close();host.disconnect();guest.disconnect();}
}
document.querySelector('#run')!.addEventListener('click',()=>void runTest());
if(new URLSearchParams(location.search).has('file'))void runTest();
