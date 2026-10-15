import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { canJoin, cleanName, cleanText, secret, type Room, type Member } from './rooms.ts';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 100_000,
  allowRequest(req, done) {
    // Same-origin requests work both locally and through a public Tunnel hostname.
    const origin = req.headers.origin;
    try { done(null, !origin || new URL(origin).host === req.headers.host); } catch { done(null, false); }
  },
});
const rooms = new Map<string, Room>();
const buckets = new Map<string, { count: number; until: number }>();
const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) iceServers.push({ urls: process.env.TURN_URLS.split(',').map(s=>s.trim()), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
const rtcConfig = { iceServers, iceTransportPolicy: process.env.RELAY_ONLY === 'true' ? 'relay' : 'all' };
app.disable('x-powered-by');
app.use((_req,res,next)=>{res.set({ 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Permissions-Policy':'camera=(self), microphone=(self), display-capture=(self)', 'Cache-Control':'no-store' }); next();});
app.get('/api/health', (_req,res)=>res.json({ ok:true, turnConfigured:iceServers.length>1 }));
if(process.env.CUE_TESTING==='true'&&process.argv.includes('--dev')){
  app.get('/__rtc-test',(_req,res)=>res.sendFile(resolve('tests/rtc.html')));
  app.get('/__test-movie',(_req,res)=>res.sendFile(resolve('tests/fixtures/sample.webm')));
}

function publish(room:Room) { io.to(room.id).emit('members', [...room.members.values()]); }
io.on('connection', socket=>{
  let room: Room | undefined;
  let burst = { at: Date.now(), count: 0 };
  socket.use((_packet,next)=>{if(Date.now()-burst.at>10000)burst={at:Date.now(),count:0};if(++burst.count>150){socket.disconnect(true);return;}next();});
  const join = (target:Room, name:unknown, key:unknown, ack:Function)=>{
    if(room) return ack({error:'Leave the current room first.'});
    const error=canJoin(target, typeof key==='string'?key:undefined); if(error)return ack({error});
    room=target; target.touched=Date.now();
    const member:Member={id:socket.id,name:cleanName(name),host:key===target.hostKey,camera:false,mic:false,sharing:false,source:''};
    target.members.set(socket.id,member);socket.join(target.id);
    ack({id:target.id,self:member,members:[...target.members.values()],messages:target.messages,rtcConfig,turnConfigured:iceServers.length>1});
    publish(target); socket.to(target.id).emit('peer-ready');
  };
  socket.on('create', (payload,ack)=>{
    if(typeof ack!=='function')return;
    const ip=socket.handshake.address;
    let bucket=buckets.get(ip);if(!bucket||bucket.until<Date.now()){bucket={count:0,until:Date.now()+60000};buckets.set(ip,bucket);}
    if(++bucket.count>10||rooms.size>=100)return ack({error:'Too many rooms. Please try again later.'});
    const target:Room={id:secret(),hostKey:secret(),members:new Map(),messages:[],touched:Date.now()};rooms.set(target.id,target);
    join(target,payload?.name,target.hostKey,(result:object)=>ack({...result,hostKey:target.hostKey}));
  });
  socket.on('join',(payload,ack)=>{
    if(typeof ack!=='function')return;
    const target=typeof payload?.id==='string'?rooms.get(payload.id):undefined;
    if(!target)return ack({error:'This room has ended. Ask the host for a new invitation.'});
    join(target,payload?.name,payload?.hostKey,ack);
  });
  socket.on('signal', payload=>{
    if(!room || !payload || typeof payload!=='object')return;
    if(payload.description && !['offer','answer'].includes(payload.description.type))return;
    if(!payload.description&&!payload.candidate)return;
    socket.to(room.id).emit('signal',payload);
  });
  socket.on('retry',()=>{if(!room)return;const host=[...room.members.values()].find(m=>m.host);if(host)io.to(host.id).emit('peer-ready');});
  socket.on('media', payload=>{
    const me=room?.members.get(socket.id);if(!me||!room)return;
    me.camera=payload?.camera===true;me.mic=payload?.mic===true;me.sharing=me.host&&payload?.sharing===true;me.source=me.sharing?cleanText(payload?.source).slice(0,100):'';publish(room);
  });
  socket.on('chat',(payload,ack)=>{
    const me=room?.members.get(socket.id);const text=cleanText(payload?.text);if(!room||!me||!text)return;
    const message={id:secret(),name:me.name,text,at:Date.now(),sender:socket.id};room.messages.push(message);room.messages=room.messages.slice(-100);room.touched=Date.now();io.to(room.id).emit('chat',message);if(typeof ack==='function')ack({ok:true});
  });
  socket.on('disconnect',()=>{if(room){room.members.delete(socket.id);room.touched=Date.now();publish(room);socket.to(room.id).emit('peer-left');}});
});
setInterval(()=>{for(const [id,room] of rooms)if(!room.members.size&&Date.now()-room.touched>30*60*1000)rooms.delete(id);for(const [ip,bucket]of buckets)if(bucket.until<Date.now())buckets.delete(ip);},60000).unref();
if(process.argv.includes('--dev')) {
  const { createServer: createViteServer }=await import('vite');
  const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
} else {app.use(express.static(resolve('dist')));app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));}
const port=Number(process.env.PORT||5185);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Cue Us In is ready: http://localhost:${port}\nShare this port through Cloudflare Tunnel. Media stays on WebRTC, not the tunnel.`));
