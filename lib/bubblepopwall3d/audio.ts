/** Original synthesised resonance, ambient overtones and quiet success chimes. */
export class DomeAudio {
  private context:AudioContext|null=null; private gain:GainNode|null=null;
  async unlock(){
    if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=0;this.gain.connect(this.context.destination);
      for(const hz of [130.81,196]){const o=this.context.createOscillator(),quiet=this.context.createGain();o.type='sine';o.frequency.value=hz;quiet.gain.value=.015;o.connect(quiet);quiet.connect(this.gain);o.start();}
    }
    await this.context.resume();
  }
  volume(enabled:boolean,volume:number){if(this.context&&this.gain)this.gain.gain.setTargetAtTime(enabled?Math.min(.6,volume)*.12:0,this.context.currentTime,.25);}
  tone(success:boolean,volume:number){const c=this.context,g=this.gain;if(!c||c.state!=='running'||!g)return;
    this.volume(true,volume);
    for(const [i,hz] of (success?[392,523.25,659.25]:[261.63,392]).entries()){
      const o=c.createOscillator(),e=c.createGain();o.type='sine';o.frequency.value=hz;const t=c.currentTime+i*.12;
      e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(.45,t+.05);e.gain.exponentialRampToValueAtTime(.001,t+.9);o.connect(e);e.connect(g);o.start(t);o.stop(t+1);o.onended=()=>{o.disconnect();e.disconnect();};
    }
  }
  dispose(){void this.context?.close();this.context=null;this.gain=null;}
}
