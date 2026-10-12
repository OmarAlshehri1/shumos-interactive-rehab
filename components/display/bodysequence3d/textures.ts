import * as THREE from 'three';
import { mulberry32 } from '@/lib/footsteps3d/rng';
import { FOOT_AR, LANE_SHORT_AR } from '@/lib/bodysequence3d/captions';
import type { Foot, Lane } from '@/lib/bodysequence3d/sequence';
import { drawFoot } from './glyph';

/**
 * Procedural textures for Body Sequence. Nothing is downloaded: every texture is painted once on a canvas, cached for
 * the page's life and shared by every scene (never disposed with a scene).
 */
const cache = new Map<string, THREE.CanvasTexture>();

export function canvasTexture(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = opts.aniso ?? 4;
  cache.set(key, tex);
  return tex;
}

export const COLORS = {
  cyan: '#38d9ff', cyanDeep: '#0b6f9c', violet: '#8a5cff', magenta: '#ff4fd8', gold: '#ffc233', coral: '#ff7a59',
  orange: '#ff9a1f', green: '#35e58b', red: '#ff4b55', ink: '#070b22', steel: '#101938',
} as const;

const FONT = "800 %spx 'Segoe UI', 'Noto Sans Arabic', Tahoma, system-ui, sans-serif";
const font = (px: number) => FONT.replace('%s', String(px));

export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export function ringTexture(): THREE.CanvasTexture {
  return canvasTexture('ring', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

/** Brushed dark steel with panel seams, faint scratches and a cool vignette, like the reference's metallic floor. Tileable. */
export function floorTexture(): THREE.CanvasTexture {
  return canvasTexture('floor', 1024, 1024, (ctx, w, h) => {
    const rng = mulberry32(8123);
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#0e1736'); base.addColorStop(0.5, '#141f46'); base.addColorStop(1, '#0c1432');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    // brushed streaks
    for (let i = 0; i < 700; i++) {
      const y = rng() * h, x = rng() * w, len = 60 + rng() * 260;
      ctx.strokeStyle = `rgba(${130 + rng() * 80},${160 + rng() * 70},255,${0.015 + rng() * 0.03})`;
      ctx.lineWidth = 1 + rng() * 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rng() - 0.5) * 3); ctx.stroke();
    }
    // panels: 2 x 2 seams per tile
    ctx.strokeStyle = 'rgba(80,200,255,0.18)'; ctx.lineWidth = 3;
    for (const p of [0, w / 2]) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (const p of [6, w / 2 + 6]) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke(); }
    // rivets at seam crossings
    ctx.fillStyle = 'rgba(160,220,255,0.35)';
    for (const x of [0, w / 2, w]) for (const y of [0, h / 2, h]) for (const [dx, dy] of [[14, 14], [-14, 14], [14, -14], [-14, -14]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 3, 0, 7); ctx.fill(); }
    // scuffs
    for (let i = 0; i < 90; i++) {
      const x = rng() * w, y = rng() * h;
      ctx.strokeStyle = `rgba(190,230,255,${0.05 + rng() * 0.1})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + rng() * 60, y + rng() * 40, x + rng() * 90, y - rng() * 40, x + rng() * 120 - 40, y + rng() * 80 - 30); ctx.stroke();
    }
  }, { repeat: true });
}

export function wallTexture(): THREE.CanvasTexture {
  return canvasTexture('wall', 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05081c'); g.addColorStop(1, '#0d1a3d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(110,200,255,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(110,200,255,0.16)'; ctx.lineWidth = 2;
    for (let y = 40; y < h - 10; y += 34) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); }
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(160,220,255,0.18)'); sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
  });
}

/** Dark glass pad face with a soft inner gradient and faint hex grid; colour comes from the border and glow layers. */
export function padFaceTexture(): THREE.CanvasTexture {
  return canvasTexture('padface', 512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#13204a'); g.addColorStop(1, '#0a1230');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,190,255,0.10)'; ctx.lineWidth = 2;
    const s = 64;
    for (let y = 0; y < h + s; y += s * 0.86) for (let x = 0; x < w + s; x += s) {
      const ox = (Math.round(y / (s * 0.86)) % 2) * (s / 2);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k + Math.PI / 6; const px = x + ox + Math.cos(a) * s * 0.5, py = y + Math.sin(a) * s * 0.5; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
    }
    const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  });
}

export type GlyphTone = 'idle' | 'active' | 'done' | 'hold' | 'stop' | 'dim';
export const TONE: Record<GlyphTone, { stroke: string; fill: string; glow: string; text: string }> = {
  idle: { stroke: 'rgba(120,200,255,0.55)', fill: 'rgba(40,110,170,0.10)', glow: 'rgba(56,217,255,0.35)', text: 'rgba(170,225,255,0.8)' },
  dim: { stroke: 'rgba(120,200,255,0.28)', fill: 'rgba(40,110,170,0.04)', glow: 'rgba(56,217,255,0.10)', text: 'rgba(170,225,255,0.45)' },
  active: { stroke: '#ffb347', fill: 'rgba(255,154,31,0.30)', glow: '#ff9a1f', text: '#ffd9a0' },
  done: { stroke: '#7dffbd', fill: 'rgba(53,229,139,0.30)', glow: '#35e58b', text: '#c9ffe3' },
  hold: { stroke: '#7fe9ff', fill: 'rgba(56,217,255,0.28)', glow: '#38d9ff', text: '#c9f6ff' },
  stop: { stroke: '#ff8a90', fill: 'rgba(255,75,85,0.30)', glow: '#ff4b55', text: '#ffd0d3' },
};

const arrowPath = (ctx: CanvasRenderingContext2D, lane: Lane, cx: number, cy: number, len: number) => {
  const dir = lane === 'L' ? [-1, 0] : lane === 'R' ? [1, 0] : lane === 'H' ? [0, 1] : [0, -1];
  const x1 = cx + dir[0] * len / 2, y1 = cy + dir[1] * len / 2, x0 = cx - dir[0] * len / 2, y0 = cy - dir[1] * len / 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  const h = len * 0.34, px = -dir[1], py = dir[0];
  ctx.moveTo(x1 - dir[0] * h + px * h, y1 - dir[1] * h + py * h); ctx.lineTo(x1, y1); ctx.lineTo(x1 - dir[0] * h - px * h, y1 - dir[1] * h - py * h);
  ctx.stroke();
};

/**
 * What a lane (or the neutral stance) shows: a big footprint of the required foot, an arrow that points the way the
 * foot travels (from the child's side), the Arabic foot/lane name and, optionally, the order number. Never colour alone.
 */
export function glyphTexture(o: { foot: Foot | null; lane: Lane; tone: GlyphTone; order?: number; label?: boolean; arrow?: boolean; lock?: boolean }): THREE.CanvasTexture {
  const key = `glyph:${o.foot ?? '-'}:${o.lane}:${o.tone}:${o.order ?? 0}:${o.label ? 1 : 0}:${o.arrow === false ? 0 : 1}:${o.lock ? 1 : 0}`;
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    const t = TONE[o.tone];
    ctx.clearRect(0, 0, w, h);
    if (o.foot) {
      drawFoot(ctx, o.foot, w / 2, h * 0.37, h * 0.6, { stroke: t.stroke, fill: t.fill, glow: t.glow, lineWidth: 7 });
      if (o.lock) {
        ctx.save(); ctx.strokeStyle = t.stroke; ctx.lineWidth = 7; ctx.shadowColor = t.glow; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.37, h * 0.37, 0, Math.PI * 2); ctx.setLineDash([16, 14]); ctx.stroke(); ctx.restore();
      }
    }
    if (o.arrow !== false && o.foot && o.tone !== 'idle' && o.tone !== 'dim') {
      ctx.save(); ctx.strokeStyle = t.stroke; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = t.glow; ctx.shadowBlur = 22;
      arrowPath(ctx, o.lane, w / 2, h * 0.8, o.lane === 'C' || o.lane === 'H' ? 78 : 150);
      ctx.restore();
    }
    if (o.label) {
      ctx.save(); ctx.fillStyle = t.text; ctx.font = font(54); ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.shadowColor = t.glow; ctx.shadowBlur = 14;
      ctx.fillText(o.foot ? `${FOOT_AR[o.foot]}` : LANE_SHORT_AR[o.lane], w / 2, h * 0.97);
      ctx.restore();
    }
    if (o.order) {
      ctx.save(); ctx.beginPath(); ctx.arc(w * 0.16, h * 0.14, 52, 0, 7); ctx.fillStyle = 'rgba(8,14,40,0.85)'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = t.stroke; ctx.shadowColor = t.glow; ctx.shadowBlur = 16; ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = font(66); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(o.order), w * 0.16, h * 0.14 + 3); ctx.restore();
    }
  });
}

export function lanePlateTexture(lane: Lane, tone: GlyphTone): THREE.CanvasTexture {
  return canvasTexture(`plate:${lane}:${tone}`, 512, 128, (ctx, w, h) => {
    const t = TONE[tone];
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = t.text; ctx.font = font(78); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.shadowColor = t.glow; ctx.shadowBlur = 16;
    ctx.fillText(LANE_SHORT_AR[lane], w / 2, h / 2);
  });
}

export function checkTexture(): THREE.CanvasTexture {
  return canvasTexture('check', 256, 256, (ctx, w, h) => {
    ctx.strokeStyle = '#baffd9'; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#35e58b'; ctx.shadowBlur = 28;
    ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.54); ctx.lineTo(w * 0.43, h * 0.74); ctx.lineTo(w * 0.8, h * 0.28); ctx.stroke();
  });
}

/** Octagonal stop sign with a raised palm bar: shape, text and colour all say "stand still". */
export function stopTexture(): THREE.CanvasTexture {
  return canvasTexture('stop', 512, 512, (ctx, w, h) => {
    ctx.shadowColor = '#ff4b55'; ctx.shadowBlur = 36;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i + Math.PI / 8; const x = w / 2 + Math.cos(a) * w * 0.4, y = h / 2 + Math.sin(a) * h * 0.4; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fillStyle = 'rgba(255,75,85,0.28)'; ctx.fill(); ctx.lineWidth = 14; ctx.strokeStyle = '#ff8a90'; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = font(150); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillText('قِف', w / 2, h / 2 + 8);
  });
}

export function chevronTexture(): THREE.CanvasTexture {
  return canvasTexture('chev', 128, 128, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.7); ctx.lineTo(w * 0.5, h * 0.35); ctx.lineTo(w * 0.8, h * 0.7); ctx.stroke();
  }, { repeat: true });
}

export function rayTexture(): THREE.CanvasTexture {
  return canvasTexture('rays', 256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 12; i++) { ctx.rotate((Math.PI * 2) / 12); const g = ctx.createLinearGradient(0, 0, 0, -h / 2); g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -h / 2); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill(); }
  });
}
