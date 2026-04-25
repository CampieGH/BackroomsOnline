import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { ItemRegistry } from '../../items/ItemRegistry.js';
import { bus, EVT } from '../../core/EventBus.js';

// Dispenses Almond Water with a 30s cooldown (per player, local).

export class VendingMachine extends Interactive {
  constructor(position) {
    super({
      position,
      size: { x: 1.0, y: 2.0, z: 0.6 },
      label: 'Almond Water Dispenser',
      prompt: '[E] Take Almond Water',
    });

    const geo = new THREE.BoxGeometry(1.0, 2.0, 0.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: 0x110500 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, position.y + 1.0, position.z);

    // glass window
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.3),
      new THREE.MeshStandardMaterial({ color: 0xccffcc, transparent: true, opacity: 0.25, emissive: 0x335533, emissiveIntensity: 0.5 }),
    );
    glass.position.set(0, 0.1, 0.31);
    this.mesh.add(glass);

    this._cooldown = 0;
  }

  update(dt) {
    if (this._cooldown > 0) this._cooldown = Math.max(0, this._cooldown - dt);
    this.prompt = this._cooldown > 0
      ? `Cooling down... ${Math.ceil(this._cooldown)}s`
      : '[E] Take Almond Water';
  }

  onInteract(ctx) {
    if (this._cooldown > 0) {
      ctx.audio?.deny?.();
      return;
    }
    const item = ItemRegistry.create('almond_water');
    const added = ctx.player.inventory.add(item);
    if (!added) {
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Inventory full.' });
      ctx.audio?.deny?.();
      return;
    }
    this._cooldown = 30;
    ctx.audio?.pickup?.();
  }
}
