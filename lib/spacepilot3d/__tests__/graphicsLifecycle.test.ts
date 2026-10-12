import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createFlightGraphics } from '../graphics';
import { emptyScene } from '../presentation';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), targetDispose: vi.fn() }));
vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, PMREMGenerator: class {
    fromScene() { return { texture: new original.Texture(), dispose: mocks.targetDispose }; }
    dispose() {}
  } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { parseAsync = mocks.parse; } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.parse.mockReset(); mocks.targetDispose.mockClear(); });
const renderer = () => ({ capabilities: { getMaxAnisotropy: () => 4 }, compileAsync: vi.fn().mockResolvedValue(undefined) }) as unknown as THREE.WebGLRenderer;
function model() {
  const map = new THREE.Texture(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ map });
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material));
  return { scene, geometry, material, map };
}
it('releases model and scene resources once and warms shaders before readiness', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  const source = model(); mocks.parse.mockResolvedValue(source);
  const g = vi.spyOn(source.geometry, 'dispose'), m = vi.spyOn(source.material, 'dispose'), t = vi.spyOn(source.map, 'dispose');
  const gl = renderer(), graphics = createFlightGraphics(gl);
  const instances = vi.spyOn(graphics.scene.getObjectByName('distant-asteroid-formations') as THREE.InstancedMesh, 'dispose');
  expect(graphics.loaded).toBe(false);
  await graphics.ready;
  expect(graphics.loaded).toBe(true);
  expect(gl.compileAsync).toHaveBeenCalledOnce();
  graphics.setQuality('low'); graphics.setQuality('high');
  graphics.dispose(); graphics.dispose();
  expect(g).toHaveBeenCalledOnce(); expect(m).toHaveBeenCalledOnce(); expect(t).toHaveBeenCalledOnce(); expect(mocks.targetDispose).toHaveBeenCalledOnce();
  expect(graphics.scene.children).toHaveLength(0); expect(instances).toHaveBeenCalledOnce();
});
it('aborts fetching and disposes a late model without warming a disposed renderer', async () => {
  let resolveFetch!: (response: unknown) => void;
  const fetchMock = vi.fn((...args: [string, RequestInit]) => { expect(args[0]).toContain("aurora.glb"); return new Promise(resolve => { resolveFetch = resolve; }); });
  vi.stubGlobal('fetch', fetchMock);
  const source = model(); mocks.parse.mockResolvedValue(source);
  const dispose = vi.spyOn(source.geometry, 'dispose');
  const gl = renderer(), graphics = createFlightGraphics(gl);
  graphics.dispose();
  expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await graphics.ready;
  expect(graphics.loaded).toBe(false); expect(dispose).toHaveBeenCalledOnce(); expect(gl.compileAsync).not.toHaveBeenCalled();
});
it('rejects an unavailable model so Display cannot report readiness', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  const graphics = createFlightGraphics(renderer());
  await expect(graphics.ready).rejects.toThrow('404');
  expect(graphics.loaded).toBe(false); graphics.dispose();
});

it('reduced effects preserve accepted poses and static hazard cues without rotating encounters', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  mocks.parse.mockResolvedValue(model());
  const graphics = createFlightGraphics(renderer()); await graphics.ready;
  const state = emptyScene(); state.status = 'running';
  state.objects[0] = { ...state.objects[0], kind: 'fiery', presented: true, z: -8 };
  state.objects[1] = { ...state.objects[1], kind: 'ring', presented: true, z: -12 };
  graphics.update(state, .016);
  const normalSprites = graphics.scene.children.filter(o => o instanceof THREE.Sprite && o.visible).length;
  graphics.setReducedEffects(true); graphics.update(state, .016);
  const rock = graphics.scene.getObjectByName('encounter-0') as THREE.Mesh;
  const star = graphics.scene.getObjectByName('encounter-1') as THREE.Mesh;
  const rotation = rock.rotation.clone();
  const snapshot = JSON.stringify(state); graphics.update(state, .016); expect(JSON.stringify(state)).toBe(snapshot);
  state.elapsedSeconds = 10; graphics.update(state, .016);
  expect(rock.rotation.equals(rotation)).toBe(true); expect(rock.visible).toBe(true); expect(star.visible).toBe(true);
  expect(rock.position.z).toBe(-8);
  expect(graphics.scene.children.filter(o => o instanceof THREE.Sprite && o.visible).length).toBeLessThan(normalSprites);
  graphics.setReducedEffects(false); graphics.update(state, .016); expect(rock.rotation.equals(rotation)).toBe(false);
  graphics.dispose();
});
it('keeps the ship center in view throughout the unchanged movement range without changing accepted input', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  mocks.parse.mockResolvedValue(model());
  const graphics = createFlightGraphics(renderer()); await graphics.ready;
  graphics.camera.aspect = 16 / 9; graphics.camera.updateProjectionMatrix();
  const state = emptyScene();
  for (const x of [-4.8, 0, 4.8]) for (const y of [-2.8, 0, 2.8]) {
    state.ship = { x, y, bank: 0 }; graphics.update(state, .016); graphics.camera.updateMatrixWorld();
    const projected = new THREE.Vector3(x, y, 0).project(graphics.camera);
    expect(Math.abs(projected.x)).toBeLessThan(.8); expect(Math.abs(projected.y)).toBeLessThan(.85);
    expect(graphics.scene.getObjectByName('spacecraft')!.position.toArray()).toEqual([x, y, 0]);
  }
  graphics.dispose();
});
