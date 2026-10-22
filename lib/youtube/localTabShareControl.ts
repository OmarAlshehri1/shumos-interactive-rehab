import { get, onValue, ref, serverTimestamp, set, type Database } from "firebase/database";
import { controlTabId } from "@/lib/liveGame/ownership";
import { refreshControllerLease } from "@/lib/realtime/sessionRepository";
import { prepareVideoDisplay, stopOwnedVideo, subscribeCommand } from "./repository";
import { localDescription, localPeer, stopTracks } from "./tabSharePeer";
import { removeShare, renewShare, serverOffset, shareExpiry, subscribeShare } from "./tabShareSignaling";
import { nativeTabCaptureSupported, parseShare, parseShareMessage, RECONNECT_MS, SHARE_REFRESH_MS, TAB_CAPTURE_OPTIONS, TAB_SHARE_CHANNEL, TAB_SHARE_PATH, type Receiver } from "./tabShareModel";
import { captureFailureMessage, shareDiagnostic, type ShareStep } from "./tabShareDiagnostics";

export interface SharingState {
  phase: "idle" | "selecting" | "connecting" | "sharing" | "hidden" | "reconnecting" | "blocked" | "error";
  audio: boolean;
  error: string;
}
export const IDLE_SHARING: SharingState = { phase: "idle", audio: false, error: "" };

export class LocalTabShareControl {
  private channel = new BroadcastChannel(TAB_SHARE_CHANNEL);
  private receivers = new Map<string, Receiver>();
  private stream: MediaStream | null = null;
  private peer: RTCPeerConnection | null = null;
  private target: Receiver | null = null;
  private sessionId: string | null = null;
  private stops: (() => void)[] = [];
  private shareStops: (() => void)[] = [];
  private renewTimer?: ReturnType<typeof setInterval>;
  private expiry?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private hidden = false;
  private remotePlayback: "playing" | "blocked" | "hidden" | undefined;
  private disposed = false;
  private connecting = false;
  private selecting = false;
  private generation = 0;
  private offset = 0;
  private online = false;
  private staffActive = true;
  private lease: { ownerId?: string; updatedAt?: number } | null | undefined;
  private tab = controlTabId();

  constructor(private db: Database, private uid: string, private allowed: () => boolean, private emit: (s: SharingState) => void) {
    this.channel.onmessage = event => {
      const message = parseShareMessage(event.data);
      if (message?.kind === "receiver" && message.owner === this.uid) {
        this.receivers.set(message.instance, message);
        if (this.stream && this.target?.instance === message.instance && this.target.uid === message.uid &&
          (this.target.epoch !== message.epoch || !this.peer)) void this.connect(message);
      }
      if (message?.kind === "gone") {
        const receiver = this.receivers.get(message.instance);
        if (receiver?.epoch === message.epoch) this.receivers.delete(message.instance);
        if (this.stream && this.target?.instance === message.instance && this.target.epoch === message.epoch) this.reconnect();
      }
    };
    this.channel.postMessage({ kind: "discover" });
    this.stops.push(
      onValue(ref(db, ".info/connected"), s => { this.online = s.val() === true; if (!this.online && this.stream) this.stop("انقطع الاتصال. أعد الربط عند عودته."); }),
      onValue(ref(db, `staff/${uid}/active`), s => { this.staffActive = s.val() === true; if (!this.staffActive) this.stop("انتهت صلاحية حساب التحكم."); }, () => { this.staffActive = false; this.stop("انتهت صلاحية حساب التحكم."); }),
      onValue(ref(db, "controllerLease"), s => { this.lease = s.val(); if (this.stream && this.lease?.ownerId !== uid) this.stop("انتقل التحكم إلى أخصائي آخر."); }),
      // Switching games is fail-closed even if a different browser window publishes it.
      onValue(ref(db, "liveSession"), s => { if (this.stream && s.exists()) this.stop("توقفت المشاركة لحماية النشاط الحالي."); }),
      subscribeCommand(db, c => { if (this.stream && c && c.state !== "stopped") this.stop("توقفت المشاركة لوجود عرض آخر."); }),
    );
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("focus", this.discover);
  }
  private onPageHide = () => this.stop();
  private discover = () => { if (!this.disposed) { if (!this.stream) this.receivers.clear(); this.channel.postMessage({ kind: "discover" }); } };
  private state(phase: SharingState["phase"], error = "") {
    if (!this.disposed) this.emit({ phase, audio: !!this.stream?.getAudioTracks().some(t => t.readyState === "live"), error });
  }

  /** Called directly from a click. The native picker must run BEFORE any await. */
  async start(): Promise<void> {
    if (this.disposed || this.stream || this.selecting) return;
    if (!nativeTabCaptureSupported()) { shareDiagnostic("capability", "rejected"); this.state("error", "مشاركة التبويب متاحة في Chrome على الكمبيوتر عبر اتصال آمن."); return; }
    if (!this.online || !this.staffActive || this.lease === undefined) { shareDiagnostic("control-readiness", "rejected"); this.state("error", "تحقق من اتصال التحكم وصلاحية الحساب ثم أعد المحاولة."); return; }
    shareDiagnostic("control-readiness", "passed");
    if (this.lease && this.lease.ownerId !== this.uid && !(typeof this.lease.updatedAt === "number" && this.now() - this.lease.updatedAt > 45000)) {
      shareDiagnostic("ownership", "rejected");
      this.state("error", "التحكم لدى أخصائي آخر. لم تبدأ المشاركة."); return;
    }
    shareDiagnostic("ownership", "passed");
    if (!this.allowed()) { shareDiagnostic("game-guard", "rejected"); this.state("error", "أنهِ النشاط واحفظه قبل مشاركة يوتيوب."); return; }
    const receivers = [...this.receivers.values()];
    if (receivers.length !== 1) {
      shareDiagnostic("display-readiness", "rejected");
      this.discover();
      this.state("error", receivers.length ? "أبقِ شاشة عرض شُموس واحدة مفتوحة ثم أعد الربط." : "افتح شاشة عرض شُموس في Chrome نفسه ثم أعد الربط."); return;
    }
    shareDiagnostic("display-readiness", "passed");
    this.selecting = true; const attempt = ++this.generation;
    this.state("selecting");
    let selected: MediaStream | null = null;
    let step: ShareStep = "capture";
    try {
      shareDiagnostic(step, "start");
      selected = await navigator.mediaDevices.getDisplayMedia(TAB_CAPTURE_OPTIONS);
      shareDiagnostic(step, "passed");
      if (this.disposed || attempt !== this.generation) { stopTracks(selected); return; }
      step = "capture-surface";
      if (selected.getVideoTracks()[0]?.getSettings().displaySurface !== "browser") throw Error("choose-browser-tab");
      step = "game-guard";
      if (!this.allowed()) throw Error("active-game");
      step = "existing-share";
      if (this.lease?.ownerId === this.uid) {
        const previous = parseShare((await get(ref(this.db, TAB_SHARE_PATH))).val());
        if (previous && previous.controlTabId !== this.tab && previous.expiresAt > this.now()) throw Error("other-controller");
      }
      // An obsolete command from this therapist must not revive the old iframe path.
      step = "legacy-command";
      const old = (await get(ref(this.db, "presence/display/youtubeCommand"))).val();
      if (old) {
        if (old.ownerId !== this.uid || (old.controlTabId !== this.tab && Date.now() - old.heartbeatAt < 15000)) throw Error("other-controller");
      }
      step = "prepare-display";
      await prepareVideoDisplay(this.db, this.uid, this.tab, { leaseCleanup: "heartbeat" });
      if (old) await stopOwnedVideo(this.db, old.controlTabId);
      if (this.disposed || attempt !== this.generation) { stopTracks(selected); return; }
      step = "server-clock";
      this.offset = await serverOffset(this.db);
      this.stream = selected; selected = null; this.hidden = false;
      this.stream.getTracks().forEach(track => track.addEventListener("ended", () => this.stop()));
      const receiver = receivers[0];
      this.shareStops.push(onValue(ref(this.db, `presence/displayAccess/${receiver.uid}`), s => {
        clearTimeout(this.expiry);
        const grant = s.val();
        if (!grant || grant.approvedBy !== this.uid || grant.expiresAt <= this.now()) this.stop("انتهى تصريح شاشة العرض.");
        else this.expiry = setTimeout(() => this.stop("انتهى تصريح شاشة العرض."), grant.expiresAt - this.now());
      }, () => this.stop("تعذّر التحقق من تصريح شاشة العرض.")));
      await this.connect(receiver);
      if (this.stream) this.renewTimer = setInterval(() => {
        const id = this.sessionId;
        if (!id || this.connecting || !this.peer) return;
        void Promise.all([refreshControllerLease(this.db), renewShare(this.db, id, shareExpiry(this.now()))])
          .catch(() => this.stop("تعذّر تجديد المشاركة. أعد الربط."));
      }, SHARE_REFRESH_MS);
    } catch (error) {
      shareDiagnostic(step, "rejected", error);
      stopTracks(selected);
      if (this.disposed || attempt !== this.generation) return;
      const name = (error as { name?: string }).name, message = (error as { message?: string }).message;
      if (name === "NotAllowedError" || name === "AbortError") this.stop();
      else if (step === "capture") this.stop(captureFailureMessage(error));
      else this.stop(message === "choose-browser-tab" ? "اختر تبويب يوتيوب من تبويبات Chrome." :
        message === "active-game" ? "تغيّر النشاط. أنهِه واحفظه قبل المشاركة." :
        message === "other-controller" ? "هناك عرض تحت تحكم نافذة أخرى." : "تعذّر ربط العرض. تحقق من اتصال الشاشة ثم أعد المحاولة.");
    } finally { this.selecting = false; }
  }
  private now() { return Date.now() + this.offset; }
  private async connect(receiver: Receiver): Promise<void> {
    if (!this.stream || this.disposed || this.connecting) return;
    this.connecting = true;
    const generation = this.generation, stream = this.stream;
    const oldId = this.sessionId;
    this.clearPeer(); this.target = receiver;
    const id = crypto.randomUUID(); this.sessionId = id;
    this.remotePlayback = undefined;
    this.state("connecting");
    const peer = localPeer(); this.peer = peer;
    let step: ShareStep = "offer";
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer || !this.stream) return;
      if (peer.connectionState === "connected") {
        clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
        this.state(this.hidden ? "hidden" : this.remotePlayback === "playing" ? "sharing" : this.remotePlayback === "blocked" ? "blocked" : "connecting");
      } else if (["disconnected", "failed", "closed"].includes(peer.connectionState)) this.reconnect();
    };
    try {
      if (oldId) await removeShare(this.db, oldId);
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
      const offer = await localDescription(peer, "offer");
      step = "display-approval";
      const grant = (await get(ref(this.db, `presence/displayAccess/${receiver.uid}`))).val();
      if (!grant || grant.approvedBy !== this.uid || grant.expiresAt <= this.now()) throw Error("display-not-approved");
      if (this.disposed || generation !== this.generation || this.peer !== peer) return;
      step = "publish-offer";
      await set(ref(this.db, TAB_SHARE_PATH), {
        sessionId: id, ownerId: this.uid, controlTabId: this.tab,
        displayUid: receiver.uid, displayInstance: receiver.instance,
        createdAt: serverTimestamp(), expiresAt: shareExpiry(this.now()), hidden: this.hidden, offer,
      });
      shareDiagnostic(step, "passed");
      if (this.disposed || generation !== this.generation || this.peer !== peer) { void removeShare(this.db, id).catch(() => {}); return; }
      let answering = false;
      this.signalStop = subscribeShare(this.db, share => {
        if (this.peer !== peer) return;
        if (!share) { this.reconnect(); return; }
        if (share.sessionId !== id) { this.stop("تغيّر صاحب المشاركة."); return; }
        if (share.answer && !answering && !peer.remoteDescription) {
          answering = true;
          void peer.setRemoteDescription({ type: "answer", sdp: share.answer.sdp }).catch(error => { shareDiagnostic("answer", "rejected", error); this.stop("تعذّر اتصال الشاشة."); });
        }
        this.remotePlayback = share.playback?.state;
        if (this.hidden) this.state("hidden");
        else if (this.remotePlayback === "blocked") this.state("blocked");
        else if (peer.connectionState === "connected" && this.remotePlayback === "playing") this.state("sharing");
      }, () => this.stop("انتهى تصريح المشاركة."));
      this.channel.postMessage({ kind: "connect", instance: receiver.instance, sessionId: id });
      this.armReconnectTimeout();
    } catch (error) {
      shareDiagnostic(step, "rejected", error);
      if (generation === this.generation && !this.disposed) this.stop("تعذّر ربط شاشة العرض. تحقق من اتصالها ثم أعد المحاولة.");
    } finally { this.connecting = false; }
  }
  private signalStop = () => {};
  private clearPeer() { this.signalStop(); this.signalStop = () => {}; const peer = this.peer; this.peer = null; peer?.close(); }
  private armReconnectTimeout() {
    if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => this.stop("انقطع العرض. أعد الربط للمتابعة."), RECONNECT_MS);
  }
  private reconnect() {
    if (!this.stream || this.disposed) return;
    this.clearPeer(); this.state("reconnecting"); this.armReconnectTimeout(); this.discover();
  }
  async toggleHidden(): Promise<void> {
    if (!this.stream || !this.sessionId) return;
    this.hidden = !this.hidden;
    try { await renewShare(this.db, this.sessionId, shareExpiry(this.now()), this.hidden); this.state(this.hidden ? "hidden" : this.remotePlayback === "playing" ? "sharing" : this.remotePlayback === "blocked" ? "blocked" : "connecting"); }
    catch { this.stop("تعذّر تحديث العرض؛ أُوقفت المشاركة بأمان."); }
  }
  stop(error = ""): void {
    ++this.generation;
    clearInterval(this.renewTimer); clearTimeout(this.expiry); clearTimeout(this.reconnectTimer);
    this.renewTimer = this.expiry = this.reconnectTimer = undefined;
    this.clearPeer(); this.shareStops.splice(0).forEach(stop => stop());
    const stream = this.stream; this.stream = null; stopTracks(stream);
    const id = this.sessionId;
    if (id && this.target) this.channel.postMessage({ kind: "stop", instance: this.target.instance, sessionId: id });
    this.sessionId = null; this.target = null;
    if (id) void removeShare(this.db, id).catch(() => {});
    this.hidden = false; this.state(error ? "error" : "idle", error);
  }
  dispose(): void {
    this.stop(); this.disposed = true; this.stops.splice(0).forEach(stop => stop());
    window.removeEventListener("pagehide", this.onPageHide); window.removeEventListener("focus", this.discover);
    this.channel.close();
  }
}
