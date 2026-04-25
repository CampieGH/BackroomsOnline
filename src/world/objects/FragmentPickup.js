import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { ItemRegistry } from '../../items/ItemRegistry.js';
import { bus, EVT } from '../../core/EventBus.js';

// A Reality Fragment lying on the floor of Level 0.
// Spins slowly, emits a faint blue glow. Disappears on pickup.

export class FragmentPickup extends Interactive {
  constructor(position) {
    super({
      position,
      size: { x: 0.4, y: 0.5, z: 0.4 },
      label: 'Reality Fragment',
      prompt: '[E] Pick up Reality Fragment',
    });

    this._picked = false;
    this._group  = new THREE.Group();
    this._group.position.set(position.x, position.y, position.z);

    // Crystal shard
    const geo = new THREE.OctahedronGeometry(0.18, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x112244,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 0.25;
    this.mesh.castShadow = true;
    this._group.add(this.mesh);

    // Soft blue point light
    this._light = new THREE.PointLight(0x2244ff, 1.2, 3.5, 2);
    this._light.position.y = 0.3;
    this._group.add(this._light);

    this._phase = Math.random() * Math.PI * 2;
  }

  // Called from Level0 to add mesh to scene
  addToScene(parent) { parent.add(this._group); }

  dispose() {
    this.mesh?.geometry?.dispose();
    this.mesh?.material?.dispose();
    // _light and _group are removed by the caller (root.remove); no GPU data to free
  }

  update(dt) {
    if (this._picked) return;
    this._phase += dt * 1.4;
    this.mesh.rotation.y = this._phase;
    this.mesh.position.y = 0.25 + Math.sin(this._phase * 0.7) * 0.06;
    // Pulse light
    this._light.intensity = 0.9 + 0.5 * Math.sin(this._phase * 1.3);
  }

  onInteract(ctx) {
    if (this._picked) return;
    const item = ItemRegistry.create('reality_fragment');
    if (!ctx.player.inventory.add(item)) {
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Inventory full.' });
      ctx.audio?.deny?.();
      return;
    }
    this._picked = true;
    this.prompt  = '';
    // Fade out: hide mesh and light
    this._group.visible = false;
    ctx.audio?.pickup?.();
    bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'You found a Reality Fragment.' });
  }
}
