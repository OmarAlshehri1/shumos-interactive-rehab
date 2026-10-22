import { get, onValue, ref, set, type Database } from "firebase/database";
import { displayServerNow } from "@/lib/realtime/displayAuthorization";
import { localDescription, localPeer, stopTracks } from "./tabSharePeer";
import { removeShare, subscribeShare } from "./tabShareSignaling";
import { parseShare, parseShareMessage, receiverInstance, TAB_SHARE_CHANNEL, TAB_SHARE_PATH, type TabShare } from "./tabShareModel";

export interface ReceivedSharing { stream: MediaStream | null; hidden: boolean; sessionId: string | null }
export const EMPTY_RECEIVED: ReceivedSharing = { stream: null, hidden: false, sessionId: null };

/** Receives only a locally addressed offer through the existing anonymous Display authorization. */
export class LocalTabShareDisplay {
  private channel = new BroadcastChannel(TAB_SHARE_CHANNEL);
  private instance = receiverInstance();
  private epoch = crypto.randomUUID();
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private id: string | null = null;
  private owner: string | null = null;
  private hidden = false;
  private disposed = false;
  private signalStop = () => {};
  private stops: (() => void)[] = [];
  private expiry?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor(private db: Database, private uid: string, private emit: (value: ReceivedSharing) => void) {
    this.channel.onmessage = event => {
      const message = parseShareMessage(event.data);
      if (message?.kind === "discover") void this.announce();
      if (message?.kind === "connect" && message.instance === this.instance && message.sessionId !== this.id) void this.receive(message.sessionId);
      if (message?.kind === "stop" && message.instance === this.instance && message.sessionId === this.id) this.clear();
    };
    this.stops.push(
      onValue(ref(db, ".info/connected"), s => { if (s.val() === true) void this.announce(); else this.clear(); }),
      onValue(ref(db, "liveSession"), s => { if (s.exists()) this.clear(); }, () => this.clear()),
    );
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("focus", this.onFocus);
    void this.announce();
  }
  private onPageHide = () => this.dispose();
  private onFocus = () => { void this.announce(); };
  private async announce() {
    try {
      const grant = (await get(ref(this.db, `presence/displayAccess/${this.uid}`))).val();
      if (this.disposed) return;
      if (!grant || typeof grant.approvedBy !== "string" || grant.expiresAt <= displayServerNow()) { this.clear(); return; }
      if (this.owner && this.owner !== grant.approvedBy) this.clear();
      this.owner = grant.approvedBy;
      this.channel.postMessage({ kind: "receiver", instance: this.instance, epoch: this.epoch, uid: this.uid, owner: this.owner });
    } catch { if (!this.disposed) this.clear(); }
  }
  private async receive(id: string) {
    // Discovery messages are untrusted routing hints. A replay must never tear
    // down a newer valid connection before Firebase verifies its addressed offer.
    const generation = this.generation;
    let offer: TabShare | null;
    try { offer = parseShare((await get(ref(this.db, TAB_SHARE_PATH))).val()); }
    catch { return; }
    if (this.disposed || generation !== this.generation || !offer || offer.sessionId !== id ||
      offer.displayUid !== this.uid || offer.displayInstance !== this.instance || offer.ownerId !== this.owner ||
      offer.expiresAt <= displayServerNow()) return;
    this.clear(); this.id = id;
    let negotiating = false;
    this.signalStop = subscribeShare(this.db, share => {
      if (!share || share.sessionId !== id || share.displayUid !== this.uid || share.displayInstance !== this.instance ||
        share.ownerId !== this.owner || share.expiresAt <= displayServerNow()) { this.clear(); return; }
      clearTimeout(this.expiry);
      this.expiry = setTimeout(() => this.clear(), share.expiresAt - displayServerNow());
      this.hidden = share.hidden; this.report();
      if (!negotiating && !this.peer) { negotiating = true; void this.answer(share); }
    }, () => this.clear());
  }
  private async answer(share: TabShare) {
    const generation = this.generation, peer = localPeer(); this.peer = peer;
    const stream = new MediaStream(); this.stream = stream;
    peer.ontrack = event => {
      if (this.peer !== peer) return;
      stream.addTrack(event.track); this.report();
    };
    peer.onconnectionstatechange = () => {
      if (this.peer === peer && ["failed", "closed", "disconnected"].includes(peer.connectionState)) this.clear();
    };
    try {
      await peer.setRemoteDescription({ type: "offer", sdp: share.offer });
      const answer = await localDescription(peer, "answer");
      if (this.disposed || generation !== this.generation || this.peer !== peer) return;
      await set(ref(this.db, `${TAB_SHARE_PATH}/answer`), { sessionId: share.sessionId, sdp: answer });
    } catch { if (generation === this.generation) this.clear(); }
  }
  private report() { if (!this.disposed) this.emit({ stream: this.stream, hidden: this.hidden, sessionId: this.id }); }
  async playback(state: "playing" | "blocked" | "hidden", sessionId: string): Promise<void> {
    if (this.id !== sessionId || this.disposed) return;
    await set(ref(this.db, `${TAB_SHARE_PATH}/playback`), { sessionId, state }).catch(() => { if (this.id === sessionId) this.clear(); });
  }
  private clear() {
    ++this.generation; clearTimeout(this.expiry);
    this.signalStop(); this.signalStop = () => {};
    const peer = this.peer; this.peer = null; peer?.close();
    stopTracks(this.stream); this.stream = null;
    const id = this.id; this.id = null; this.hidden = false;
    if (id) void removeShare(this.db, id).catch(() => {});
    this.report();
  }
  dispose() {
    if (this.disposed) return;
    this.channel.postMessage({ kind: "gone", instance: this.instance, epoch: this.epoch });
    this.clear(); this.disposed = true;
    this.stops.splice(0).forEach(stop => stop()); this.channel.close();
    window.removeEventListener("pagehide", this.onPageHide); window.removeEventListener("focus", this.onFocus);
  }
}
