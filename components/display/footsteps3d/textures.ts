import * as THREE from 'three';
import { mulberry32 } from '@/lib/footsteps3d/rng';

/**
 * Procedural textures for the Enchanted Forest. Nothing is downloaded: every texture is painted once on a small canvas,
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

/** Tileable grass: soft colour drift plus thousands of short blades in three greens. */
export function grassTexture(world: 0 | 1 | 2): THREE.CanvasTexture {
  const palettes = [
    { h: 100, s: 48, l: 44 }, // sunny garden
    { h: 112, s: 42, l: 33 }, // riverside forest
    { h: 150, s: 34, l: 30 }, // twilight forest
  ];
  const p = palettes[world];
  return canvasTexture(`grass${world}`, 1024, 1024, (ctx, w, h) => {
    const rng = mulberry32(1000 + world);
    ctx.fillStyle = hsl(p.h, p.s, p.l);
    ctx.fillRect(0, 0, w, h);
    // large soft drift
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 60 + rng() * 150;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        const l = p.l + (rng() - 0.5) * 12;
        g.addColorStop(0, hsl(p.h + (rng() - 0.5) * 16, p.s, l, 0.35));
        g.addColorStop(1, hsl(p.h, p.s, l, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    // blades
    ctx.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = rng() * w, y = rng() * h;
      const len = 5 + rng() * 11, a = -Math.PI / 2 + (rng() - 0.5) * 1.1;
      const l = p.l + (rng() - 0.45) * 22;
      ctx.strokeStyle = hsl(p.h + (rng() - 0.5) * 22, p.s + 8, l, 0.55);
      ctx.lineWidth = 1 + rng() * 1.6;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        if ((ox || oy) && x > 24 && x < w - 24 && y > 24 && y < h - 24) continue;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }, { repeat: true });
}

/** Three warm-grey stone variants with speckle, faint cracks and lichen. */
export function stoneTexture(variant: number): THREE.CanvasTexture {
  const v = variant % 3;
  return canvasTexture(`stone${v}`, 512, 512, (ctx, w, h) => {
    const rng = mulberry32(2000 + v);
    const base = [{ h: 34, s: 12, l: 62 }, { h: 28, s: 10, l: 56 }, { h: 40, s: 9, l: 66 }][v];
    ctx.fillStyle = hsl(base.h, base.s, base.l);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rng() * w, y = rng() * h, r = 20 + rng() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const l = base.l + (rng() - 0.5) * 16;
      g.addColorStop(0, hsl(base.h, base.s, l, 0.4));
      g.addColorStop(1, hsl(base.h, base.s, l, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 4500; i++) {
      ctx.fillStyle = hsl(base.h, base.s, base.l + (rng() - 0.5) * 38, 0.5);
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
    }
    ctx.strokeStyle = hsl(base.h, base.s + 4, base.l - 22, 0.35);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rng() * w, y = rng() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 70; y += (rng() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = hsl(95 + rng() * 30, 40, 40 + rng() * 14, 0.28);
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, 4 + rng() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Sandy riverbed with soft colour variation (pebbles are real instanced meshes). */
export function bedTexture(): THREE.CanvasTexture {
  return canvasTexture('bed', 512, 512, (ctx, w, h) => {
    const rng = mulberry32(3000);
    ctx.fillStyle = hsl(38, 30, 56);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const x = rng() * w, y = rng() * h, r = 20 + rng() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const l = 50 + rng() * 18;
      g.addColorStop(0, hsl(30 + rng() * 20, 28, l, 0.5));
      g.addColorStop(1, hsl(30, 28, l, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = hsl(35, 20, 40 + rng() * 30, 0.5);
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2.4, 1 + rng() * 2.4);
    }
  }, { repeat: true });
}

/** Soft round glow used for halos, blooms and fireflies. */
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

/** A halo that is transparent inside the stone and glows just outside its rim: it never washes out the stone's own top. */
export function rimGlowTexture(): THREE.CanvasTexture {
  return canvasTexture('rimglow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.575, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Butterfly wing: two soft lobes with a darker edge and pale spots. */
export function wingTexture(): THREE.CanvasTexture {
  return canvasTexture('wing', 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const lobe = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(235,235,235,1)'); g.addColorStop(1, 'rgba(90,90,90,1)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    lobe(20 + 100, 100, 100, 70, -0.35); // upper wing
    lobe(20 + 80, 175, 70, 48, 0.4); // lower wing
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, r] of [[170, 70, 9], [130, 60, 6], [140, 170, 7]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  });
}

/** Soft dark contact shadow. */
export function contactShadowTexture(): THREE.CanvasTexture {
  return canvasTexture('contact', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Footprint cue: a left, a right, or a neutral pair. White on transparent, tinted by the material. */
export function footTexture(kind: 'LEFT' | 'RIGHT' | 'PAIR'): THREE.CanvasTexture {
  return canvasTexture(`foot${kind}`, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    const foot = (cx: number, cy: number, rot: number, mirror: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(mirror, 1);
      ctx.beginPath();
      ctx.ellipse(0, 18, 26, 44, 0, 0, Math.PI * 2);
      ctx.fill();
      const toes: [number, number, number][] = [[-22, -34, 9], [-8, -46, 9], [8, -48, 8.5], [22, -42, 8], [31, -30, 7]];
      for (const [x, y, r] of toes) { ctx.beginPath(); ctx.arc(x * 0.9, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    if (kind === 'PAIR') { foot(w / 2 - 46, h / 2 + 8, -0.1, 1); foot(w / 2 + 46, h / 2 - 8, 0.1, -1); }
    else foot(w / 2, h / 2, 0, kind === 'RIGHT' ? -1 : 1);
  });
}

/** Number glyph for the memory preview ("1", "2"). */
export function digitTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(`digit${n}`, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 170px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w / 2, h / 2 + 8);
  });
}

/** Dappled sunlight through foliage: soft dark leaf-shadow blotches on transparent. */
export function dappleTexture(): THREE.CanvasTexture {
  return canvasTexture('dapple', 512, 512, (ctx, w, h) => {
    const rng = mulberry32(4000);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 18 + rng() * 46;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(6,26,10,0.5)');
        g.addColorStop(0.6, 'rgba(6,26,10,0.22)');
        g.addColorStop(1, 'rgba(6,26,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }, { repeat: true });
}

/** Soft low-frequency colour patches that break up the grass repetition. */
export function patchTexture(world: 0 | 1 | 2): THREE.CanvasTexture {
  const tints = [['rgba(255,244,160,0.30)', 'rgba(40,110,30,0.22)'], ['rgba(190,235,150,0.22)', 'rgba(10,50,40,0.28)'], ['rgba(150,200,255,0.20)', 'rgba(40,20,90,0.30)']][world];
  return canvasTexture(`patch${world}`, 512, 512, (ctx, w, h) => {
    const rng = mulberry32(5000 + world);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rng() * w, y = rng() * h, r = 50 + rng() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, tints[i % 2]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

export function disposeTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
