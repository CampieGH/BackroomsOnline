import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { bus, EVT } from '../../core/EventBus.js';

// Doorway to another level. Set `target` to one of the level keys
// understood by main.js (currently 'hub' or 'level1'). If target is
// null, the portal is locked and just plays a deny.

export class ExitPortal extends Interactive {
  constructor(position, label = 'Exit', target = null, color = 0x88ffff) {
    super({
      position,
      size: { x: 2.0, y: 2.5, z: 0.2 },
      label,
      prompt: `[E] ${label}`,
    });

    const geo = new THREE.PlaneGeometry(2.0, 2.5);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, position.y + 1.25, position.z);
    this._mat = mat;
    this._label = label;
    this.target = target;
  }

  update(dt) {
    this._mat.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 400);
  }

  onInteract(ctx) {
    if (!this.target) {
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `${this._label} — locked.` });
      ctx.audio?.deny?.();
      return;
    }
    bus.emit(EVT.WORLD_EXIT, { target: this.target });
    ctx.audio?.click?.();
  }
}
