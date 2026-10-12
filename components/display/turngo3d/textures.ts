import * as THREE from 'three';
import { mulberry32 } from '@/lib/footsteps3d/rng';
import type { ThemeId } from '@/lib/turngo3d/stages';

/**
 * Procedural textures for Turn & Go. Nothing is downloaded: every texture is painted once on a canvas, cached for the
 * page's life and shared by every scene (never disposed with a scene).
 */
const cache = new Map<string, THREE.CanvasTexture>();

export function canvasTexture(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = opts.aniso ?? 4;
  cache.set(key, tex);
  return tex;
}

export const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Wraps a soft blob so it tiles seamlessly. */
function tiled(w: number, h: number, x: number, y: number, r: number, fn: (ox: number, oy: number) => void) {
  for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
    if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
    fn(ox, oy);
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number, base: { h: number; s: number; l: number }, count: number, rMin: number, rMax: number, spreadL: number, alpha = 0.35) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w, y = rng() * h, r = rMin + rng() * (rMax - rMin);
    const l = base.l + (rng() - 0.5) * spreadL;
    const hh = base.h + (rng() - 0.5) * 14;
    tiled(w, h, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, hsl(hh, base.s, l, alpha));
      g.addColorStop(1, hsl(hh, base.s, l, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
}

type GroundKind = 'grass' | 'rubber' | 'meadow' | 'sand' | 'plaza' | 'moss' | 'night' | 'asphalt' | 'stage';
const GROUND_KIND: Record<ThemeId, GroundKind> = { garden: 'grass', playground: 'rubber', flowers: 'meadow', beach: 'sand', festivalPark: 'plaza', forest: 'moss', luminous: 'night', town: 'asphalt', finale: 'stage' };

/** Tileable ground (1024²). Detail is painted, not geometric, so the ground is a single quad. */
export function groundTexture(theme: ThemeId): THREE.CanvasTexture {
  const kind = GROUND_KIND[theme];
  return canvasTexture(`ground:${kind}`, 1024, 1024, (ctx, w, h) => {
    const rng = mulberry32(4100 + kind.length * 31 + theme.length);
    const grass = (base: { h: number; s: number; l: number }, blades: number) => {
      ctx.fillStyle = hsl(base.h, base.s, base.l);
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, base, 80, 70, 190, 12, 0.34);
      ctx.lineCap = 'round';
      for (let i = 0; i < blades; i++) {
        const x = rng() * w, y = rng() * h, len = 5 + rng() * 11, a = -Math.PI / 2 + (rng() - 0.5) * 1.1;
        ctx.strokeStyle = hsl(base.h + (rng() - 0.5) * 22, base.s + 8, base.l + (rng() - 0.45) * 22, 0.55);
        ctx.lineWidth = 1 + rng() * 1.6;
        tiled(w, h, x, y, 14, (ox, oy) => { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); ctx.stroke(); });
      }
    };
    if (kind === 'grass') grass({ h: 100, s: 50, l: 42 }, 9000);
    else if (kind === 'meadow') {
      grass({ h: 108, s: 46, l: 40 }, 8000);
      for (let i = 0; i < 260; i++) { // clover and tiny blossoms
        const x = rng() * w, y = rng() * h;
        ctx.fillStyle = hsl([50, 330, 0, 280][i % 4], 80, 82, 0.8);
        tiled(w, h, x, y, 4, (ox, oy) => { ctx.beginPath(); ctx.arc(x + ox, y + oy, 1.5 + rng() * 2.2, 0, 7); ctx.fill(); });
      }
    } else if (kind === 'moss') {
      grass({ h: 122, s: 38, l: 30 }, 7000);
      blotches(ctx, w, h, rng, { h: 95, s: 40, l: 36 }, 40, 30, 90, 14, 0.22);
      ctx.strokeStyle = hsl(30, 25, 20, 0.35);
      ctx.lineWidth = 2;
      for (let i = 0; i < 70; i++) { // fallen twigs
        const x = rng() * w, y = rng() * h, a = rng() * 6.28, l = 12 + rng() * 26;
        tiled(w, h, x, y, 30, (ox, oy) => { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); ctx.stroke(); });
      }
    } else if (kind === 'night') {
      grass({ h: 168, s: 36, l: 17 }, 7000);
      blotches(ctx, w, h, rng, { h: 190, s: 50, l: 26 }, 36, 40, 120, 16, 0.2);
      for (let i = 0; i < 140; i++) { // faint luminous spores
        const x = rng() * w, y = rng() * h, r = 2 + rng() * 4;
        tiled(w, h, x, y, r * 3, (ox, oy) => {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r * 3);
          g.addColorStop(0, hsl(170 + rng() * 60, 90, 70, 0.55)); g.addColorStop(1, hsl(180, 90, 60, 0));
          ctx.fillStyle = g; ctx.fillRect(x + ox - r * 3, y + oy - r * 3, r * 6, r * 6);
        });
      }
    } else if (kind === 'sand') {
      ctx.fillStyle = hsl(40, 62, 70); ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, { h: 38, s: 60, l: 70 }, 90, 60, 170, 14, 0.4);
      ctx.lineWidth = 2;
      for (let i = 0; i < 38; i++) { // wind ripples
        const y0 = rng() * h; ctx.strokeStyle = hsl(36, 50, 60 + rng() * 14, 0.28);
        ctx.beginPath(); for (let x = 0; x <= w; x += 16) { const y = y0 + Math.sin(x / 70 + i) * 7; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      }
      for (let i = 0; i < 6000; i++) { ctx.fillStyle = hsl(38, 50, 55 + rng() * 38, 0.5); ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 1.6, 1 + rng() * 1.6); }
    } else if (kind === 'rubber') {
      // playground safety surface: big rounded colour tiles with a fine pebbled grain
      const cols = [[205, 42, 62], [150, 36, 58], [48, 55, 66], [335, 38, 68]];
      const n = 4, s = w / n;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const [hh, ss, ll] = cols[(r + c * 2 + (r > 1 ? 1 : 0)) % 4];
        ctx.fillStyle = hsl(hh, ss, ll); ctx.fillRect(c * s, r * s, s, s);
        ctx.strokeStyle = hsl(hh, ss, ll - 16, 0.9); ctx.lineWidth = 6; ctx.strokeRect(c * s + 3, r * s + 3, s - 6, s - 6);
      }
      for (let i = 0; i < 12000; i++) { ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rng() * 0.08})`; ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5); }
    } else if (kind === 'plaza') {
      // warm plaza with a diagonal paving pattern
      ctx.fillStyle = hsl(28, 30, 58); ctx.fillRect(0, 0, w, h);
      const s = 128;
      for (let r = 0; r < w / s; r++) for (let c = 0; c < w / s; c++) {
        const l = 52 + rng() * 12, hh = 24 + rng() * 12;
        ctx.fillStyle = hsl(hh, 34, l); ctx.fillRect(c * s + 2, r * s + 2, s - 4, s - 4);
        ctx.fillStyle = hsl(hh, 30, l + 6, 0.5); ctx.fillRect(c * s + 2, r * s + 2, s - 4, 6);
      }
      blotches(ctx, w, h, rng, { h: 30, s: 30, l: 56 }, 40, 60, 160, 10, 0.25);
    } else if (kind === 'asphalt') {
      ctx.fillStyle = hsl(215, 8, 30); ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, { h: 215, s: 8, l: 30 }, 70, 40, 140, 10, 0.35);
      for (let i = 0; i < 16000; i++) { ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rng() * 0.1})`; ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5); }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) { ctx.beginPath(); let x = rng() * w, y = rng() * h; ctx.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rng() - 0.5) * 80; y += (rng() - 0.5) * 80; ctx.lineTo(x, y); } ctx.stroke(); }
    } else {
      // festival stage: deep blue-violet lacquer with soft light pools and gold specks
      ctx.fillStyle = hsl(250, 45, 22); ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, { h: 285, s: 55, l: 32 }, 60, 80, 220, 14, 0.3);
      blotches(ctx, w, h, rng, { h: 210, s: 70, l: 40 }, 30, 60, 160, 14, 0.2);
      for (let i = 0; i < 380; i++) { const x = rng() * w, y = rng() * h; ctx.fillStyle = hsl(45, 95, 70, 0.4 + rng() * 0.4); tiled(w, h, x, y, 3, (ox, oy) => { ctx.beginPath(); ctx.arc(x + ox, y + oy, 1 + rng() * 2, 0, 7); ctx.fill(); }); }
    }
  }, { repeat: true });
}

export type PathKind = 'pavers' | 'sandpath' | 'planks' | 'tiles' | 'glow' | 'road' | 'gold';
export const PATH_KIND: Record<ThemeId, PathKind> = { garden: 'pavers', playground: 'tiles', flowers: 'pavers', beach: 'planks', festivalPark: 'tiles', forest: 'sandpath', luminous: 'glow', town: 'road', finale: 'gold' };

/** How the corridor texture is laid on a ribbon of this width: u repeats across, v along, keeping tiles roughly square and paver-sized. */
export function pathUv(theme: ThemeId, width: number): { u: number; v: number } {
  const kind = PATH_KIND[theme];
  if (kind === 'road' || kind === 'glow' || kind === 'gold') return { u: 1, v: width };
  const u = Math.max(1, Math.round(width / (kind === 'planks' ? 2.6 : kind === 'tiles' ? 3.4 : 1.9)));
  return { u, v: width / u };
}

/** Corridor surface (512²). U runs across the corridor, V along it (the texture repeats along the route). */
export function pathTexture(theme: ThemeId): THREE.CanvasTexture {
  const kind = PATH_KIND[theme];
  return canvasTexture(`path:${kind}`, 512, 512, (ctx, w, h) => {
    const rng = mulberry32(900 + kind.length * 17);
    if (kind === 'pavers') {
      ctx.fillStyle = hsl(32, 18, 44); ctx.fillRect(0, 0, w, h);
      const rows = 4, cols = 3, rh = h / rows, cw = w / cols;
      for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
        const off = r % 2 ? cw / 2 : 0, x = c * cw + off, l = 70 + rng() * 10, hh = 34 + rng() * 10;
        ctx.fillStyle = hsl(hh, 26, l); ctx.beginPath(); ctx.roundRect(x + 4, r * rh + 4, cw - 8, rh - 8, 14); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 12, r * rh + 7, cw - 24, 5);
        ctx.fillStyle = hsl(hh, 24, l - 14, 0.22); for (let k = 0; k < 40; k++) ctx.fillRect(x + 8 + rng() * (cw - 16), r * rh + 8 + rng() * (rh - 16), 2, 2);
      }
    } else if (kind === 'sandpath') {
      ctx.fillStyle = hsl(35, 38, 62); ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, { h: 34, s: 38, l: 62 }, 40, 40, 120, 14, 0.4);
      for (let i = 0; i < 5000; i++) { ctx.fillStyle = hsl(34, 30, 40 + rng() * 40, 0.45); ctx.fillRect(rng() * w, rng() * h, 1.6, 1.6); }
      for (let i = 0; i < 26; i++) { ctx.fillStyle = hsl(30, 14, 52 + rng() * 14); ctx.beginPath(); ctx.ellipse(rng() * w, rng() * h, 6 + rng() * 10, 4 + rng() * 6, rng() * 3, 0, 7); ctx.fill(); }
    } else if (kind === 'planks') {
      const n = 4, ph = h / n;
      for (let i = 0; i < n; i++) {
        const hh = 28 + rng() * 8, l = 50 + rng() * 10;
        ctx.fillStyle = hsl(hh, 48, l); ctx.fillRect(0, i * ph, w, ph - 6);
        ctx.strokeStyle = hsl(hh, 40, l - 16, 0.5); ctx.lineWidth = 1.2;
        for (let g = 0; g < 18; g++) { const y = i * ph + 6 + rng() * (ph - 18); ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + rng() * 4 - 2, w * 0.6, y + rng() * 4 - 2, w, y); ctx.stroke(); }
        ctx.fillStyle = 'rgba(60,35,15,0.6)'; for (const x of [18, w - 18]) { ctx.beginPath(); ctx.arc(x, i * ph + ph / 2 - 3, 4, 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, i * ph, w, 4);
      }
      ctx.fillStyle = 'rgba(30,18,8,0.8)'; for (let i = 0; i < n; i++) ctx.fillRect(0, i * ph + ph - 6, w, 6);
    } else if (kind === 'tiles') {
      // cream candy tiles with a bold coloured centre, so the corridor never blends with the ground
      const n = 3, s = w / n, cols = [[355, 85, 58], [205, 90, 55], [45, 100, 56], [145, 65, 46], [285, 65, 62]];
      ctx.fillStyle = hsl(40, 25, 88); ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const [hh, ss, ll] = cols[(r * 2 + c) % cols.length];
        ctx.fillStyle = hsl(40, 30, 96); ctx.beginPath(); ctx.roundRect(c * s + 6, r * s + 6, s - 12, s - 12, 22); ctx.fill();
        ctx.fillStyle = hsl(hh, ss, ll); ctx.beginPath(); ctx.roundRect(c * s + 32, r * s + 32, s - 64, s - 64, 26); ctx.fill();
        const g = ctx.createLinearGradient(0, r * s, 0, r * s + s); g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(c * s + 32, r * s + 32, s - 64, s - 64, 26); ctx.fill();
      }
    } else if (kind === 'glow') {
      ctx.fillStyle = hsl(232, 48, 20); ctx.fillRect(0, 0, w, h);
      const n = 4, s = w / n;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const hue = 160 + ((r * 2 + c * 3) % 5) * 36;
        const g = ctx.createRadialGradient(c * s + s / 2, r * s + s / 2, 4, c * s + s / 2, r * s + s / 2, s * 0.62);
        g.addColorStop(0, hsl(hue, 95, 72, 1)); g.addColorStop(0.55, hsl(hue, 90, 52, 0.7)); g.addColorStop(1, hsl(hue, 85, 36, 0.1));
        ctx.fillStyle = g; ctx.fillRect(c * s, r * s, s, s);
        ctx.strokeStyle = hsl(hue, 90, 75, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(c * s + 10, r * s + 10, s - 20, s - 20, 14); ctx.stroke();
      }
    } else if (kind === 'road') {
      ctx.fillStyle = hsl(220, 8, 22); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(255,255,255,${0.03 + rng() * 0.08})`; ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5); }
      ctx.fillStyle = hsl(48, 95, 62); for (let y = 0; y < h; y += 128) ctx.fillRect(w / 2 - 6, y + 20, 12, 70);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(14, 0, 6, h); ctx.fillRect(w - 20, 0, 6, h);
    } else {
      // gold: warm polished stone with a gold inlay border
      ctx.fillStyle = hsl(40, 55, 58); ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, rng, { h: 42, s: 60, l: 62 }, 50, 40, 120, 18, 0.4);
      const s = 128;
      for (let r = 0; r < h / s; r++) for (let c = 0; c < w / s; c++) { ctx.strokeStyle = 'rgba(120,70,0,0.28)'; ctx.lineWidth = 2; ctx.strokeRect(c * s + 1, r * s + 1, s - 2, s - 2); }
      ctx.fillStyle = hsl(46, 95, 60); ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, 4, h); ctx.fillRect(w - 14, 0, 4, h);
    }
  }, { repeat: true });
}

/** Soft round glow sprite, white: tinted by the material colour. */
export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

/** A ring with soft edges for beacons / pulses (white, tinted by material). */
export function ringTexture(): THREE.CanvasTexture {
  return canvasTexture('ring', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(255,255,255,0.0)'); g.addColorStop(0.78, 'rgba(255,255,255,1)'); g.addColorStop(0.9, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

/** Chevron (">") pointing along +V of its plane: used for the flowing direction arrows. Drawn with a dark keyline for contrast. */
export function chevronTexture(): THREE.CanvasTexture {
  return canvasTexture('chevron', 256, 256, (ctx, w, h) => {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const draw = (lw: number, style: string) => { ctx.lineWidth = lw; ctx.strokeStyle = style; ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.78); ctx.lineTo(w * 0.5, h * 0.3); ctx.lineTo(w * 0.88, h * 0.78); ctx.stroke(); };
    draw(70, 'rgba(15,25,45,0.55)');
    draw(46, 'rgba(255,255,255,1)');
  });
}

/** Big solid direction arrow (points toward -Y of the canvas = "up"). */
export function bigArrowTexture(): THREE.CanvasTexture {
  return canvasTexture('bigarrow', 256, 384, (ctx, w, h) => {
    const path = () => { ctx.beginPath(); ctx.moveTo(w / 2, 14); ctx.lineTo(w - 14, h * 0.5); ctx.lineTo(w * 0.7, h * 0.5); ctx.lineTo(w * 0.7, h - 14); ctx.lineTo(w * 0.3, h - 14); ctx.lineTo(w * 0.3, h * 0.5); ctx.lineTo(14, h * 0.5); ctx.closePath(); };
    ctx.lineJoin = 'round'; path(); ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(12,22,45,0.65)'; ctx.stroke();
    path(); const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#bdf4ff'); ctx.fillStyle = g; ctx.fill();
  });
}

/** Stop pad: a red octagon with a white hand, readable from above without any text. */
export function stopPadTexture(): THREE.CanvasTexture {
  return canvasTexture('stoppad', 512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = 'rgba(10,15,30,0.4)'; ctx.beginPath(); ctx.arc(cx, cy, 250, 0, 7); ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i + Math.PI / 8; const px = cx + Math.cos(a) * 232, py = cy + Math.sin(a) * 232; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    const finger = (x: number, top: number, wd: number) => { ctx.beginPath(); ctx.roundRect(x, top, wd, cy + 60 - top, wd / 2); ctx.fill(); };
    finger(cx - 112, cy - 126, 46); finger(cx - 58, cy - 168, 46); finger(cx - 4, cy - 176, 46); finger(cx + 50, cy - 150, 46);
    ctx.beginPath(); ctx.roundRect(cx - 118, cy - 40, 172, 150, 56); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 110, cy + 6, 26, 62, -0.7, 0, 7); ctx.fill();
  });
}

/** Traffic light panel, one canvas per lit lamp. */
export function trafficTexture(lit: 'red' | 'amber' | 'green' | 'none'): THREE.CanvasTexture {
  return canvasTexture(`traffic:${lit}`, 192, 448, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8,14,28,0.92)'; ctx.beginPath(); ctx.roundRect(8, 8, w - 16, h - 16, 40); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    const lamps: [string, string, string][] = [['red', '#ff3b46', '#4a1218'], ['amber', '#ffb020', '#4a3410'], ['green', '#3ddc84', '#0f3a24']];
    lamps.forEach(([name, on, off], i) => {
      const cy = 76 + i * 148, isOn = name === lit;
      if (isOn) { const g = ctx.createRadialGradient(w / 2, cy, 10, w / 2, cy, 92); g.addColorStop(0, on); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, cy - 92, w, 184); }
      ctx.fillStyle = isOn ? on : off; ctx.beginPath(); ctx.arc(w / 2, cy, 50, 0, 7); ctx.fill();
      if (isOn) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2 - 14, cy - 18, 18, 11, -0.5, 0, 7); ctx.fill(); }
    });
  });
}

/** Cone number badge (setup preview). */
export function numberTexture(n: number, color = '#ffffff'): THREE.CanvasTexture {
  return canvasTexture(`num:${n}:${color}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,20,40,0.82)'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 56, 0, 7); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '700 70px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), w / 2, h / 2 + 4);
  });
}

/** Footprints for the start marker. */
export function footprintsTexture(): THREE.CanvasTexture {
  return canvasTexture('feet', 256, 256, (ctx, w, h) => {
    const foot = (x: number, y: number, rot: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.ellipse(0, 22, 20, 36, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1, -30, 16, 20, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-15 + i * 7.5, -58 + Math.abs(i - 2) * 4, 5.5 - i * 0.2, 0, 7); ctx.fill(); }
      ctx.restore();
    };
    foot(w * 0.34, h * 0.56, -0.08); foot(w * 0.66, h * 0.42, 0.08);
  });
}

/** Checkered finish strip. */
export function checkerTexture(): THREE.CanvasTexture {
  return canvasTexture('checker', 256, 64, (ctx, w, h) => {
    const s = 32;
    for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { ctx.fillStyle = (x + y) % 2 ? '#14213d' : '#ffffff'; ctx.fillRect(x * s, y * s, s, s); }
  }, { repeat: true });
}

/** Building facade with lit windows (Miniature Town). */
export function facadeTexture(seed: number): THREE.CanvasTexture {
  const k = seed % 4;
  return canvasTexture(`facade:${k}`, 256, 256, (ctx, w, h) => {
    const rng = mulberry32(777 + k);
    const hue = [12, 200, 48, 340][k];
    ctx.fillStyle = hsl(hue, 55, 62); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) { ctx.fillStyle = `rgba(0,0,0,${rng() * 0.07})`; ctx.fillRect(rng() * w, rng() * h, 3, 3); }
    const cols = 3, rows = 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = 24 + c * 76, y = 24 + r * 76, lit = rng() > 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 4, y - 4, 56, 62);
      ctx.fillStyle = lit ? hsl(46, 100, 72) : hsl(210, 40, 45); ctx.fillRect(x, y, 48, 54);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, 48, 8);
      ctx.fillStyle = 'rgba(40,30,20,0.55)'; ctx.fillRect(x + 22, y, 4, 54); ctx.fillRect(x, y + 25, 48, 4);
    }
  });
}

/** Leaf-like sparkle for particles. */
export function sparkleTexture(): THREE.CanvasTexture {
  return canvasTexture('sparkle', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w / 2, 2); ctx.lineTo(w / 2, h - 2); ctx.moveTo(2, h / 2); ctx.lineTo(w - 2, h / 2); ctx.stroke();
  });
}

/** Square confetti piece. */
export function confettiTexture(): THREE.CanvasTexture {
  return canvasTexture('confetti', 32, 32, (ctx) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(4, 8, 24, 16, 3); ctx.fill(); });
}

/** Soft ring for bubbles. */
export function bubbleTexture(): THREE.CanvasTexture {
  return canvasTexture('bubble', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2 - 2);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(w * 0.36, h * 0.34, 6, 3.5, -0.6, 0, 7); ctx.fill();
  });
}

/** Wave foam strip (beach). */
export function foamTexture(): THREE.CanvasTexture {
  return canvasTexture('foam', 512, 128, (ctx, w, h) => {
    const rng = mulberry32(55);
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) { const x = rng() * w, y = h * 0.25 + rng() * h * 0.5, r = 3 + rng() * 11; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  }, { repeat: true });
}

/** Butterfly wing: two lobes, vein lines, coloured by `hue` (the quad's material colour tints it white). */
export function wingTexture(hue: number): THREE.CanvasTexture {
  return canvasTexture(`wing:${hue}`, 128, 100, (ctx, w, h) => {
    ctx.translate(0, 0);
    const lobe = (cx: number, cy: number, rx: number, ry: number, rot: number, light: number) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = hsl(hue, 90, light); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(30,20,30,0.7)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); };
    lobe(w * 0.5, h * 0.36, w * 0.5, h * 0.3, -0.35, 58);
    lobe(w * 0.34, h * 0.72, w * 0.3, h * 0.22, 0.4, 66);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const [x, y, r] of [[0.56, 0.34, 0.07], [0.42, 0.7, 0.05], [0.74, 0.28, 0.045]]) { ctx.beginPath(); ctx.arc(w * x, h * y, h * r, 0, 7); ctx.fill(); }
  });
}
