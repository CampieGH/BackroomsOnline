import * as THREE from 'three';
import { ENTITY } from '../config.js';
// HP damage removed — Smilers drain sanity only.

// Smiler — the canonical Backrooms creature.
// Behaviour:
//   • Always tries to move toward the player on the XZ plane.
//   • If the player's flashlight is ON, the player is facing the Smiler
//     within the cone, AND distance < smilerFlashRange — the Smiler
//     reverses direction at retreat speed.
//   • On contact (distance < contactDist) it drains HP/sanity per second.
// Movement uses the same axis-separated AABB sweep as the player so it
// can't pass through walls.

const TWO_EYE_GEOM = new THREE.SphereGeometry(0.06, 8, 6);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Smiler {
  constructor(pos, world) {
    this.world = world;
    this.position = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.radius = 0.35;
    this.height = 1.9;
    this._contactTick = 0;

    this.root = new THREE.Group();

    // Black silhouette body
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.radius, this.height - 2 * this.radius, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, metalness: 0 }),
    );
    body.position.y = this.height / 2;
    body.castShadow = true;
    this.root.add(body);

    // Glowing white grin (just two arched mouths and two eyes via emissive material)
    const grinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const grin = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.08), grinMat);
    grin.position.set(0, this.height - 0.55, this.radius + 0.001);
    this.root.add(grin);
    this._grin = grin;

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lEye = new THREE.Mesh(TWO_EYE_GEOM, eyeMat);
    const rEye = new THREE.Mesh(TWO_EYE_GEOM, eyeMat);
    lEye.position.set(-0.13, this.height - 0.32, this.radius + 0.001);
    rEye.position.set( 0.13, this.height - 0.32, this.radius + 0.001);
    this.root.add(lEye);
    this.root.add(rEye);

    this._syncMesh();
  }

  _syncMesh() {
    this.root.position.copy(this.position);
  }

  update(dt, ctx) {
    const player = ctx?.player;
    if (!player) return;

    // Vector to player on XZ
    _v1.set(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const dist = _v1.length();
    if (dist < 0.0001) return;
    _v1.divideScalar(dist);

    // Detect flashlight push-back: flashlight on, player facing this, in range.
    let pushedBack = false;
    if (dist < ENTITY.smilerFlashRange && player.flashlight?.on) {
      // Player's forward vs vector from player → smiler
      const fwd = player.getForward();
      _v2.set(this.position.x - player.position.x, 0, this.position.z - player.position.z).normalize();
      const dot = fwd.x * _v2.x + fwd.z * _v2.z;
      if (dot > ENTITY.smilerFlashCone) pushedBack = true;
    }

    let dirX = _v1.x, dirZ = _v1.z;
    let speed = ENTITY.smilerSpeed;
    if (pushedBack) {
      dirX = -dirX; dirZ = -dirZ;
      speed = ENTITY.smilerRetreatSpeed;
    }

    // Axis-separated AABB slide against the world's physics colliders
    const physics = this.world.physics;
    const r = this.radius, h = this.height;
    const next = this.position.clone();
    next.x += dirX * speed * dt;
    if (physics._collidesXZ(next, r, h)) next.x = this.position.x;
    next.z += dirZ * speed * dt;
    if (physics._collidesXZ(next, r, h)) next.z = this.position.z;
    this.position.copy(next);

    // Face the player (or away)
    const faceDir = pushedBack ? -1 : 1;
    this.root.rotation.y = Math.atan2(_v1.x * faceDir, _v1.z * faceDir);

    this._syncMesh();

    // Contact — sanity drain only
    if (dist < ENTITY.smilerContactDist && !pushedBack) {
      player.sanity?.add?.(-ENTITY.smilerSanityDPS * dt);
      player.addShake?.(0.18);
      if (!this._audioTick) {
        this._audioTick = 0.4;
        ctx.audio?.deny?.();
      }
      this._audioTick = Math.max(0, (this._audioTick ?? 0) - dt);
    } else {
      this._audioTick = 0;
    }
  }

  dispose() {
    this.root.traverse((n) => {
      if (n.isMesh) {
        n.geometry?.dispose?.();
        // shared materials are tiny — leave them
      }
    });
  }
}
