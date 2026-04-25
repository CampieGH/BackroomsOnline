// Keyboard + mouse (pointer lock). Holds current input state and yaw/pitch.

import { PLAYER } from '../config.js';
import { clamp } from '../utils/Helpers.js';

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;

    this.keys = new Set();
    this.pressed = new Set();   // one-shot presses, consumed by consumeKey()
    this.yaw = 0;
    this.pitch = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;

    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Suppress browser default actions for any key during gameplay:
      // F5 reload, Backspace back-nav, Tab focus, Ctrl+R/S, Space scroll,
      // arrow scrolling, etc. Allow F12 so DevTools still opens.
      if (e.code !== 'F12') e.preventDefault();
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    document.addEventListener('keyup', (e) => {
      if (this.enabled && e.code !== 'F12') e.preventDefault();
      this.keys.delete(e.code);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.canvas) return;
      this.yaw   -= e.movementX * PLAYER.mouseSensitivity;
      this.pitch -= e.movementY * PLAYER.mouseSensitivity;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    });
    // Block context menu (right-click) which can also pop browser UI
    document.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
  }

  requestLock() {
    this.canvas.requestPointerLock?.();
  }

  releaseLock() {
    document.exitPointerLock?.();
  }

  isLocked() { return document.pointerLockElement === this.canvas; }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.keys.clear();
  }

  consumeKey(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  clearPressed() { this.pressed.clear(); }

  // Direction vector in XZ plane: forward (W/S) and strafe (A/D).
  moveInput() {
    let fwd = 0, strafe = 0;
    if (this.keys.has('KeyW')) fwd += 1;
    if (this.keys.has('KeyS')) fwd -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;
    return { fwd, strafe };
  }

  sprintHeld() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  crouchHeld() { return this.keys.has('ControlLeft') || this.keys.has('ControlRight'); }
  jumpHeld()   { return this.keys.has('Space'); }
}
