import * as THREE from 'three';

// Base class for any interactable world object.
// Each instance owns a Three.js mesh and an AABB for raycasting.

let nextId = 1;

export class Interactive {
  constructor({ position, size, label = 'Interact', prompt = 'Press E' }) {
    this.id = nextId++;
    this.label = label;
    this.prompt = prompt;

    this.mesh = null;          // subclass provides
    this.aabb = {
      min: new THREE.Vector3(position.x - size.x/2, position.y,         position.z - size.z/2),
      max: new THREE.Vector3(position.x + size.x/2, position.y + size.y, position.z + size.z/2),
    };
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.size = new THREE.Vector3(size.x, size.y, size.z);
  }

  // Called when player presses E while looking at this.
  onInteract(/* ctx */) {}

  // Called every frame when player is within interaction distance (proximity effects).
  onProximity(/* dt, ctx */) {}

  // Optional animation/update independent of player.
  update(/* dt */) {}

  // Build the AABB from current position/size if it moves (rare).
  refreshAABB() {
    this.aabb.min.set(
      this.position.x - this.size.x/2,
      this.position.y,
      this.position.z - this.size.z/2,
    );
    this.aabb.max.set(
      this.position.x + this.size.x/2,
      this.position.y + this.size.y,
      this.position.z + this.size.z/2,
    );
  }
}
