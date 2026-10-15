import type { Socket } from 'socket.io-client';

export type Streams = { voice: MediaStream; camera: MediaStream; screen: MediaStream };
export type Quality = '1080p' | '1440p' | '720p';
export const presets = { '1080p': { width:1920, height:1080, bitrate:8_000_000 }, '1440p': { width:2560, height:1440, bitrate:14_000_000 }, '720p': { width:1280, height:720, bitrate:4_000_000 } };
type Signal = { epoch:string; description?:RTCSessionDescriptionInit; candidate?:RTCIceCandidateInit };

export class Connection {
  pc:RTCPeerConnection|null=null;
  tracks:(MediaStreamTrack|null)[]=[null,null,null,null];
  remote:Streams={voice:new MediaStream(),camera:new MediaStream(),screen:new MediaStream()};
  epoch='';
  pending=new Map<string,RTCIceCandidateInit[]>();
  quality:Quality='1080p';
  fps=30;
  constructor(public socket:Socket,public config:RTCConfiguration,public host:boolean,public onStreams:(s:Streams)=>void,public onState:(s:string)=>void,public onError:(message:string)=>void) {}
  reset() {
    if(this.pc){this.pc.onconnectionstatechange=null;this.pc.onicecandidate=null;this.pc.close();}
    this.pc=null;this.remote={voice:new MediaStream(),camera:new MediaStream(),screen:new MediaStream()};this.onStreams(this.remote);
  }
  async build(epoch:string) {
    this.reset();this.epoch=epoch;
    const pc=new RTCPeerConnection(this.config);this.pc=pc;
    if(this.host)['audio','video','video','audio'].forEach((kind,i)=>{
      const t=pc.addTransceiver(this.tracks[i]||kind as 'audio'|'video',{direction:'sendrecv',streams:[new MediaStream()]});
      if(kind==='video'){
        const caps=RTCRtpSender.getCapabilities('video');
        if(caps&&t.setCodecPreferences){const codecs=[...caps.codecs].sort((a,b)=>(a.mimeType.toLowerCase()==='video/vp9'?-1:0)-(b.mimeType.toLowerCase()==='video/vp9'?-1:0));t.setCodecPreferences(codecs);}
      }
    });
    pc.onicecandidate=e=>{if(e.candidate)this.socket.emit('signal',{epoch,candidate:e.candidate.toJSON()});};
    pc.onconnectionstatechange=()=>{this.onState(pc.connectionState);if(pc.connectionState==='failed')this.onError('The video connection failed. Try reconnecting. A TURN relay may be needed on one of your networks.');};
    pc.ontrack=e=>{
      const index=Number(e.transceiver.mid);
      const stream=index===0?this.remote.voice:index===1?this.remote.camera:this.remote.screen;
      if(!stream.getTrackById(e.track.id))stream.addTrack(e.track);
      this.onStreams({...this.remote});
    };
    this.onState('connecting');return pc;
  }
  async offer() {
    try{const pc=await this.build(crypto.randomUUID());await pc.setLocalDescription(await pc.createOffer());this.socket.emit('signal',{epoch:this.epoch,description:pc.localDescription});await this.tune();}catch(e){this.fail(e);}
  }
  async receive(signal:Signal) {
    try {
      if(signal.description){
        if(signal.description.type==='offer'){
          if(this.host)return;
          const pc=await this.build(signal.epoch);await pc.setRemoteDescription(signal.description);
          for(const t of pc.getTransceivers()){const index=Number(t.mid);t.direction='sendrecv';await t.sender.replaceTrack(this.tracks[index]);}
          await pc.setLocalDescription(await pc.createAnswer());this.socket.emit('signal',{epoch:this.epoch,description:pc.localDescription});await this.tune();
        }else if(this.pc&&signal.epoch===this.epoch&&this.pc.signalingState==='have-local-offer'){await this.pc.setRemoteDescription(signal.description);}else return;
        for(const c of this.pending.get(signal.epoch)||[])await this.pc?.addIceCandidate(c);this.pending.delete(signal.epoch);
      }else if(signal.candidate){
        if(this.pc?.remoteDescription&&signal.epoch===this.epoch)await this.pc.addIceCandidate(signal.candidate);
        else {if(this.pending.size>5)this.pending.clear();const list=this.pending.get(signal.epoch)||[];if(list.length<100)list.push(signal.candidate);this.pending.set(signal.epoch,list);}
      }
    }catch(e){this.fail(e);}
  }
  async replace(index:number,track:MediaStreamTrack|null) {
    const sender=this.pc?.getTransceivers()[index]?.sender;
    if(sender)await sender.replaceTrack(track);
    this.tracks[index]=track;
    if(track&&index===2)track.contentHint='motion';
    await this.tune();
  }
  async tune() {
    const sender=this.pc?.getTransceivers()[2]?.sender;if(!sender)return;
    const p=sender.getParameters();if(!p.encodings?.length)return;
    p.encodings[0].maxBitrate=presets[this.quality].bitrate;p.encodings[0].maxFramerate=this.fps;
    const size=sender.track?.getSettings();const target=presets[this.quality];p.encodings[0].scaleResolutionDownBy=Math.max(1,(size?.width||target.width)/target.width,(size?.height||target.height)/target.height);
    p.degradationPreference='maintain-resolution';await sender.setParameters(p);
  }
  fail(error:unknown){this.onError(error instanceof Error?error.message:'Unable to establish a video connection.');}
  close(){this.reset();this.pending.clear();this.onState('waiting');}
}
