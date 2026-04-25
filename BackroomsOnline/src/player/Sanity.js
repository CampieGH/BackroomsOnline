import { SANITY } from '../config.js';
import { bus, EVT } from '../core/EventBus.js';
import { clamp } from '../utils/Helpers.js';

export class Sanity {
  constructor() {
    this.value       = SANITY.max;
    this._aloneTimer = 0;
    this._collapsing = false;
  }

  set(v) {
    const next = clamp(v, 0, SANITY.max);
    if (next <= 0 && this.value > 0 && !this._collapsing) {
      this._collapsing = true;
      bus.emit(EVT.SANITY_COLLAPSE);
    }
    if (next !== this.value) {
      this.value = next;
      bus.emit(EVT.PLAYER_SAN_CHANGED, this.value);
    }
  }

  add(delta) { this.set(this.value + delta); }

  resetCollapse() { this._collapsing = false; }

  update(dt, { inDark, alone, sanMul = 1.0 }) {
    let delta = 0;
    if (inDark) delta -= SANITY.darkLossPerSec * sanMul * dt;
    if (alone) {
      this._aloneTimer += dt;
      if (this._aloneTimer > SANITY.aloneThresholdSec)
        delta -= SANITY.aloneLossPerSec * sanMul * dt;
    } else {
      this._aloneTimer = 0;
    }
    if (delta !== 0) this.add(delta);
  }
}
