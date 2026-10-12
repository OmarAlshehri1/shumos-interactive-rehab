import * as THREE from 'three';
import { COLORS, SYMBOL_PATHS, type ColorId } from '@/lib/colorchase3d/colors';
import { mulberry32 } from '@/lib/colorchase3d/rng';

/**
 * Procedural textures for The Lost Colors garden. Nothing is downloaded: every texture is painted once on a small canvas,
 * cached for the page's life, and shared by every scene (they are never disposed with a scene).
 */
const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
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
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Tileable lawn: soft color drift plus thousands of short blades in three greens. */
export function grassTexture(world: 0 | 1 | 2): THREE.CanvasTexture {
  const palettes = [
    { base: [92, 54, 48], blades: [[88, 58, 60], [100, 52, 52], [82, 60, 44]] },
    { base: [104, 48, 44], blades: [[108, 50, 56], [98, 54, 46], [114, 46, 40]] },
    { base: [128, 38, 44], blades: [[134, 40, 54], [120, 44, 44], [140, 36, 38]] },
  ];
  const pal = palettes[world];
  return canvasTexture(`grass${world}`, 512, 512, (ctx, w, h) => {
    const rng = mulberry32(5000 + world);
    ctx.fillStyle = hsl(pal.base[0], pal.base[1], pal.base[2]);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rng() * w, y = rng() * h, r = 40 + rng() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const lt = pal.base[2] + (rng() - 0.5) * 12;
      g.addColorStop(0, hsl(pal.base[0] + (rng() - 0.5) * 12, pal.base[1], lt, 0.4));
      g.addColorStop(1, hsl(pal.base[0], pal.base[1], lt, 0));
      ctx.fillStyle = g;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
    }
    for (let i = 0; i < 5200; i++) {
      const [bh, bs, bl] = pal.blades[Math.floor(rng() * 3)];
      ctx.strokeStyle = hsl(bh + (rng() - 0.5) * 8, bs, bl + (rng() - 0.5) * 10, 0.55 + rng() * 0.3);
      ctx.lineWidth = 1 + rng() * 1.4;
      const x = rng() * w, y = rng() * h, a = -Math.PI / 2 + (rng() - 0.5) * 1.1, l = 5 + rng() * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }, { repeat: true });
}

/** Warm cobblestone paving for garden paths (tileable along its length). */
export function cobbleTexture(): THREE.CanvasTexture {
  return canvasTexture('cobble', 512, 256, (ctx, w, h) => {
    const rng = mulberry32(777);
    ctx.fillStyle = '#8e8574';
    ctx.fillRect(0, 0, w, h);
    const rows = 4, cols = 8;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ((c + (r % 2) * 0.5) / cols) * w + (rng() - 0.5) * 6, y = (r / rows) * h + (rng() - 0.5) * 4;
      const sw = (w / cols) * (0.86 + rng() * 0.08), sh = (h / rows) * 0.84;
      const l = 56 + rng() * 18;
      const g = ctx.createLinearGradient(x, y, x + sw, y + sh);
      g.addColorStop(0, hsl(36 + rng() * 10, 14 + rng() * 8, l + 8));
      g.addColorStop(1, hsl(32 + rng() * 10, 12 + rng() * 8, l - 8));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, sw, sh, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,40,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, { repeat: true });
}

/** Weathered stone for basins, columns and rocks. */
export function stoneTexture(): THREE.CanvasTexture {
  return canvasTexture('stone', 256, 256, (ctx, w, h) => {
    const rng = mulberry32(31);
    ctx.fillStyle = '#b9b2a4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = hsl(36 + rng() * 14, 8 + rng() * 10, 52 + rng() * 26, 0.2);
      const r = 4 + rng() * 22;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,60,50,0.25)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = rng() * w, y = rng() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, { repeat: true });
}

export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture('glow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A ring of light with a soft falloff on both sides: used for target halos and restoration ripples. */
export function ringTexture(): THREE.CanvasTexture {
  return canvasTexture('ring', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.04)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Translucent illuminated zone surface: bright rim fading to a gentle centre. */
export function zoneTexture(): THREE.CanvasTexture {
  return canvasTexture('zone', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.94)');
    g.addColorStop(0.92, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.96)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    // faint concentric light bands so the surface reads as a lit disc, not a flat sticker
    ctx.lineWidth = 2;
    for (const [rf, a] of [[0.62, 0.16], [0.8, 0.12]] as const) {
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, (w / 2) * rf, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** Dashed circle drawn once; the Display rotates it slowly as the "gentle animated border". */
export function dashTexture(): THREE.CanvasTexture {
  return canvasTexture('dash', 512, 512, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    const n = 36, r = w / 2 - 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, a, a + (Math.PI * 2) / n * 0.5);
      ctx.stroke();
    }
  });
}

/** The zone's shape: white fill with a dark outline, so it reads on any color and for children who cannot tell colors apart. */
export function symbolTexture(color: ColorId): THREE.CanvasTexture {
  return canvasTexture(`symbol-${color}`, 256, 256, (ctx, w, h) => {
    const path = new Path2D(SYMBOL_PATHS[COLORS[color].symbol]);
    ctx.save();
    ctx.translate(w * 0.1, h * 0.1);
    ctx.scale((w * 0.8) / 100, (h * 0.8) / 100);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = COLORS[color].deep;
    ctx.stroke(path);
    ctx.fillStyle = '#ffffff';
    ctx.fill(path);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke(path);
    ctx.restore();
  });
}

/** The color's name in large letters, white with a dark outline. */
export function labelTexture(color: ColorId): THREE.CanvasTexture {
  return canvasTexture(`label-${color}`, 512, 160, (ctx, w, h) => {
    ctx.font = '700 104px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = COLORS[color].deep;
    ctx.strokeText(COLORS[color].nameAr, w / 2, h / 2 + 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(COLORS[color].nameAr, w / 2, h / 2 + 4);
  });
}

export function wingTexture(): THREE.CanvasTexture {
  return canvasTexture('wing', 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const lobe = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(235,235,235,1)'); g.addColorStop(1, 'rgba(90,90,90,1)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    lobe(120, 100, 100, 70, -0.35);
    lobe(100, 175, 70, 48, 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, r] of [[170, 70, 9], [130, 60, 6], [140, 170, 7]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  });
}

/** Slowly drifting leaf shadows. */
export function dappleTexture(): THREE.CanvasTexture {
  return canvasTexture('dapple', 512, 512, (ctx, w, h) => {
    const rng = mulberry32(991);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 14 + rng() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(20,40,20,0.5)');
      g.addColorStop(1, 'rgba(20,40,20,0)');
      ctx.fillStyle = g;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
    }
  }, { repeat: true });
}

export function disposeTextureCache() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
