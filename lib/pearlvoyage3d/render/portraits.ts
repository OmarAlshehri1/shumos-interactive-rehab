import * as T from 'three';
import type { SpeciesId } from '../stages';
import { buildFish } from './fish';

const cache = new Map<SpeciesId, string>();
/** renders each species once in a small offscreen WebGL canvas and returns transparent PNG data URLs for the collection journal */
export function fishPortraits(ids: SpeciesId[]): Record<string, string> {
    const need = ids.filter(id => !cache.has(id));
    if (need.length && typeof document !== 'undefined') {
        let renderer: T.WebGLRenderer | null = null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 360; canvas.height = 260;
            renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
            renderer.setClearColor(0x000000, 0);
            renderer.outputColorSpace = T.SRGBColorSpace;
            renderer.toneMapping = T.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.05;
            const scene = new T.Scene();
            scene.add(new T.HemisphereLight('#ffffff', '#7fd6e6', 1.7));
            const sun = new T.DirectionalLight('#fff4dc', 2.6);
            sun.position.set(2, 3, 2.4);
            scene.add(sun);
            const rim = new T.DirectionalLight('#8fe8ff', 1.1);
            rim.position.set(-2, 1, -2);
            scene.add(rim);
            const camera = new T.PerspectiveCamera(30, 360 / 260, 0.1, 100);
            for (const id of need) {
                const model = buildFish(id);
                model.tick(0.9, 0.4);
                model.group.rotation.y = id === 'seahorse' ? -0.55 : id === 'turtle' || id === 'ray' ? 2.6 : 2.35;
                scene.add(model.group);
                const box = new T.Box3().setFromObject(model.group), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
                const span = Math.max(size.x, size.z * 0.9, size.y * 1.35);
                const top = id === 'ray' || id === 'turtle';
                camera.position.copy(center).add(top ? new T.Vector3(0.25, span * 1.35, span * 0.95) : id === 'dolphin' ? new T.Vector3(0.2, span * 0.7, span * 1.5) : new T.Vector3(0.1, span * 0.18, span * 1.75));
                camera.lookAt(center);
                renderer.render(scene, camera);
                cache.set(id, canvas.toDataURL('image/png'));
                scene.remove(model.group);
                model.dispose();
            }
        }
        catch { /* portraits are decorative: the journal falls back to colour badges */ }
        finally { renderer?.dispose(); renderer?.forceContextLoss(); }
    }
    const out: Record<string, string> = {};
    ids.forEach(id => { const v = cache.get(id); if (v) out[id] = v; });
    return out;
}
