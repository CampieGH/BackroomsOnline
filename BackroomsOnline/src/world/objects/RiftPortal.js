import * as THREE from 'three';
import { Interactive } from './Interactive.js';
import { bus, EVT } from '../../core/EventBus.js';

// A rift portal — a hovering ring of distorted light in the maze.
// Appears at a set drift threshold.
// Interacting fires EVT.ROOM_CHANGE — a drift event that changes the room type.
// No teleport, no separate scene — the ROOM changes around the player.
//
// type: 'urban' | 'void' | 'ocean' | 'corridor' | 'hazard'   (PLAN.md node types)

export class RiftPortal extends Interactive {
  constructor(position, type = 'urban') {
    const LABELS = { urban: 'Urban Rift', void: 'Void Rift', ocean: 'Ocean Rift',
                     corridor: 'Rift', hazard: 'Hazard Rift' };
    super({
      position,
      size: { x: 1.6, y: 2.4, z: 1.6 },
      label: LABELS[type] ?? 'Rift',
      prompt: `[E] Enter the Rift → ${type}`,
    });

    this.type = type;
    this._group  = new THREE.Group();
    this._group.position.set(position.x, position.y, position.z);
    this._phase  = 0;
    this._active = false;  // becomes true when drift threshold met

    const RING_COLORS = { urban: 0xff6622, hazard: 0xff2200, ocean: 0x0066ff, void: 0x8833cc, corridor: 0xaaffaa };
    const CORE_COLORS = { urban: 0xff3300, hazard: 0xff0000, ocean: 0x0044cc, void: 0x6611aa, corridor: 0x88ff88 };
    const ringColor = RING_COLORS[type] ?? 0x22aaff;
    const coreColor = CORE_COLORS[type] ?? 0x0088ff;

    // Outer ring
    this._ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.12, 12, 48),
      new THREE.MeshStandardMaterial({
        color: ringColor, emissive: ringColor, emissiveIntensity: 1.5,
        roughness: 0.2, metalness: 0.8,
      }),
    );
    this._ring.position.y = 1.4;
    this._group.add(this._ring);

    // Portal disc (translucent fill)
    this._disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 48),
      new THREE.MeshBasicMaterial({
        color: coreColor, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    this._disc.position.y = 1.4;
    this._group.add(this._disc);

    // Glow light
    this._light = new THREE.PointLight(ringColor, 0, 8, 2);
    this._light.position.y = 1.4;
    this._group.add(this._light);

    // Start hidden — revealed when drift threshold met
    this._group.visible = false;
  }

  addToScene(parent) { parent.add(this._group); }

  activate() {
    if (this._active) return;
    this._active = true;
    this._group.visible = true;
  }

  update(dt) {
    if (!this._active) return;
    this._phase += dt;

    // Slow rotation
    this._ring.rotation.y += dt * 0.6;
    this._disc.rotation.y += dt * 0.4;

    // Pulsing glow
    this._light.intensity = 1.2 + 0.8 * Math.sin(this._phase * 2.5);

    // Subtle levitation
    this._group.position.y = this.position.y + Math.sin(this._phase * 0.8) * 0.08;
  }

  onInteract(ctx) {
    if (!this._active) return;
    // Drift event — changes room type, no teleport, no separate scene.
    bus.emit(EVT.ROOM_CHANGE, { type: this.type });
    ctx.audio?.click?.();
  }
}
