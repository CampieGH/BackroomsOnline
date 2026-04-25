import * as THREE from 'three';
import { WORLD } from '../config.js';
import { seededRNG } from '../utils/rng.js';
import { SupplyCrate } from './objects/SupplyCrate.js';
import { FragmentPickup } from './objects/FragmentPickup.js';

// Rooftop Level — a district of skyscrapers shrouded in fog.
// Player spawns on a starting roof and can jump between nearby rooftops.
// Buildings plunge into thick fog below; the ground is invisible.
// Falling off → 50% death, 50% SkyLevel.
//
// IMPORTANT: root.visible starts false — shown only when player transitions here.

const BASE_Y     = WORLD.cityFloorY;  // Y=80
const FOG_COLOR  = 0x10141a;
const NUM_ROOFS  = 12;
const AREA_HALF  = 60;  // buildings spread ±60m in XZ

export class CityLevel {
  constructor({ renderer, physics, seed = 0 }) {
    this.renderer = renderer;
    this.physics  = physics;
    this.root     = new THREE.Group();
    this.interactables = [];
    this.entities  = [];
    this.isSafe    = false;

    this._seed    = seed;
    this._elapsed = 0;
    this._roofs   = [];  // { x, z, halfW, halfD, y, mesh }

    this._buildRooftops();
    this._buildLights();

    // Hidden until player transitions here
    this.root.visible = false;

    renderer.add(this.root);
  }

  get biomeName() { return 'Rooftop — The Spire District'; }

  /** First roof in the list is the spawn point. */
  get spawn() {
    const r = this._roofs[0];
    return new THREE.Vector3(r.x, r.y + 0.3, r.z);
  }

  show() { this.root.visible = true; }
  hide() { this.root.visible = false; }

  // -------------------------------------------------------------------------

  _buildRooftops() {
    const rng = seededRNG(this._seed + 100);

    // Materials
    const tarMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 1.0, metalness: 0 });
    tarMat.map = this._makeTarTexture();
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9, metalness: 0 });
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x334466, roughness: 0.05, metalness: 0.8,
      transparent: true, opacity: 0.65,
    });

    // --- Place rooftops ---
    // First roof: spawn — close to center, flat
    const spawnDef = { x: 0, z: 0, hw: 9, hd: 9, dy: 0 };
    // Remaining roofs: spread around
    const defs = [spawnDef];
    for (let i = 1; i < NUM_ROOFS; i++) {
      const angle = (i / NUM_ROOFS) * Math.PI * 2 + rng() * 0.6;
      const dist  = 18 + rng() * 38;
      defs.push({
        x:  Math.cos(angle) * dist,
        z:  Math.sin(angle) * dist,
        hw: 5 + rng() * 9,
        hd: 5 + rng() * 9,
        dy: (rng() - 0.5) * 10,  // ±5m height variation
      });
    }

    const lootSlots = new Set();
    const fragSlots = new Set();
    // Decide which roofs get loot (every 3rd) and which get fragments (2 total)
    for (let i = 1; i < defs.length; i++) {
      if (i % 3 === 0) lootSlots.add(i);
    }
    const fragCandidates = defs.map((_, i) => i).filter(i => i > 0 && !lootSlots.has(i));
    for (let k = 0; k < 2 && fragCandidates.length; k++) {
      const idx = Math.floor(rng() * fragCandidates.length);
      fragSlots.add(fragCandidates.splice(idx, 1)[0]);
    }

    // --- Build each rooftop ---
    for (let i = 0; i < defs.length; i++) {
      const b  = defs[i];
      const ry = BASE_Y + b.dy;

      // Roof slab
      const slabH = 0.5;
      const slab  = new THREE.Mesh(
        new THREE.BoxGeometry(b.hw * 2, slabH, b.hd * 2),
        tarMat,  // shared across all slabs
      );
      slab.position.set(b.x, ry - slabH / 2, b.z);
      slab.receiveShadow = true;
      this.root.add(slab);

      // Building body going DOWN into fog (30–50m, just a visual facade)
      const facadeH = 30 + rng() * 20;
      const facade  = new THREE.Mesh(
        new THREE.BoxGeometry(b.hw * 2, facadeH, b.hd * 2),
        wallMat,  // shared
      );
      facade.position.set(b.x, ry - slabH - facadeH / 2, b.z);
      facade.castShadow = true;
      facade.receiveShadow = true;
      this.root.add(facade);

      // Window strips on facade (every 3.5m)
      const floorH = 3.5;
      const floors = Math.floor(facadeH / floorH);
      for (let f = 0; f < Math.min(floors, 8); f++) {
        const wy = ry - slabH - 1.0 - f * floorH;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(b.hw * 2 + 0.05, 1.4, b.hd * 2 + 0.05),
          glassMat,  // shared — no per-strip clone
        );
        strip.position.set(b.x, wy, b.z);
        this.root.add(strip);
      }

      // Low parapet (0.7m tall, walkable edge)
      // 0.45 m is below the max jump height (7²/40 ≈ 1.22 m) so players can hop over
      const parapetH = 0.45, pT = 0.25;
      const parapetMat = concreteMat;  // shared
      const pSides = [
        { w: b.hw*2 + pT*2, d: pT, ox: 0,      oz:  b.hd + pT/2 },
        { w: b.hw*2 + pT*2, d: pT, ox: 0,      oz: -b.hd - pT/2 },
        { w: pT, d: b.hd*2 + pT*2, ox:  b.hw + pT/2, oz: 0      },
        { w: pT, d: b.hd*2 + pT*2, ox: -b.hw - pT/2, oz: 0      },
      ];
      for (const ps of pSides) {
        const pm = new THREE.Mesh(
          new THREE.BoxGeometry(ps.w, parapetH, ps.d),
          parapetMat,
        );
        pm.position.set(b.x + ps.ox, ry + parapetH / 2, b.z + ps.oz);
        pm.castShadow = true;
        this.root.add(pm);

        this.physics.addBox(
          new THREE.Vector3(b.x + ps.ox - ps.w/2, ry,            b.z + ps.oz - ps.d/2),
          new THREE.Vector3(b.x + ps.ox + ps.w/2, ry + parapetH, b.z + ps.oz + ps.d/2),
        );
      }

      // HVAC details on larger rooftops
      if (b.hw > 6) {
        const hvacMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
        const hx = b.x + (rng() - 0.5) * b.hw * 1.2;
        const hz = b.z + (rng() - 0.5) * b.hd * 1.2;
        const hh = 0.8 + rng() * 1.4, hw2 = 0.8 + rng() * 1.8, hd2 = 0.8 + rng() * 1.2;
        const hvac = new THREE.Mesh(new THREE.BoxGeometry(hw2, hh, hd2), hvacMat);
        hvac.position.set(hx, ry + hh / 2, hz);
        hvac.castShadow = true;
        this.root.add(hvac);
      }

      // Physics floor
      this.physics.addFloorSegment(ry, b.x - b.hw, b.x + b.hw, b.z - b.hd, b.z + b.hd);

      const roofData = { x: b.x, z: b.z, halfW: b.hw, halfD: b.hd, y: ry };
      this._roofs.push(roofData);

      // Loot placement
      if (lootSlots.has(i)) {
        const crate = new SupplyCrate({ x: b.x, y: ry, z: b.z });
        if (crate.mesh) this.root.add(crate.mesh);
        this.interactables.push(crate);
        this.entities.push(crate);
      }
      if (fragSlots.has(i)) {
        const frag = new FragmentPickup({ x: b.x + (rng()-0.5)*2, y: ry + 0.01, z: b.z + (rng()-0.5)*2 });
        frag.addToScene(this.root);  // add to root, not global scene
        this.interactables.push(frag);
        this.entities.push(frag);
      }
    }

    // Gap bridges: for any two roofs within jump range, add a glowing edge indicator
    this._buildJumpMarkers();
  }

  _buildJumpMarkers() {
    // Horizontal gap ≤ 5m AND height diff ≤ 2.5m → jumpable, show a glow strip at parapet edge
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22, transparent: true, opacity: 0.6, depthWrite: false,
    });
    for (let i = 0; i < this._roofs.length; i++) {
      for (let j = i + 1; j < this._roofs.length; j++) {
        const a = this._roofs[i], b = this._roofs[j];
        const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
        const dy = Math.abs(a.y - b.y);
        // Closest edge gap
        const gapX = Math.max(0, dx - a.halfW - b.halfW);
        const gapZ = Math.max(0, dz - a.halfD - b.halfD);
        const gap  = Math.sqrt(gapX * gapX + gapZ * gapZ);
        if (gap <= 4.0 && dy <= 2.5) {
          // Place a small glowing strip on each parapet edge facing the other
          for (const [r, other] of [[a, b], [b, a]]) {
            const dir  = new THREE.Vector2(other.x - r.x, other.z - r.z).normalize();
            const ex   = r.x + dir.x * r.halfW;
            const ez   = r.z + dir.y * r.halfD;
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), markerMat.clone());
            strip.position.set(ex, r.y + 0.01, ez);
            this.root.add(strip);
          }
        }
      }
    }
  }

  _makeTarTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, size, size);
    // Gravel noise
    for (let i = 0; i < 1200; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 1 + Math.random() * 3;
      const v = Math.floor(28 + Math.random() * 18);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Tar line cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.needsUpdate = true;
    return tex;
  }

  _buildLights() {
    // Cold moonlight-style directional
    const dir = new THREE.DirectionalLight(0x8899bb, 0.5);
    dir.position.set(20, BASE_Y + 50, 10);
    this.root.add(dir);

    // Per-roof warm accent lights (only on first 4 to keep draw calls low)
    for (let i = 0; i < Math.min(4, this._roofs.length); i++) {
      const r  = this._roofs[i];
      const pl = new THREE.PointLight(0xff9955, 1.2, 14, 2);
      pl.position.set(r.x, r.y + 3, r.z);
      this.root.add(pl);
    }
  }

  getFogSettings() {
    return { fogColor: FOG_COLOR, fogNear: 5, fogFar: 28 };
  }

  update(dt) {
    this._elapsed += dt;
    for (const e of this.entities) e.update?.(dt);
  }
}
