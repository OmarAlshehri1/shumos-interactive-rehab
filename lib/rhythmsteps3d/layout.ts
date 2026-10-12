/**
 * Arena layout and camera: pure geometry shared by the Display renderer and the Control calibration read-out.
 *
 * The camera is FIXED for the whole session. The near target squares sit at the world origin and never move, rotate or
 * change size during play; only the incoming targets travel. `perspective` (0..100) is the therapist's choice between a
 * nearly top-down view (flat, physically literal) and a dramatic corridor view. Physical distances exist only when the
 * therapist has entered a measured floor size, and are then labelled as estimates.
 */
import * as THREE from 'three';
import { ASPECTS, activeLanes, type Config } from './config';

export const FOV = 50;
export const CAM_DISTANCE = 18;
/** How far the corridor extends (world units). */
export const FAR_Z = 96;

export interface ArenaLayout {
  n: number;
  /** Lane ids in left-to-right order. */
  lanes: number[];
  /** x of each lane centre. */
  xs: number[];
  pitch: number;
  /** Edge of a square target / zone. */
  size: number;
  totalWidth: number;
  aspect: number;
  /** Camera placement. */
  cam: { pos: [number, number, number]; aim: [number, number, number]; fov: number };
  /** Vertical image shift (NDC) that places the near zones at `nearY`. */
  shift: number;
  /** NDC x per world unit at the near line. */
  k: number;
  /** Fraction of the screen width one zone occupies at the near line. */
  zoneScreenFraction: number;
  /** Where the near zones' centres project (NDC y). */
  nearNdcY: number;
  /**
   * Zones and targets are made `depthStretch` times deeper than wide, so that at the near line they APPEAR square in the
   * image (and therefore are square on a floor the image is projected onto) despite the dramatic perspective.
   */
  depthStretch: number;
  /** The near position actually used: raised when needed so the zones are never cut off by the bottom edge. */
  nearYEffective: number;
}

export function pitchAngle(perspective: number): number {
  return THREE.MathUtils.degToRad(THREE.MathUtils.lerp(86, 24, Math.min(100, Math.max(0, perspective)) / 100));
}

export function cameraFor(cfg: Pick<Config, 'perspective'>, aspect: number) {
  const th = pitchAngle(cfg.perspective);
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 400);
  camera.position.set(0, CAM_DISTANCE * Math.sin(th), CAM_DISTANCE * Math.cos(th));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Applies a vertical image shift without moving the world: every depth shifts equally, like a lens shift. */
export function applyShift(camera: THREE.PerspectiveCamera, shift: number): void {
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] -= shift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const ndc = (camera: THREE.Camera, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).project(camera);

export function computeLayout(cfg: Config, viewportAspect: number): ArenaLayout {
  const aspect = cfg.aspect === 'auto' ? viewportAspect : ASPECTS[cfg.aspect];
  const lanes = [...activeLanes(cfg)];
  const n = lanes.length;
  const camera = cameraFor(cfg, aspect);
  const k = ndc(camera, 1, 0, 0).x;
  const fit = (2 * (1 - (2 * cfg.margin) / 100)) / k;
  const pitch4 = (fit * 0.9) / 4;
  const pitchRaw = Math.min((fit * 0.9) / n, pitch4 * 1.7) * (cfg.laneSpacing / 100);
  const pitch = Math.min(pitchRaw, fit / n);
  // a zone is never taller than ~58% of the screen, however few lanes or however large the therapist asks
  const size = Math.min(pitch * 0.96, pitch * 0.8 * (cfg.targetSize / 100), 1.15 / (1.1 * k * aspect));
  const xs = lanes.map((_, i) => (i - (n - 1) / 2) * pitch);
  // depth that makes a zone look square at the near line: equal pixel width and height (solved on the real projection)
  const wantNdcY = k * size * aspect;
  let lo = size, hi = size * 3;
  for (let i = 0; i < 30; i++) {
    const d = (lo + hi) / 2;
    if (ndc(camera, 0, 0, -d / 2).y - ndc(camera, 0, 0, d / 2).y < wantNdcY) lo = d;
    else hi = d;
  }
  const depthStretch = Math.min(3, Math.max(1, (lo + hi) / 2 / size));
  // keep the zones' near edge (with its 10% glass border) inside the bottom safe margin
  const nearEdge = ndc(camera, 0, 0, (size * 1.1 * depthStretch) / 2).y - ndc(camera, 0, 0, 0).y;
  const nearNdcY = Math.max(-1 + (2 * cfg.nearY) / 100, -1 + (2 * cfg.margin) / 100 + 0.01 - nearEdge);
  const shift = nearNdcY - ndc(camera, 0, 0, 0).y;
  const th = pitchAngle(cfg.perspective);
  return {
    n, lanes, xs, pitch, size, totalWidth: n * pitch, aspect,
    cam: { pos: [0, CAM_DISTANCE * Math.sin(th), CAM_DISTANCE * Math.cos(th)], aim: [0, 0, 0], fov: FOV },
    shift, k, zoneScreenFraction: (k * size) / 2, nearNdcY, depthStretch, nearYEffective: ((nearNdcY + 1) / 2) * 100,
  };
}

/** Where the world point (x, 0, z) lands in the 0..1 screen box (origin top-left). */
export function projectFloor(layout: ArenaLayout, cfg: Config, x: number, z: number): { x: number; y: number } {
  const camera = cameraFor(cfg, layout.aspect);
  applyShift(camera, layout.shift);
  const p = new THREE.Vector3(x, 0, z).project(camera);
  return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
}

/**
 * Estimated edge of one zone in centimetres, from the floor width the therapist measured and entered. The estimate
 * assumes the projected image is a flat rectangle of that width at the near line; it is never a measurement.
 */
export function estimateZoneCm(layout: ArenaLayout, cfg: Pick<Config, 'floorWidthCm'>): number | null {
  return cfg.floorWidthCm > 0 ? Math.round(cfg.floorWidthCm * layout.zoneScreenFraction) : null;
}
