// VHS / old-camera interference layer drawn on a 2D canvas overlay each frame.
// Appended directly to #game-root (sits below all HUD elements).
// Triggers a CSS class on #game-canvas for brief signal-dropout glitches.

export class CameraOverlay {
  constructor() {
    this._canvas = document.createElement('canvas');
    const s = this._canvas.style;
    s.position      = 'absolute';
    s.inset         = '0';
    s.width         = '100%';
    s.height        = '100%';
    s.pointerEvents = 'none';
    s.zIndex        = '46';
    document.getElementById('game-root').appendChild(this._canvas);

    this._ctx        = this._canvas.getContext('2d');
    this._gameCanvas = document.getElementById('game-canvas');
    this._time       = 0;

    // Glitch state
    this._glitchCooldown = 4 + Math.random() * 6;
    this._glitchLife     = 0;
    this._glitchBands    = [];

    // Noise roll state
    this._rollLine   = -1;   // Y of active VHS tracking roll; -1 = inactive
    this._rollLife   = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  // Call every frame from the main loop
  update(dt) {
    this._time          += dt;
    this._glitchCooldown -= dt;
    this._glitchLife    -= dt;
    this._rollLife      -= dt;

    const ctx = this._ctx;
    const W   = this._canvas.width;
    const H   = this._canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── 1. Random thin scan flicker (1-2 lines per frame) ─────────────────
    const n = Math.random() < 0.55 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const y = Math.random() * H;
      const h = 1 + Math.random() * 2.5;
      const a = (0.025 + Math.random() * 0.05).toFixed(3);
      ctx.fillStyle = `rgba(210,220,255,${a})`;
      ctx.fillRect(0, y, W, h);
    }

    // ── 2. Glitch event ────────────────────────────────────────────────────
    if (this._glitchCooldown <= 0) {
      this._glitchCooldown = 3.5 + Math.random() * 9;
      this._glitchLife     = 0.06 + Math.random() * 0.14;

      const count = 3 + Math.floor(Math.random() * 4);
      this._glitchBands = Array.from({ length: count }, () => {
        const warm = Math.random() > 0.45;
        return {
          y: Math.random() * H,
          h: 4 + Math.random() * 28,
          r: warm ? 200 + (Math.random() * 55 | 0) : 80  + (Math.random() * 60 | 0),
          g: warm ? 160 + (Math.random() * 60 | 0) : 150 + (Math.random() * 60 | 0),
          b: warm ? 80  + (Math.random() * 60 | 0) : 220 + (Math.random() * 35 | 0),
          a: 0.05 + Math.random() * 0.09,
        };
      });

      // CSS signal-dropout on the WebGL canvas (brief desaturate + shift)
      this._gameCanvas.classList.add('vhs-glitch');
      setTimeout(() => this._gameCanvas.classList.remove('vhs-glitch'),
        (this._glitchLife * 1000) | 0);

      // Trigger a VHS tracking roll ~40% of the time
      if (Math.random() < 0.4) {
        this._rollLine = Math.random() * H;
        this._rollLife = 0.08 + Math.random() * 0.08;
      }
    }

    // ── 3. Draw active glitch bands ────────────────────────────────────────
    if (this._glitchLife > 0) {
      for (const b of this._glitchBands) {
        ctx.fillStyle = `rgba(${b.r},${b.g},${b.b},${b.a.toFixed(3)})`;
        ctx.fillRect(0, b.y, W, b.h);
      }
    }

    // ── 4. VHS tracking roll — bright horizontal stripe ───────────────────
    if (this._rollLife > 0 && this._rollLine >= 0) {
      const progress = 1 - this._rollLife / 0.16;
      const alpha    = (0.18 * Math.sin(Math.PI * progress)).toFixed(3);
      ctx.fillStyle  = `rgba(255,255,240,${alpha})`;
      ctx.fillRect(0, this._rollLine, W, 2);
      // Darker band just below the bright line
      ctx.fillStyle = `rgba(0,0,0,${(Number(alpha) * 0.4).toFixed(3)})`;
      ctx.fillRect(0, this._rollLine + 2, W, 8);
    }

    // ── 5. Occasional single-pixel bright pop ─────────────────────────────
    if (Math.random() < 0.008) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, Math.random() * H, W, 1);
    }
  }
}
