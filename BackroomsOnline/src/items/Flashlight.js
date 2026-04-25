import * as THREE from 'three';
import { Item } from './Item.js';
import { FLASHLIGHT } from '../config.js';
import { bus, EVT } from '../core/EventBus.js';
import { clamp } from '../utils/Helpers.js';

export class Flashlight extends Item {
  constructor() {
    super('flashlight', 'Flashlight');
    this.battery   = FLASHLIGHT.batteryMax;
    this.on        = false;
    this._overcharge = 0; // seconds of overcharge remaining

    // Three.js SpotLight attached to the camera — owner wires it in.
    this.light = new THREE.SpotLight(
      FLASHLIGHT.color,
      0,                       // start off
      FLASHLIGHT.radius,
      FLASHLIGHT.angle,
      FLASHLIGHT.penumbra,
      FLASHLIGHT.decay,
    );
    this.light.position.set(0, 0, 0);
    this.light.target.position.set(0, 0, -1);
    // Soft shadow casting
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.0008;
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = FLASHLIGHT.radius;
  }

  setOn(v) {
    if (v === this.on) return;
    if (v && this.battery <= 0) return;
    this.on = v;
    this.light.intensity = v ? FLASHLIGHT.intensity : 0;
    bus.emit(EVT.FLASHLIGHT_TOGGLED, this.on);
  }

  toggle() { this.setOn(!this.on); }

  charge(dt) {
    const was = this.battery;
    this.battery = clamp(this.battery + FLASHLIGHT.chargePerSec * dt, 0, FLASHLIGHT.batteryMax);
    if (Math.floor(was) !== Math.floor(this.battery)) {
      bus.emit(EVT.FLASHLIGHT_BATTERY, this.battery);
    }
  }

  update(dt) {
    // Tick down overcharge
    if (this._overcharge > 0) this._overcharge = Math.max(0, this._overcharge - dt);

    if (!this.on) return;
    const was     = this.battery;
    const drain   = FLASHLIGHT.drainPerSec * (this._overcharge > 0 ? 2.5 : 1);
    this.battery  = clamp(this.battery - drain * dt, 0, FLASHLIGHT.batteryMax);

    const baseInt = FLASHLIGHT.intensity * (this._overcharge > 0 ? 2 : 1);

    // Flicker when battery low (overcharge ignores flicker until it runs out)
    if (this.battery < FLASHLIGHT.lowBatteryThreshold && this._overcharge <= 0) {
      const flicker = Math.random() > 0.9 ? 0.3 : 1.0;
      this.light.intensity = baseInt * flicker;
    } else {
      this.light.intensity = baseInt;
    }

    if (this.battery <= 0) this.setOn(false);

    if (Math.floor(was) !== Math.floor(this.battery)) {
      bus.emit(EVT.FLASHLIGHT_BATTERY, this.battery);
    }
  }

  onDrop() { this.setOn(false); }
}
