import * as THREE from 'three';
import { LANES } from '@/lib/rhythmsteps3d/config';

/**
 * Procedural textures. Nothing is downloaded: every glyph is drawn once on a small canvas. Foot symbols are drawn as
 * crisp white shapes with a dark outline so they stay legible on every target colour and under any glow.
 */
const INK = '#f6f9ff';
const EDGE = 'rgba(14,8,44,0.95)';
const FONT = '"Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, sans-serif';

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, anisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  draw(c, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** One footprint, toes toward the top. `h` is its height in px; its centre is (cx, cy). The left foot has its big toe on the right. */
export function drawFoot(c: CanvasRenderingContext2D, cx: number, cy: number, h: number, side: 'L' | 'R', mode: 'fill' | 'outline' = 'fill'): void {
  const u = h / 200;
  const m = side === 'L' ? 1 : -1;
  const X = (x: number) => cx + (x - 50) * u * m;
  const Y = (y: number) => cy + (y - 100) * u;
  const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    c.beginPath();
    c.ellipse(X(x), Y(y), rx * u, ry * u, rot * m, 0, Math.PI * 2);
  };
  const shapes: [number, number, number, number, number][] = [
    [50, 128, 25, 40, 0], // heel
    [52, 98, 22, 34, 0.06], // arch
    [50, 70, 33, 40, -0.05], // ball
  ];
  const toes: [number, number, number][] = [[66, 24, 14], [46, 17, 10.5], [32, 24, 9.5], [21, 36, 8.5], [14, 50, 7.5]];
  // outline mode: a clean ring around the union of the shapes with a dark interior (reads as "this foot stays here")
  if (mode !== 'fill') {
    c.save();
    c.lineJoin = 'round';
    const all = (draw: () => void) => {
      for (const [x, y, rx, ry, rot] of shapes) {
        ell(x, y, rx, ry, rot);
        draw();
      }
      for (const [x, y, r] of toes) {
        c.beginPath();
        c.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
        draw();
      }
    };
    c.lineWidth = 15 * u;
    c.strokeStyle = INK;
    all(() => c.stroke());
    c.fillStyle = 'rgb(16,10,52)';
    all(() => c.fill());
    c.restore();
    return;
  }
  c.save();
  // dark outline pass first so the union of shapes has a clean silhouette
  c.lineJoin = 'round';
  for (const [x, y, rx, ry, rot] of shapes) {
    ell(x, y, rx, ry, rot);
    c.lineWidth = 9 * u;
    c.strokeStyle = EDGE;
    c.stroke();
  }
  for (const [x, y, r] of toes) {
    c.beginPath();
    c.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
    c.lineWidth = 9 * u;
    c.strokeStyle = EDGE;
    c.stroke();
  }
  c.fillStyle = INK;
  for (const [x, y, rx, ry, rot] of shapes) {
    ell(x, y, rx, ry, rot);
    c.fill();
  }
  for (const [x, y, r] of toes) {
    c.beginPath();
    c.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function label(c: CanvasRenderingContext2D, s: number, text: string, y: number, px: number) {
  c.font = `800 ${px}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = px * 0.26;
  c.strokeStyle = EDGE;
  c.strokeText(text, s / 2, y);
  c.fillStyle = INK;
  c.fillText(text, s / 2, y);
}

export type IconKey = 'L' | 'R' | 'ANY' | 'BOTH' | 'STAY_L' | 'STAY_R' | 'HOLD_L' | 'HOLD_R' | 'HOLD_ANY' | 'JUMP';

function arrow(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [col, lw] of [[EDGE, w * 0.5], [INK, w * 0.3]] as const) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x - w, y + w * 0.5);
    c.lineTo(x, y - w * 0.5);
    c.lineTo(x + w, y + w * 0.5);
    c.stroke();
  }
}

export function iconTexture(key: IconKey, size = 512): THREE.CanvasTexture {
  return canvasTexture(size, (c, s) => {
    c.clearRect(0, 0, s, s);
    const fh = s * 0.6;
    const fy = s * 0.4;
    const lab = (t: string) => label(c, s, t, s * 0.86, s * 0.17);
    switch (key) {
      case 'L': drawFoot(c, s / 2, fy, fh, 'L'); lab('يسار'); break;
      case 'R': drawFoot(c, s / 2, fy, fh, 'R'); lab('يمين'); break;
      case 'ANY': drawFoot(c, s * 0.27, fy, fh * 0.84, 'L'); drawFoot(c, s * 0.73, fy, fh * 0.84, 'R'); label(c, s, 'أو', fy, s * 0.15); lab('أي قدم'); break;
      case 'BOTH': drawFoot(c, s * 0.34, fy, fh * 0.92, 'L'); drawFoot(c, s * 0.66, fy, fh * 0.92, 'R'); lab('القدمان'); break;
      case 'STAY_L': drawFoot(c, s / 2, fy, fh, 'L', 'outline'); lab('ثبّت'); break;
      case 'STAY_R': drawFoot(c, s / 2, fy, fh, 'R', 'outline'); lab('ثبّت'); break;
      case 'HOLD_L': drawFoot(c, s / 2, fy, fh * 0.84, 'L'); lab('ثبات'); break;
      case 'HOLD_R': drawFoot(c, s / 2, fy, fh * 0.84, 'R'); lab('ثبات'); break;
      case 'HOLD_ANY': drawFoot(c, s * 0.27, fy, fh * 0.74, 'L'); drawFoot(c, s * 0.73, fy, fh * 0.74, 'R'); label(c, s, 'أو', fy, s * 0.13); lab('ثبات'); break;
      case 'JUMP':
        drawFoot(c, s * 0.34, s * 0.45, fh * 0.8, 'L');
        drawFoot(c, s * 0.66, s * 0.45, fh * 0.8, 'R');
        arrow(c, s / 2, s * 0.13, s * 0.09);
        arrow(c, s / 2, s * 0.2, s * 0.09);
        lab('قفزة');
        break;
    }
  });
}

export function numberTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(128, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,6,40,0.88)';
    c.fill();
    c.lineWidth = s * 0.07;
    c.strokeStyle = INK;
    c.stroke();
    c.font = `800 ${s * 0.56}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(String(n), s / 2, s / 2 + s * 0.04);
  });
}

/** Colour name lying on the near zone, readable from the child's side. */
export function laneLabelTexture(lane: number): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.clearRect(0, 0, s, s * 0.5);
    label(c, s, LANES[lane].nameAr, s * 0.25, s * 0.2);
  }, 2);
}

/** Soft round dot for particles and halos. */
export function dotTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }, 1);
}

/** The bright star at the vanishing point: a core, a halo and thin diffraction streaks. */
export function flareTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.06, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, 'rgba(180,220,255,0.45)');
    g.addColorStop(0.5, 'rgba(160,80,255,0.12)');
    g.addColorStop(1, 'rgba(120,40,200,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + (i % 2 ? 0.12 : 0);
      const len = (i % 2 ? 0.34 : 0.5) * s;
      const lg = c.createLinearGradient(s / 2, s / 2, s / 2 + Math.cos(a) * len, s / 2 + Math.sin(a) * len);
      lg.addColorStop(0, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = lg;
      c.lineWidth = i % 2 ? 2 : 3.5;
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      c.lineTo(s / 2 + Math.cos(a) * len, s / 2 + Math.sin(a) * len);
      c.stroke();
    }
  }, 1);
}
