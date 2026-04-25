// Minimal audio engine built on WebAudio. Phase 1 has no audio files,
// so we synthesize simple ambient hum and blips procedurally.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.humNode = null;
  }

  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
  }

  // Call after a user gesture (e.g. Start button) — required by browsers.
  async resume() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  startAmbient() { /* ambient hum removed */ }
  stopAmbient()  { /* no-op */ }

  blip(freq = 440, dur = 0.08, gain = 0.1, type = 'square') {
    this._ensureCtx();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  footstep(volume = 0.3) {
    this._ensureCtx();
    // noise burst
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.value = volume * 0.4;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  click() { this.blip(800, 0.03, 0.06, 'square'); }
  pickup() { this.blip(660, 0.12, 0.1, 'triangle'); }
  drink() { this.blip(300, 0.25, 0.08, 'sine'); }
  deny() { this.blip(200, 0.1, 0.08, 'sawtooth'); }
}
