import { ContactActivationGate } from "@/lib/physicalInput/ContactActivationGate";
import { circleContains, pointerToIso } from "../geometry";
import { selectableBodies, type SelectRequest } from "../session";
import type { Session, SourceId } from "../types";
import type { InputHub } from "./hub";

/**
 * Turns fresh pointers into balloon-selection requests.
 *
 * Contact is edge-triggered per source: entering a balloon selects once,
 * staying inside does nothing, leaving re-arms (the same ContactActivationGate
 * every other sensor game uses, fed isotropic stage coordinates). Several
 * pointers may be active at once; each has its own gate, and the engine
 * refuses a second selection of the same balloon.
 */
export class SelectionPipeline {
  private gates = new Map<SourceId, ContactActivationGate>();
  private primeNext = new Set<SourceId>();
  private wasPlaying = false;

  /** After a recenter the pointer jumps; prime instead of firing a phantom contact. */
  notePendingRecenter(sourceId: SourceId): void {
    this.primeNext.add(sourceId);
  }
  reset(): void {
    this.gates.clear();
    this.primeNext.clear();
    this.wasPlaying = false;
  }

  private gate(id: SourceId): ContactActivationGate {
    let g = this.gates.get(id);
    if (!g) this.gates.set(id, (g = new ContactActivationGate()));
    return g;
  }

  process(session: Session, hub: InputHub, nowMs: number): SelectRequest[] {
    const playing = session.lifecycle === "playing";
    const bodies = selectableBodies(session);
    const targets = bodies.map((b) => ({ id: b.id, x: b.cx, y: b.cy, radius: b.r }));
    const pointers = hub.fresh(nowMs);
    const presses = hub.takePresses();
    if (!playing) {
      this.wasPlaying = false;
      this.gates.clear();
      return [];
    }
    const out: SelectRequest[] = [];
    const seen = new Set<SourceId>();
    for (const p of pointers) {
      seen.add(p.sourceId);
      const iso = pointerToIso(p.x, p.y);
      const gate = this.gate(p.sourceId);
      // Resuming (or the first frame of play) never turns a pointer that is ALREADY on a balloon into a selection.
      if (!this.wasPlaying || this.primeNext.delete(p.sourceId)) {
        gate.primeAt(iso, targets);
        continue;
      }
      const hit = gate.observe(iso, targets, nowMs);
      if (hit) out.push({ balloonId: hit.targetId, source: p.sourceId, inputEventId: `${p.sourceId}:${p.seq}:${hit.targetId}` });
    }
    for (const id of [...this.gates.keys()]) if (!seen.has(id)) this.gates.get(id)!.reset(); // pointer lost -> fully re-armed on return
    for (const press of presses) {
      const p = pointers.find((x) => x.sourceId === press.sourceId);
      if (!p) continue;
      const iso = pointerToIso(p.x, p.y);
      const inside = bodies.filter((b) => circleContains(b, iso.x, iso.y)).sort((a, b) => Math.hypot(iso.x - a.cx, iso.y - a.cy) - Math.hypot(iso.x - b.cx, iso.y - b.cy));
      if (inside[0]) out.push({ balloonId: inside[0].id, source: press.sourceId, inputEventId: press.id });
    }
    this.wasPlaying = true;
    return out;
  }
}
