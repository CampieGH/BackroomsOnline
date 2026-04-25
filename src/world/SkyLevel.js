import * as THREE from 'three';
import { WORLD } from '../config.js';

// SkyLevel — a transit zone between City and the maze biomes.
// The player falls slowly through clouds toward a random maze.
// Gravity is reduced while in this Y band (handled in main.js).
//
// Y layout:
//   WORLD.skyPlatformY       — spawn platform
//   WORLD.skyPlatformY - 10  — platform bottom / free-fall begins
//   WORLD.skyExitY           — trigger: teleport to random biome

const SKY_FOG   = 0x8ab8d4;
const CLOUD_COL = 0xddeeff;
const NUM_CLOUDS = 14;
const ZONE_HALF  = 40;   // XZ half-size of the platform

export class SkyLevel {
  constructor({ renderer, physics }) {
    this.renderer = renderer;
    this.physics  = physics;
    this.root     = new THREE.Group();
    this.interactables = [];
    this.entities  = [];
    this.isSafe    = false;

    this._py = WORLD.skyPlatformY;
    this.spawn = new THREE.Vector3(0, this._py, 0);

    this._elapsed = 0;
    this._clouds  = [];

    this._buildPlatform();
    this._buildClouds();
    this._buildLight();

    // Hidden until player transitions here
    this.root.visible = false;

    renderer.add(this.root);
  }

  show() { this.root.visible = true; }
  hide() { this.root.visible = false; }

  get biomeName() { return 'Sky — The Void Between'; }

  _buildPlatform() {
    // A small floating slab — just enough to land on
    const geo = new THREE.BoxGeometry(6, 0.4, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xccddee, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, this._py + 0.2, 0);
    mesh.receiveShadow = true;
    this.root.add(mesh);

    // Physics floor for landing
    this.physics.addFloorSegment(
      this._py,
      -3, 3,
      -3, 3,
    );

    // Faint edge ring (visual only) so the player knows where the edge is
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.08, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = this._py + 0.45;
    this.root.add(ring);
  }

  _buildClouds() {
    const mat = new THREE.MeshBasicMaterial({
      color: CLOUD_COL, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false,
    });

    const py = this._py;
    for (let i = 0; i < NUM_CLOUDS; i++) {
      // Clouds are spread in a column below the platform
      const y     = py - 8 - (i / NUM_CLOUDS) * (WORLD.skyExitY - py + 8) * 0.9;
      const angle = (i / NUM_CLOUDS) * Math.PI * 2 * 2.4;
      const r     = 8 + Math.random() * 22;
      const w     = 18 + Math.random() * 28;
      const h     = 6  + Math.random() * 12;

      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.clone());
      cloud.position.set(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r,
      );
      // Tilt slightly for variety
      cloud.rotation.x = (Math.random() - 0.5) * 0.3;
      cloud.rotation.y = angle + Math.random() * 0.5;

      this._clouds.push({ mesh: cloud, driftX: (Math.random() - 0.5) * 0.8, driftZ: (Math.random() - 0.5) * 0.8 });
      this.root.add(cloud);
    }
  }

  _buildLight() {
    // Diffuse sky light from above
    const sun = new THREE.DirectionalLight(0xaaccff, 1.2);
    sun.position.set(10, this._py + 30, 5);
    this.root.add(sun);

    const fill = new THREE.AmbientLight(0x334455, 0.8);
    this.root.add(fill);
  }

  // Returns { fogColor, fogNear, fogFar, ambientColor, ambientIntensity }
  // for main.js to apply while player is in this level.
  getFogSettings() {
    return {
      fogColor: SKY_FOG,
      fogNear:  15,
      fogFar:   120,
    };
  }

  update(dt) {
    this._elapsed += dt;
    for (const c of this._clouds) {
      c.mesh.position.x += c.driftX * dt;
      c.mesh.position.z += c.driftZ * dt;
      // Gentle vertical bob
      c.mesh.position.y += Math.sin(this._elapsed * 0.3 + c.mesh.position.x) * 0.01;
    }
  }
}
