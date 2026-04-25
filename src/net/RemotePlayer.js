// Remote player avatar: capsule + head + flashlight cone.
// Interpolates to last-received state over 120ms to hide jitter.

import * as THREE from 'three';
import { PLAYER, FLASHLIGHT } from '../config.js';
import { damp } from '../utils/Helpers.js';

export class RemotePlayer {
  constructor(id) {
    this.id = id;
    this.root = new THREE.Group();

    // Body (capsule)
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 }),
    );
    body.position.y = PLAYER.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    this.body = body;

    // Head (separate so we can rotate with pitch)
    const head = new THREE.Group();
    head.position.y = PLAYER.eyeHeightStand;
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xddccbb, roughness: 0.6 }),
    );
    headMesh.castShadow = true;
    head.add(headMesh);
    this.root.add(head);
    this.head = head;

    // Remote flashlight
    this.flashlight = new THREE.SpotLight(
      FLASHLIGHT.color, 0,
      FLASHLIGHT.radius, FLASHLIGHT.angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay,
    );
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);
    head.add(this.flashlight);
    head.add(this.flashlight.target);

    // target state (interpolated toward)
    this.target = {
      pos: new THREE.Vector3(),
      pitch: 0, yaw: 0,
      crouch: false, fl: false,
    };
    this.inElevator = false;
    this.voted      = false;
  }

  applyState(s) {
    this.target.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    this.target.pitch = s.rot[0];
    this.target.yaw   = s.rot[1];
    this.target.crouch = !!s.crouch;
    this.target.fl = !!s.fl;
    this.inElevator = !!s.elev;
    this.voted      = !!s.voted;
  }

  update(dt) {
    // Damp position + rotation
    this.root.position.x = damp(this.root.position.x, this.target.pos.x, 16, dt);
    this.root.position.y = damp(this.root.position.y, this.target.pos.y, 16, dt);
    this.root.position.z = damp(this.root.position.z, this.target.pos.z, 16, dt);
    this.root.rotation.y = damp(this.root.rotation.y, this.target.yaw, 14, dt);
    this.head.rotation.x = damp(this.head.rotation.x, this.target.pitch, 14, dt);

    // Body shrink when crouched
    const wantY = this.target.crouch ? PLAYER.eyeHeightCrouch : PLAYER.eyeHeightStand;
    this.head.position.y = damp(this.head.position.y, wantY, 10, dt);

    // Flashlight toggle
    this.flashlight.intensity = this.target.fl ? FLASHLIGHT.intensity : 0;
  }

  dispose() {
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose?.();
      if (n.material) n.material.dispose?.();
    });
  }
}
