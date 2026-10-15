import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowRight, AudioLines, Check, Film, Headphones, Link, Maximize, MessageCircle, Mic, MicOff, MonitorUp, Play, Radio, RefreshCw, Send, Settings2, ShieldCheck, Square, Video, VideoOff, Volume2, VolumeX, X, LogOut, Clapperboard } from 'lucide-react';
import { Connection, presets, type Quality, type Streams } from './connection';

type Member={id:string;name:string;host:boolean;camera:boolean;mic:boolean;sharing:boolean;source:string};
type Chat={id:string;name:string;text:string;at:number;sender:string};
type Joined={error?:string;id:string;hostKey?:string;self:Member;members:Member[];messages:Chat[];rtcConfig:RTCConfiguration;turnConfigured:boolean};
type MovieVideo=HTMLVideoElement & {captureStream?:()=>MediaStream};
function Media({stream,muted=false,label,className=''}:{stream:MediaStream|null;muted?:boolean;label:string;className?:string}) {
  const ref=useRef<HTMLVideoElement>(null);const [blocked,setBlocked]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;el.srcObject=stream;if(stream)el.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true));return()=>{el.srcObject=null;};},[stream]);
  return <><video ref={ref} autoPlay playsInline muted={muted} aria-label={label} className={className}/>{blocked&&<button className="enable-audio" onClick={()=>ref.current?.play().then(()=>setBlocked(false))}><Volume2 size={16}/> Enable playback</button>}</>;
}
function App(){
  const [name,setName]=useState(()=>sessionStorage.getItem('cue-name')||'');
  const [invite]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('room')||'');
  const [room,setRoom]=useState<Joined|null>(null);const roomRef=useRef<Joined|null>(null);
  const socket=useRef<Socket|null>(null);const connection=useRef<Connection|null>(null);
  const [members,setMembers]=useState<Member[]>([]);const [messages,setMessages]=useState<Chat[]>([]);
  const [joining,setJoining]=useState(false);const [online,setOnline]=useState(false);const [status,setStatus]=useState('waiting');
  const [error,setError]=useState('');const [toast,setToast]=useState('');const [chat,setChat]=useState('');
  const [quality,setQuality]=useState<Quality>('1080p');const [fps,setFps]=useState(30);
  const [camera,setCamera]=useState<MediaStream|null>(null);const cameraRef=useRef<MediaStream|null>(null);
  const [mic,setMic]=useState<MediaStream|null>(null);const micRef=useRef<MediaStream|null>(null);
  const [screen,setScreen]=useState<MediaStream|null>(null);const screenRef=useRef<MediaStream|null>(null);
  const [remote,setRemote]=useState<Streams|null>(null);const [source,setSource]=useState('');const sourceRef=useRef('');
  const [fileUrl,setFileUrl]=useState('');const fileUrlRef=useRef('');const [fileName,setFileName]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);const movie=useRef<MovieVideo>(null);const stage=useRef<HTMLDivElement>(null);const chatEnd=useRef<HTMLDivElement>(null);
  const [muted,setMuted]=useState(false);const [settings,setSettings]=useState(false);const [stats,setStats]=useState('');const [chatOpen,setChatOpen]=useState(true);const [copied,setCopied]=useState(false);
  const mediaBusy=useRef(false);const [busy,setBusy]=useState(false);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);const [micDevice,setMicDevice]=useState('');const [camDevice,setCamDevice]=useState('');

  function report(e:unknown){setError(e instanceof Error?e.message:String(e));}
  function notify(text:string){setToast(text);}
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{const panel=chatEnd.current?.parentElement;panel?.scrollTo({top:panel.scrollHeight,behavior:'smooth'});},[messages]);
  useEffect(()=>{
    if(!settings)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
    const controls=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')||[]);
    controls()[0]?.focus();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setSettings(false);if(e.key==='Tab'){const items=controls();const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus();};
  },[settings]);
  function publish(){socket.current?.emit('media',{camera:!!cameraRef.current,mic:!!micRef.current,sharing:!!screenRef.current,source:sourceRef.current});}
  async function stopScreen(){
    const stream=screenRef.current;screenRef.current=null;setScreen(null);sourceRef.current='';setSource('');
    if(stream)stream.getTracks().forEach(t=>{t.onended=null;t.stop();});
    await connection.current?.replace(2,null);await connection.current?.replace(3,null);publish();
  }
  function release(){
    connection.current?.close();connection.current=null;socket.current?.disconnect();socket.current=null;
    [cameraRef.current,micRef.current,screenRef.current].forEach(s=>s?.getTracks().forEach(t=>{t.onended=null;t.stop();}));
    cameraRef.current=null;micRef.current=null;screenRef.current=null;
    if(fileUrlRef.current)URL.revokeObjectURL(fileUrlRef.current);
  }
  useEffect(()=>()=>release(),[]);
  useEffect(()=>{
    if(!room)return;
    const timer=setInterval(async()=>{
      const pc=connection.current?.pc;if(!pc||pc.connectionState!=='connected'){setStats('');return;}
      const reports=await pc.getStats();let display='';
      reports.forEach(r=>{if((r.type===(room.self.host?'outbound-rtp':'inbound-rtp'))&&r.kind==='video'&&r.mid==='2'&&r.frameWidth)display=`${r.frameWidth} × ${r.frameHeight} · ${Math.round(r.framesPerSecond||0)} fps`;});setStats(display);
    },2000);return()=>clearInterval(timer);
  },[room]);
  function applyJoin(result:Joined){
    if(result.error){setError(result.error);setJoining(false);socket.current?.disconnect();return;}
    roomRef.current=result;setRoom(result);setMembers(result.members);setMessages(result.messages);setJoining(false);
    if(result.hostKey)sessionStorage.setItem(`cue-host-${result.id}`,result.hostKey);
    history.replaceState(null,'',`#room=${result.id}`);
    connection.current?.close();
    const c=new Connection(socket.current!,result.rtcConfig,result.self.host,setRemote,setStatus,setError);c.quality=quality;c.fps=fps;connection.current=c;
    c.tracks=[micRef.current?.getAudioTracks()[0]||null,cameraRef.current?.getVideoTracks()[0]||null,screenRef.current?.getVideoTracks()[0]||null,screenRef.current?.getAudioTracks()[0]||null];
    publish();if(result.self.host&&result.members.length===2)void c.offer();
  }
  function enter(){
    if(!name.trim())return;setError('');setJoining(true);sessionStorage.setItem('cue-name',name.trim());
    socket.current?.disconnect();
    const s=io({autoConnect:false,reconnection:true});socket.current=s;
    s.on('connect',()=>{
      setOnline(true);
      const id=roomRef.current?.id||invite;
      if(id)s.timeout(10000).emit('join',{id,name:name.trim(),hostKey:sessionStorage.getItem(`cue-host-${id}`)},(err:Error|null,result:Joined)=>{if(err){setJoining(false);setError('The server did not respond. Try again.');}else applyJoin(result);});
      else s.timeout(10000).emit('create',{name:name.trim()},(err:Error|null,result:Joined)=>{if(err){setJoining(false);setError('The server did not respond. Try again.');}else applyJoin(result);});
    });
    s.on('connect_error',()=>{setJoining(false);setError('Cannot reach your room server. Check that it is running.');});
    s.on('disconnect',()=>{setOnline(false);setStatus('reconnecting');});
    s.on('members',(list:Member[])=>setMembers(list));
    s.on('chat',(message:Chat)=>setMessages(old=>[...old,message].slice(-100)));
    s.on('peer-ready',()=>{if(connection.current?.host)void connection.current.offer();});
    s.on('peer-left',()=>{connection.current?.close();notify('Your other half left the room. The invitation still works.');});
    s.on('signal',payload=>void connection.current?.receive(payload));s.connect();
  }
  async function withMedia(action:()=>Promise<void>){if(mediaBusy.current)return;mediaBusy.current=true;setBusy(true);setError('');try{await action();}catch(e){report(e);}finally{mediaBusy.current=false;setBusy(false);}}
  async function updateDevices(){setDevices(await navigator.mediaDevices.enumerateDevices());}
  function toggleCamera(){void withMedia(async()=>{
    if(cameraRef.current){await connection.current?.replace(1,null);cameraRef.current.getTracks().forEach(t=>t.stop());cameraRef.current=null;setCamera(null);}
    else {const s=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},...(camDevice?{deviceId:{exact:camDevice}}:{})},audio:false});try{await connection.current?.replace(1,s.getVideoTracks()[0]);}catch(e){s.getTracks().forEach(t=>t.stop());throw e;}cameraRef.current=s;setCamera(s);s.getVideoTracks()[0].onended=()=>{cameraRef.current=null;setCamera(null);publish();};await updateDevices();}publish();
  });}
  function toggleMic(){void withMedia(async()=>{
    if(micRef.current){await connection.current?.replace(0,null);micRef.current.getTracks().forEach(t=>t.stop());micRef.current=null;setMic(null);}
    else {const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(micDevice?{deviceId:{exact:micDevice}}:{})},video:false});try{await connection.current?.replace(0,s.getAudioTracks()[0]);}catch(e){s.getTracks().forEach(t=>t.stop());throw e;}micRef.current=s;setMic(s);s.getAudioTracks()[0].onended=()=>{micRef.current=null;setMic(null);publish();};await updateDevices();}publish();
  });}
  async function broadcast(stream:MediaStream,label:string){
    await stopScreen();
    try{await connection.current?.replace(2,stream.getVideoTracks()[0]);await connection.current?.replace(3,stream.getAudioTracks()[0]||null);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
    screenRef.current=stream;setScreen(stream);sourceRef.current=label;setSource(label);publish();
    stream.getVideoTracks()[0].onended=()=>{void stopScreen();};
  }
  function shareScreen(){void withMedia(async()=>{
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Screen sharing is not available here. Use desktop Chrome or Edge over HTTPS or localhost.');
    const p=presets[quality];
    const s=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:p.width},height:{ideal:p.height},frameRate:{ideal:fps,max:fps}},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},...{systemAudio:'include',selfBrowserSurface:'exclude'}} as DisplayMediaStreamOptions);
    movie.current?.pause();await broadcast(s,'Screen share');
    if(!s.getAudioTracks().length)notify('No shared audio was captured. Share a browser tab and select “Share tab audio”.');
  });}
  function selectFile(file:File|undefined){if(!file)return;void withMedia(async()=>{
    await stopScreen();movie.current?.pause();if(fileUrlRef.current)URL.revokeObjectURL(fileUrlRef.current);
    const url=URL.createObjectURL(file);fileUrlRef.current=url;setFileUrl(url);setFileName(file.name);notify('Movie loaded. Press Stream movie to begin.');
  });}
  function streamMovie(){void withMedia(async()=>{
    const el=movie.current;if(!el?.captureStream)throw new Error('Local movie streaming needs desktop Chrome or Edge. You can also share your media player window.');
    await el.play();const s=el.captureStream();
    if(!s.getVideoTracks().length){s.getTracks().forEach(t=>t.stop());throw new Error('This video could not be captured. Try a browser-playable MP4 or WebM.');}
    await broadcast(s,fileName);if(!s.getAudioTracks().length)notify('This file has no captured audio track. Try an MP4 with AAC audio.');
  });}
  async function changeQuality(q:Quality,f:number){setQuality(q);setFps(f);const c=connection.current;if(c){c.quality=q;c.fps=f;await c.tune().catch(report);}if(source==='Screen share'){const p=presets[q];await screenRef.current?.getVideoTracks()[0]?.applyConstraints({width:{ideal:p.width},height:{ideal:p.height},frameRate:{ideal:f,max:f}}).catch(report);}}
  async function copyInvite(){const url=new URL(location.href);url.hash=`room=${room!.id}`;try{await navigator.clipboard.writeText(url.toString());setCopied(true);setTimeout(()=>setCopied(false),2500);if(['localhost','127.0.0.1'].includes(location.hostname))notify('Local link copied. For a remote guest, open your tunnel’s HTTPS address and create a room there.');}catch{setError('Clipboard unavailable. Copy the room URL from your address bar.');}}
  function sendChat(e:React.FormEvent){e.preventDefault();if(!chat.trim()||!online)return;const text=chat;setChat('');socket.current?.timeout(5000).emit('chat',{text},(err:Error|null)=>{if(err){setChat(text);setError('Your message was not confirmed. Please retry.');}});}
  function retry(){if(connection.current?.host)void connection.current.offer();else socket.current?.emit('retry');}
  const other=members.find(m=>m.id!==room?.self.id);const host=room?.self.host;const hostMember=members.find(m=>m.host);
  const sharing=host?!!screen:!!hostMember?.sharing;
  const activeSource=host?source:hostMember?.source||'';
  const connected=status==='connected';

  return <div className="app"><header className="topbar"><a className="brand" href="/" aria-label="Cue Us In home"><span className="brand-icon"><Clapperboard size={22}/></span><span>Cue Us In<span className="brand-dot">.</span></span></a><span className="top-note">GOOD COMPANY. GREAT PICTURE.</span><div className="privacy"><ShieldCheck size={15}/>{room?'Private room':'Made for two'}</div></header>
    {!room?<main className="lobby"><div className="lobby-copy"><span className="eyebrow"><span className="live-dot"/> YOUR OWN LITTLE SCREENING ROOM</span><h1>Same scene.<br/>Different <em>sofas.</em></h1><p>Your screen, your favorite film, your favorite person.<br/>A private place to press play together.</p><form onSubmit={e=>{e.preventDefault();enter();}} className="join-form"><label htmlFor="name">What should we call you?</label><div><input id="name" autoComplete="nickname" maxLength={32} placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} required/><button className="primary" disabled={joining||!name.trim()}>{joining?'Opening room…':invite?'Join the room':'Create a room'}<ArrowRight size={18}/></button></div></form><div className="lobby-details"><span><MonitorUp size={16}/> Up to 1440p sharing</span><span><Headphones size={16}/> Screen audio + voice</span><span><Video size={16}/> Face to face</span></div><div className="lobby-foot"><ShieldCheck size={15}/> Invite only. Cameras and microphones start off.</div></div><div className="cinema-art" aria-hidden="true"><div className="art-grain"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><span className="art-label">RESERVED FOR THE TWO OF YOU</span><div className="art-screen"><div className="art-play"><Play size={32} fill="currentColor"/></div><span>Let the outside world wait.</span></div><div className="art-seats"><i/><i/></div><div className="art-caption"><span>01 / A SCREEN FOR TWO</span><span>✦</span></div></div></main>:<main className={`room-layout ${chatOpen?'':'chat-hidden'}`}><section className="theater"><div className="room-heading"><div><span className="eyebrow">THE PRIVATE SCREENING</span></div><button className="secondary invite" onClick={copyInvite}>{copied?<Check size={15}/>:<Link size={15}/>} {copied?'Copied':'Invite your person'}</button></div><div className="stage" ref={stage}><div className="stage-top"><span className={`pill ${sharing?'on-air':''}`}><span className="live-dot"/>{sharing?'NOW SHOWING':'SCREENING ROOM'}</span><span className="stage-quality">{stats||`${quality} · ${fps} fps target`}</span></div>
      {host&&fileUrl&&<video ref={movie} className={`movie-player ${activeSource==='Screen share'?'parked':''}`} src={fileUrl} controls playsInline aria-label="Local movie player" onError={()=>setError('This file cannot be played by your browser. Try an MP4 with H.264 video and AAC audio, or a WebM.')} onEnded={()=>{void stopScreen();notify('That’s a wrap. Pick another film whenever you’re ready.');}}/>}
      {sharing&&!(host&&activeSource!=='Screen share')&&<Media stream={host?screen:remote?.screen||null} muted={host||muted} label={host?'Your shared screen':'Shared movie or screen'} className="screen-video"/>}
      {!sharing&&!(host&&fileUrl)&&<div className="stage-empty"><div className="projector"><Film size={36}/></div><span className="eyebrow">THE BEST SEAT IS NEXT TO YOU</span><h2>{host?'Set the scene.':'Your seat is ready.'}</h2><p>{host?'Share your screen or choose a movie from your computer.':'The host’s screen will appear here when the show begins.'}</p>{host&&<div className="source-buttons"><button className="primary" disabled={busy} onClick={shareScreen}><MonitorUp size={17}/> Share screen</button><button className="secondary" disabled={busy} onClick={()=>fileInput.current?.click()}><Film size={17}/> Choose a movie</button></div>}<span className="stage-hint">{host?'For screen audio, share a Chrome tab with “Share tab audio” enabled.':'Keep this tab open. No downloads needed.'}</span></div>}
      <div className="stage-bottom"><span><span className={`connection-dot ${connected?'connected':''}`}/>{!online?'Reconnecting to server…':connected?'Connected, together':other?'Connecting video…':'Waiting for your person'}</span><div>{!host&&sharing&&<button onClick={()=>setMuted(!muted)} aria-label={muted?'Unmute movie':'Mute movie'}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>}<button onClick={()=>{if(stage.current?.requestFullscreen)void stage.current.requestFullscreen().catch(report);}} aria-label="Full screen"><Maximize size={17}/></button></div></div>
      </div><div className="under-stage"><div className="now-playing"><span className="tiny-icon"><AudioLines size={18}/></span><div><span>{sharing?'NOW PLAYING':fileUrl?'READY TO STREAM':'YOUR NEXT GREAT EVENING'}</span><strong>{sharing?activeSource:host&&fileUrl?fileName:'Nothing queued. No rush.'}</strong></div></div>{host&&<div className="source-actions">{fileUrl&&source!=='Screen share'&&!screen&&<button className="primary small" disabled={busy} onClick={streamMovie}><Play size={14}/> Stream movie</button>}{sharing&&<button className="secondary small" disabled={busy} onClick={()=>void withMedia(async()=>{await stopScreen();movie.current?.pause();})}><Square size={13}/> Stop stream</button>}<button className="icon-button" title="Choose a different movie" aria-label="Choose a movie" onClick={()=>fileInput.current?.click()} disabled={busy}><Film size={17}/></button>{(sharing||fileUrl)&&<button className="icon-button" title="Share screen" aria-label="Share screen" onClick={shareScreen} disabled={busy}><MonitorUp size={17}/></button>}</div>}</div>
      <div className="people"><div className="person-card"><div className="person-video">{camera?<Media stream={camera} muted label="Your webcam"/>:<span className="avatar">{room.self.name.slice(0,1).toUpperCase()}</span>}<span className="person-caption">{room.self.name} <small>(you)</small></span><span className="person-mic">{mic?<Mic size={13}/>:<MicOff size={13}/>}</span></div></div><div className="person-card"><div className="person-video">{other?.camera?<Media stream={remote?.camera||null} muted label={`${other.name}'s webcam`}/>:other?<span className="avatar other-avatar">{other.name.slice(0,1).toUpperCase()}</span>:<span className="empty-seat"><Video size={24}/><span>A seat for your person</span></span>}<span className="person-caption">{other?.name||'Not here just yet'}</span>{other&&<span className="person-mic">{other.mic?<Mic size={13}/>:<MicOff size={13}/>}</span>}</div></div></div>
      <div className="call-controls"><div className="control-group"><button className={`control ${mic?'active':''}`} onClick={toggleMic} disabled={busy||!online} aria-label={mic?'Turn microphone off':'Turn microphone on'}>{mic?<Mic size={19}/>:<MicOff size={19}/>}<span>{mic?'Mic on':'Mic off'}</span></button><button className={`control ${camera?'active':''}`} onClick={toggleCamera} disabled={busy||!online} aria-label={camera?'Turn camera off':'Turn camera on'}>{camera?<Video size={20}/>:<VideoOff size={20}/>}<span>{camera?'Camera on':'Camera off'}</span></button>{host&&<button className="control" disabled={busy} onClick={shareScreen}><MonitorUp size={20}/><span>Share</span></button>}<button className={`control ${chatOpen?'active-subtle':''}`} onClick={()=>setChatOpen(!chatOpen)} aria-label={chatOpen?'Hide chat':'Show chat'}><MessageCircle size={19}/><span>Chat</span></button></div><div className="control-group"><button className="control" aria-label="Room settings" onClick={()=>{setSettings(true);void updateDevices().catch(report);}}><Settings2 size={19}/><span>Settings</span></button><button className="control leave" aria-label="Leave room" onClick={()=>{release();roomRef.current=null;setRoom(null);setCamera(null);setMic(null);setScreen(null);setRemote(null);setFileUrl('');history.replaceState(null,'',location.pathname);location.reload();}}><LogOut size={18}/><span>Leave</span></button></div></div><div className="room-footer"><ShieldCheck size={12}/> Encrypted media in transit <span>✦</span> Hosted from your computer</div>
    </section>{chatOpen&&<aside className="chat-panel"><div className="chat-heading"><div><MessageCircle size={17}/><h2>The side conversation</h2></div><span>{members.length}/2</span></div><div className="messages" role="log" aria-label="Room messages" aria-live="polite"><div className="chat-welcome"><span>✦</span><strong>A little room for us.</strong><p>Say hello. Debate the ending.<br/>No spoilers before the opening credits.</p><span className="chat-date">THIS SESSION</span></div>{messages.map(m=><div className={`message ${m.sender===room.self.id?'mine':''}`} key={m.id}><div><strong>{m.name}</strong><time>{new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.text}</p></div>)}<div ref={chatEnd}/></div><form className="chat-form" onSubmit={sendChat}><label className="sr-only" htmlFor="chat">Message your person</label><input id="chat" placeholder="A thought, a theory, a hello…" maxLength={2000} value={chat} onChange={e=>setChat(e.target.value)} disabled={!online}/><button aria-label="Send message" disabled={!chat.trim()||!online}><Send size={17}/></button></form><p className="chat-footnote">Messages stay in this session.</p></aside>}</main>}
    {room&&<div className="audio-only"><Media stream={remote?.voice||null} label="Your partner’s voice"/></div>}
    <input className="sr-only" type="file" ref={fileInput} accept="video/*,.mkv" aria-label="Select movie file" onChange={e=>{selectFile(e.target.files?.[0]);e.target.value='';}}/>
    {error&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}{toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {settings&&room&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setSettings(false);}}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-close icon-button" aria-label="Close settings" onClick={()=>setSettings(false)}><X size={19}/></button><span className="eyebrow">MAKE YOURSELF COMFORTABLE</span><h2 id="settings-title">Picture & sound.</h2>{host&&<><label>Stream resolution<select value={quality} onChange={e=>void changeQuality(e.target.value as Quality,fps)}><option value="720p">720p · 4 Mbps target</option><option value="1080p">1080p · 8 Mbps target</option><option value="1440p">1440p · 14 Mbps target</option></select></label><label>Frame rate<select value={fps} onChange={e=>void changeQuality(quality,Number(e.target.value))}><option value={30}>30 fps · Balanced</option><option value={60}>60 fps · Smooth motion</option></select></label><p>Targets, not guarantees. Actual quality depends on your source, computer, upload speed and the other person’s connection.</p></>}<label>Microphone<select value={micDevice} onChange={e=>setMicDevice(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==='audioinput').map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select></label><label>Camera<select value={camDevice} onChange={e=>setCamDevice(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==='videoinput').map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select></label><p>Turn your mic or camera off and back on to use a different device. Headphones help prevent movie audio echo.</p><div className="network-note"><Radio size={18}/><div><strong>{room.turnConfigured?'TURN relay configured':'Direct connection mode'}</strong><p>{room.turnConfigured?'A relay is available if a direct connection fails.':'If you cannot connect across networks, configure a TURN relay in the server’s .env file.'}</p></div></div><button className="secondary" onClick={()=>{retry();setSettings(false);}} disabled={!other||!online}><RefreshCw size={15}/> Reconnect video</button><button className="primary" onClick={()=>setSettings(false)}>All set <Check size={16}/></button></section></div>}
    {!room&&<footer className="lobby-bottom"><span>A SCREEN FOR TWO. A MOMENT FOR US.</span><span>HOSTED AT HOME <span className="live-dot"/></span></footer>}
  </div>;
}
export default App;
