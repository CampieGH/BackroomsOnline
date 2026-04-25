import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { ItemRegistry } from '../../items/ItemRegistry.js';
import { bus, EVT } from '../../core/EventBus.js';

// One-shot crate. Loot table is configurable per-level.
// Default (rooftop): royal_ration / first_aid
// Level 0 survival: almond_water / royal_ration / overcharged_battery / first_aid

export class SupplyCrate extends Interactive {
  /**
   * @param {{ x, y, z }} position
   * @param {string[]} [lootTable]  Array of item ids to randomly pick from.
   */
  constructor(position, lootTable = null) {
    super({
      position,
      size: { x: 0.8, y: 0.6, z: 0.8 },
      label: 'Supply Crate',
      prompt: '[E] Open crate',
    });
    this._lootTable = lootTable ?? ['royal_ration', 'first_aid'];
    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x554433 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, position.y + 0.3, position.z);
    this._taken = false;
  }

  dispose() {
    this.mesh?.geometry?.dispose();
    this.mesh?.material?.dispose();
  }

  onInteract(ctx) {
    if (this._taken) {
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Crate is empty.' });
      ctx.audio?.deny?.();
      return;
    }
    const pool = this._lootTable;
    const id   = pool[Math.floor(Math.random() * pool.length)];
    const item = ItemRegistry.create(id);
    if (!ctx.player.inventory.add(item)) {
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Inventory full.' });
      ctx.audio?.deny?.();
      return;
    }
    this._taken = true;
    this.prompt = '(empty)';
    this.mesh.material.color.setHex(0x222222);
    ctx.audio?.pickup?.();
  }
}
