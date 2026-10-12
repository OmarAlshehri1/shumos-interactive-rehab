import * as THREE from "three";
import { mulberry32 } from "@/lib/runnerquest3d/rng";
import type { Own } from "./own";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}
function finish(own: Own, c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = own.tex(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

/** Tileable grass: soft blotches + short blade strokes. */
export function grassTexture(own: Own, a: string, b: string): THREE.CanvasTexture {
  const S = 512, [c, g] = canvas(S, S), r = mulberry32(11);
  g.fillStyle = a; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, rad = 30 + r() * 70;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, r() < 0.5 ? b + "88" : "#00000012"); gr.addColorStop(1, "#00000000");
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  g.strokeStyle = "#ffffff18"; g.lineWidth = 1.3;
  for (let i = 0; i < 1400; i++) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 5); g.stroke(); }
  g.strokeStyle = "#00000014";
  for (let i = 0; i < 900; i++) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke(); }
  return finish(own, c);
}

/** Warm sandy cobble path. */
export function pathTexture(own: Own): THREE.CanvasTexture {
  const S = 512, [c, g] = canvas(S, S), r = mulberry32(5);
  g.fillStyle = "#d9c9a3"; g.fillRect(0, 0, S, S);
  const rows = 8, cols = 6, rh = S / rows, cw = S / cols;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ox = (y % 2) * cw * 0.5 + (r() - 0.5) * 6, oy = (r() - 0.5) * 4;
    const tone = 200 + Math.round(r() * 30), warm = Math.round(r() * 12);
    g.fillStyle = `rgb(${tone + warm},${tone - 8 + warm / 2},${tone - 42})`;
    g.beginPath();
    const px = x * cw + ox, py = y * rh + oy, rr = 9;
    for (const dx of [0, S, -S]) {
      g.roundRect(px + 3 + dx, py + 3, cw - 6, rh - 6, rr);
    }
    g.fill();
  }
  g.fillStyle = "#00000010";
  for (let i = 0; i < 500; i++) g.fillRect(r() * S, r() * S, 2, 2);
  return finish(own, c);
}

/** Radial soft glow used by sprites/particles. */
export function glowTexture(own: Own): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "#ffffffff"); gr.addColorStop(0.4, "#ffffff66"); gr.addColorStop(1, "#ffffff00");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return finish(own, c, false);
}

/** Vertical alpha ramp: transparent at the far end, opaque near the obstacle. */
export function rampTexture(own: Own): THREE.CanvasTexture {
  const [c, g] = canvas(8, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#ffffff00"); gr.addColorStop(1, "#ffffffff");
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  return finish(own, c, false);
}

/** Dashed lane divider (alpha dashes). */
export function dashTexture(own: Own): THREE.CanvasTexture {
  const [c, g] = canvas(16, 128);
  g.fillStyle = "#ffffff"; g.fillRect(4, 8, 8, 62);
  return finish(own, c);
}

/** Sky gradient strip. */
export function skyTexture(own: Own, top: number, bottom: number): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#" + new THREE.Color(top).getHexString()); gr.addColorStop(0.7, "#" + new THREE.Color(bottom).getHexString()); gr.addColorStop(1, "#" + new THREE.Color(bottom).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return finish(own, c, false);
}

/** Arabic banner text on a rounded plate. */
export function bannerTexture(own: Own, text: string, bg = "#ff8a3d", fg = "#ffffff"): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, 504, 120, 28); g.fill();
  g.strokeStyle = "#ffffffcc"; g.lineWidth = 6; g.beginPath(); g.roundRect(12, 12, 488, 104, 22); g.stroke();
  g.fillStyle = fg; g.font = "700 62px 'Baloo Bhaijaan 2', 'IBM Plex Sans Arabic', 'Geeza Pro', system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.direction = "rtl";
  g.fillText(text, 256, 68);
  return finish(own, c, false);
}
