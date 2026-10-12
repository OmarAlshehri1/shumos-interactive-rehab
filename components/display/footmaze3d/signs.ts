import * as THREE from 'three';
import { canvasTexture } from './textures';

/** Floor signs and decals for Foot Maze: drawn shapes first, never text, so a child reads them from above. */

/** Friendly WAIT sign: amber disc with an open hand. */
export function waitSignTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:wait', 512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = 'rgba(10,15,30,0.38)'; ctx.beginPath(); ctx.arc(cx, cy + 8, 236, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(cx, cy - 40, 30, cx, cy, 232);
    g.addColorStop(0, '#ffd45a'); g.addColorStop(1, '#ff9a1f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 228, 0, 7); ctx.fill();
    ctx.lineWidth = 16; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    const finger = (x: number, top: number, wd: number) => { ctx.beginPath(); ctx.roundRect(x, top, wd, cy + 60 - top, wd / 2); ctx.fill(); };
    finger(cx - 112, cy - 126, 46); finger(cx - 58, cy - 168, 46); finger(cx - 4, cy - 176, 46); finger(cx + 50, cy - 150, 46);
    ctx.beginPath(); ctx.roundRect(cx - 118, cy - 40, 172, 150, 56); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 110, cy + 6, 26, 62, -0.7, 0, 7); ctx.fill();
  });
}

/** CONTINUE sign: green disc with a bold arrow. */
export function goSignTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:go', 512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = 'rgba(10,15,30,0.38)'; ctx.beginPath(); ctx.arc(cx, cy + 8, 236, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(cx, cy - 40, 30, cx, cy, 232);
    g.addColorStop(0, '#6df0a6'); g.addColorStop(1, '#1fb866');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 228, 0, 7); ctx.fill();
    ctx.lineWidth = 16; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(cx, cy - 150); ctx.lineTo(cx + 120, cy - 10); ctx.lineTo(cx + 46, cy - 10); ctx.lineTo(cx + 46, cy + 140); ctx.lineTo(cx - 46, cy + 140); ctx.lineTo(cx - 46, cy - 10); ctx.lineTo(cx - 120, cy - 10); ctx.closePath(); ctx.fill();
  });
}

/** "Stand steady" sign for therapist-approved stance holds: amber disc with a one-legged figure. */
export function stanceSignTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:stance', 512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = 'rgba(10,15,30,0.38)'; ctx.beginPath(); ctx.arc(cx, cy + 8, 236, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(cx, cy, 228, 0, 7); ctx.fill();
    ctx.lineWidth = 16; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(cx, cy - 130, 34, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy - 90); ctx.lineTo(cx, cy + 30); ctx.moveTo(cx - 90, cy - 50); ctx.lineTo(cx + 90, cy - 50); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, cy + 150); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx + 70, cy + 90); ctx.lineTo(cx + 20, cy + 110); ctx.stroke();
  });
}

/** Soft striped tape across a blocked corridor (never red/black: friendly candy stripes). */
export function tapeTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:tape', 128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#fff3d6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff9a1f';
    for (let x = -h; x < w + h; x += 32) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 0); ctx.closePath(); ctx.fill(); }
  }, { repeat: true });
}

/** A flat, shallow stream (drawn on the floor; never a hole): turquoise ripples with a lighter rim. */
export function streamTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:stream', 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2fb8d8'); g.addColorStop(0.5, '#6fe0f0'); g.addColorStop(1, '#2fb8d8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let r = 0; r < 4; r++) { ctx.beginPath(); for (let x = 0; x <= w; x += 16) { const y = 32 + r * 64 + Math.sin(x / 22 + r) * 9; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
  }, { repeat: true });
}

/** Plank for a bridge. */
export function plankTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:plank', 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c98a4a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,50,20,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const y = 10 + i * 14; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(40, y + 3, 90, y - 3, w, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = 'rgba(40,20,5,0.8)'; ctx.fillRect(0, h - 5, w, 5);
  }, { repeat: true });
}

/** Big destination flag / banner mark. */
export function pennantTexture(): THREE.CanvasTexture {
  return canvasTexture('fm:pennant', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(w - 8, h / 2); ctx.lineTo(8, h - 8); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
  });
}
