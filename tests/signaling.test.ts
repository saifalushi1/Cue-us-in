import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { fileURLToPath } from 'node:url';
const nextEvent=(socket:Socket,event:string)=>new Promise<any[]>(resolve=>socket.once(event,(...args:unknown[])=>resolve(args)));

test('rooms, signaling isolation, chat, role protection and guest reconnect',async()=>{
  const child=spawn(process.execPath,['--experimental-strip-types','server/index.ts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:'5194',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let output='';child.stderr.on('data',d=>{output+=d;});
  const sockets:Socket[]=[];
  const connect=async()=>{const s=io('http://127.0.0.1:5194',{transports:['websocket'],forceNew:true});sockets.push(s);await nextEvent(s,'connect');return s;};
  const request=(s:Socket,event:string,payload:unknown)=>s.timeout(2000).emitWithAck(event,payload);
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error(output);}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timed out')),8000).unref())]);
    const host=await connect();const room=await request(host,'create',{name:'Saifo'});assert.equal(room.self.host,true);assert.equal(room.members.length,1);assert.ok(room.hostKey);assert.ok(room.rtcConfig.iceServers.length);
    const outsider=await connect();const denied=await request(outsider,'join',{id:'guessed-room',name:'Intruder'});assert.match(denied.error,/ended/);
    const guest=await connect();const joined=await request(guest,'join',{id:room.id,name:'Yassy'});assert.equal(joined.self.host,false);assert.equal(joined.members.length,2);assert.equal(joined.hostKey,undefined);
    const full=await request(outsider,'join',{id:room.id,name:'Third'});assert.match(full.error,/two people/);
    const chatEvent=nextEvent(guest,'chat');await request(host,'chat',{text:'The movie is starting!'});const [message]=await chatEvent;assert.equal(message.name,'Saifo');assert.equal(message.text,'The movie is starting!');
    const signalEvent=nextEvent(guest,'signal');host.emit('signal',{epoch:'test',description:{type:'offer',sdp:'test'}});assert.equal((await signalEvent)[0].description.type,'offer');
    let leaked=false;outsider.on('chat',()=>{leaked=true;});await request(host,'chat',{text:'private'});assert.equal(leaked,false);
    const memberEvent=nextEvent(host,'members');guest.emit('media',{camera:true,mic:true,sharing:true,source:'Injected'});const [list]=await memberEvent;assert.equal(list.find((m:{id:string})=>m.id===guest.id).sharing,false);
    const left=nextEvent(host,'peer-left');guest.disconnect();await left;
    const returning=await connect();const rejoined=await request(returning,'join',{id:room.id,name:'Yassy'});assert.equal(rejoined.messages.length,2);assert.equal(rejoined.self.host,false);
  }finally{sockets.forEach(s=>s.disconnect());child.kill();}
});
