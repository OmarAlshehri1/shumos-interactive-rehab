/** Same-computer transport only. No ICE servers, media backend, recording or Firebase media payloads. */
export function localPeer(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [], bundlePolicy: "max-bundle" });
}
export async function localDescription(peer: RTCPeerConnection, type: "offer" | "answer"): Promise<string> {
  await peer.setLocalDescription(type === "offer" ? await peer.createOffer() : await peer.createAnswer());
  if (peer.iceGatheringState !== "complete") await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed);
      peer.removeEventListener("connectionstatechange", closed);
      if (error) reject(error); else resolve();
    };
    const changed = () => { if (peer.iceGatheringState === "complete") finish(); };
    const closed = () => { if (peer.connectionState === "closed") finish(Error("peer-closed")); };
    const timer = setTimeout(() => finish(Error("local-connection-timeout")), 5000);
    peer.addEventListener("icegatheringstatechange", changed);
    peer.addEventListener("connectionstatechange", closed);
    changed();
  });
  const sdp = peer.localDescription?.sdp;
  if (!sdp || sdp.length > 20_000 || peer.signalingState === "closed") throw Error("invalid-local-description");
  return sdp;
}
export function stopTracks(stream: MediaStream | null): void { stream?.getTracks().forEach(track => track.stop()); }
