// WebRTC voice chat with spatial (3D) audio via Trystero peer streams.
// Push-to-talk: hold T. Mic stays muted until PTT is active.

export class VoiceChat {
  constructor() {
    this._room    = null;
    this._remotes = null;
    this._stream  = null;    // local mic MediaStream
    this._audioCtx = null;
    this._peers   = new Map(); // peerId -> { source, panner, gain }
    this.enabled  = false;
    this.talking  = false;
  }

  async init(room, remotes) {
    this._room    = room;
    this._remotes = remotes;

    try {
      const micPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), 8000));
      this._stream = await Promise.race([micPromise, timeout]);
      // Start muted — push-to-talk model
      for (const t of this._stream.getAudioTracks()) t.enabled = false;

      room.addStream(this._stream);
      room.onPeerStream((stream, peerId) => this._addPeer(peerId, stream));

      this.enabled = true;
    } catch (err) {
      console.warn('[VoiceChat] getUserMedia failed:', err.message);
    }
  }

  setPTT(active) {
    if (!this._stream) return;
    for (const t of this._stream.getAudioTracks()) t.enabled = active;
    this.talking = active;
  }

  _ctx() {
    if (!this._audioCtx) this._audioCtx = new AudioContext();
    return this._audioCtx;
  }

  _addPeer(peerId, stream) {
    this._removePeer(peerId);
    const ctx    = this._ctx();
    const source = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel  = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance   = 1;
    panner.maxDistance   = 24;
    panner.rolloffFactor = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    source.connect(panner);
    panner.connect(gain);
    gain.connect(ctx.destination);
    this._peers.set(peerId, { source, panner, gain });
  }

  _removePeer(peerId) {
    const p = this._peers.get(peerId);
    if (!p) return;
    try { p.source.disconnect(); p.panner.disconnect(); p.gain.disconnect(); } catch (_) {}
    this._peers.delete(peerId);
  }

  removePeer(peerId) { this._removePeer(peerId); }

  // Call each frame. listenerPos and listenerFwd are THREE.Vector3.
  update(listenerPos, listenerFwd) {
    const ctx = this._audioCtx;
    if (!ctx) return;

    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = listenerPos.x;
      L.positionY.value = listenerPos.y;
      L.positionZ.value = listenerPos.z;
      L.forwardX.value  = listenerFwd.x;
      L.forwardY.value  = listenerFwd.y;
      L.forwardZ.value  = listenerFwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }

    for (const [peerId, p] of this._peers) {
      const rp = this._remotes?.get(peerId);
      if (!rp) continue;
      const pos = rp.root.position;
      p.panner.positionX.value = pos.x;
      p.panner.positionY.value = pos.y;
      p.panner.positionZ.value = pos.z;
    }
  }

  dispose() {
    this.setPTT(false);
    for (const id of [...this._peers.keys()]) this._removePeer(id);
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream   = null;
    this._audioCtx?.close();
    this._audioCtx = null;
    this._room     = null;
    this.enabled   = false;
    this.talking   = false;
  }
}
