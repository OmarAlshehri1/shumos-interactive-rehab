'use client';
import {useEffect,useRef,useState} from 'react';
import type {State} from '@/lib/castlelegends3d/engine';
/** Original synthesized cues. Audio starts only after a local Display gesture. */
export function useCastleAudio(s:State,platformMuted=false){const context=useRef<AudioContext|null>(null),seen=useRef(s.attack),phase=useRef(s.phase),[enabled,setEnabled]=useState(false);
 const enable=async()=>{try{context.current??=new AudioContext();await context.current.resume();setEnabled(context.current.state==='running');}catch{setEnabled(false);}};
 useEffect(()=>{const ctx=context.current;const strike=s.attack!==seen.current,victory=s.phase==='victory'&&phase.current!=='victory';seen.current=s.attack;phase.current=s.phase;if(!ctx||ctx.state!=='running'||s.config.muted||platformMuted||!strike&&!victory)return;
 const notes=victory?[261.63,329.63,392,523.25]:[220,440,659.25];notes.forEach((freq,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(freq,ctx.currentTime);gain.gain.setValueAtTime(0,ctx.currentTime+i*.1);gain.gain.linearRampToValueAtTime(.07*s.config.volume,ctx.currentTime+i*.1+.03);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.1+.6);oscillator.connect(gain).connect(ctx.destination);oscillator.start(ctx.currentTime+i*.1);oscillator.stop(ctx.currentTime+i*.1+.65);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
 },[s.attack,s.phase,s.config.muted,s.config.volume,platformMuted]);useEffect(()=>()=>{void context.current?.close();},[]);return {enabled,enable};}
