import { bus, EVT } from '../core/EventBus.js';
import { UI } from '../config.js';

export class DeathScreen {
  constructor() {
    this.root = document.getElementById('death');
    this.timerEl = document.getElementById('death-timer');
    this.btn = this.root.querySelector('button[data-action="respawn"]');
    this.btn.addEventListener('click', () => this.trigger());
    this._remaining = 0;
    this._raf = null;
  }

  show() {
    this.root.classList.remove('hidden');
    this._remaining = UI.respawnDelayMs;
    this._tick();
  }

  hide() {
    this.root.classList.add('hidden');
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  trigger() {
    bus.emit(EVT.PLAYER_RESPAWN);
  }

  _tick() {
    const t0 = performance.now();
    const step = () => {
      const dt = performance.now() - t0;
      const left = Math.max(0, this._remaining - dt);
      this.timerEl.textContent = `Respawning in ${Math.ceil(left / 1000)}…`;
      if (left <= 0) {
        this.trigger();
        return;
      }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
}
