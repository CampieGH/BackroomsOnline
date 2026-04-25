import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { INVENTORY } from '../../config.js';

// Wall-mounted charging dock. Stand near it and hold E to charge the active
// flashlight. No toggle state — it's a "hold-to-charge" contact.

export class ChargerDock extends Interactive {
  constructor(position) {
    super({
      position,
      size: { x: 0.6, y: 0.6, z: 0.3 },
      label: 'Charger Dock',
      prompt: '[E] Hold to charge flashlight',
    });

    const geo = new THREE.BoxGeometry(0.6, 0.6, 0.3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x002244, emissiveIntensity: 0.4 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, position.y + 0.3, position.z);

    // Small glowing led
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x44ccff }),
    );
    led.position.set(0.2, 0.15, 0.16);
    this.mesh.add(led);
    this._led = led;
  }

  onInteract(ctx) {
    // One "press" — charges a tiny burst; proximity hold does the rest.
    const fl = ctx?.player?.flashlight;
    if (!fl) return;
    fl.charge(0.5);
    ctx.audio?.click?.();
  }

  onProximity(dt, ctx) {
    const fl = ctx?.player?.flashlight;
    if (!fl) return;
    // Only charge while E is held down
    if (ctx.controls.keys.has('KeyE')) {
      fl.charge(dt);
      // pulse LED
      this._led.material.color.setHSL(0.55, 1, 0.5 + 0.3 * Math.sin(ctx.state.time * 6));
    }
  }
}
