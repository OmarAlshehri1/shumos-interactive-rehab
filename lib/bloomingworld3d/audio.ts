/** Original quiet procedural soundscape. One gesture-unlocked context, no remote audio or paid speech. */
export class GardenAudio {
 readonly context:AudioContext;private master:GainNode;private wind:AudioBufferSourceNode;private timer:ReturnType<typeof setInterval>;private enabled=false;private counter=0;
 constructor(){this.context=new AudioContext();const c=this.context;this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const samples=buffer.getChannelData(0);let last=0;for(let i=0;i<samples.length;i++){last=(last+(.5-Math.random())*.08)/1.02;samples[i]=last;}
 this.wind=c.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;const gain=c.createGain();gain.gain.value=.12;this.wind.connect(filter);filter.connect(gain);gain.connect(this.master);this.wind.start();
 // Gentle bird phrases and water-like droplet notes, spaced out well away from target feedback.
 this.timer=setInterval(()=>{if(!this.enabled||c.state!=='running')return;this.counter++;this.note(this.counter%3===0?1450:950,.06,.7,this.counter%3===0?1800:700);},6500); }
 async unlock(){await this.context.resume();}
 configure(enabled:boolean,volume:number){this.enabled=enabled;this.master.gain.setTargetAtTime(enabled?Math.min(.3,Math.max(0,volume)):0,this.context.currentTime,.3);}
 private note(freq:number,volume:number,duration:number,end=freq,delay=0){const c=this.context,at=c.currentTime+delay;const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(freq,at);o.frequency.exponentialRampToValueAtTime(end,at+duration);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.05);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(this.master);o.start(at);o.stop(at+duration+.05);}
 bloom(complete:boolean){if(!this.enabled)return;const notes=complete?[392,523.25,659.25,783.99,1046.5]:[523.25,659.25,783.99];notes.forEach((f,i)=>this.note(f,.12,complete?2:1.2,f,i*(complete?.3:.12)));}
 dispose(){clearInterval(this.timer);this.wind.stop();this.wind.disconnect();this.master.disconnect();void this.context.close();}
}
