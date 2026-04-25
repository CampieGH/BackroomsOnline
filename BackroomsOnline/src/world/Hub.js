import * as THREE from 'three';
import { WORLD, LIGHT } from '../config.js';
import { ChargerDock } from './objects/ChargerDock.js';
import { VendingMachine } from './objects/VendingMachine.js';
import { InfoBoard } from './objects/InfoBoard.js';
import {
  makeOfficePlasterTexture,
  makeOfficeCarpetTexture,
  makeCeilingTexture,
} from '../utils/textures.js';

// Hub — a normal fluorescent office.
// There are no level-transitions here. At the center of the room a section of
// floor is missing, fenced off with caution tape. Walking into that zone means
// walking off the edge of reality — you fall through to Level 0 below.

const HUB_HALF  = 10;   // room is 20 × 20 m
const HOLE_HALF = 1.5;  // 3 × 3 m hole, centered at origin

export class Hub {
  constructor({ renderer, physics }) {
    this.renderer = renderer;
    this.physics  = physics;
    this.root     = new THREE.Group();
    this.interactables = [];
    this.entities  = [];
    this.isSafe    = true;

    // Hub sits at WORLD.hubFloorY in world space (positive Y — avoids
    // negative-coordinate edge cases in floor-segment physics).
    this._oy = WORLD.hubFloorY;
    this.root.position.y = this._oy;
    this.spawn = new THREE.Vector3(0, this._oy, 6);

    this._collapsed = false;
    this._floorSegs = [];
    this._floorMesh = null;

    this._buildMaterials();
    this._buildFloor();
    this._buildWalls();
    this._buildCeiling();
    this._buildLights();
    this._placeInteractables();

    renderer.add(this.root);
  }

  _buildMaterials() {
    this.wallMat  = new THREE.MeshStandardMaterial({
      map: makeOfficePlasterTexture(), roughness: 0.9, metalness: 0,
    });
    this.floorMat = new THREE.MeshStandardMaterial({
      map: makeOfficeCarpetTexture(), roughness: 1, metalness: 0,
    });
    this.ceilMat  = new THREE.MeshStandardMaterial({
      map: makeCeilingTexture(), roughness: 1, metalness: 0,
    });
  }

  // Visually a seamless floor — solid everywhere initially.
  _buildFloor() {
    const H = HUB_HALF, h = HOLE_HALF;

    this._floorMesh = this._floorPlane(0, 0, H * 2, H * 2);

    const p = this.physics, y = this._oy;
    this._floorSegs.push(p.addFloorSegment(y, -H,  H, -H, -h));  // south strip
    this._floorSegs.push(p.addFloorSegment(y, -H,  H,  h,  H));  // north strip
    this._floorSegs.push(p.addFloorSegment(y, -H, -h, -h,  h));  // west sliver
    this._floorSegs.push(p.addFloorSegment(y,  h,  H, -h,  h));  // east sliver
    this._floorSegs.push(p.addFloorSegment(y, -h,  h, -h,  h));  // centre
  }

  // Removes all hub floor physics + visual mesh.
  // Adds a safety-net segment at Level 0 height covering the full hub footprint
  // to catch players who fall near walls (Level 0's own floor may not reach them).
  collapseFloor() {
    if (this._collapsed) return;
    this._collapsed = true;

    for (const seg of this._floorSegs) this.physics.removeFloorSegment(seg);
    if (this._floorMesh) this.root.remove(this._floorMesh);

    // Safety net: Level 0 floor may not cover the full hub XZ footprint
    const H = HUB_HALF;
    this.physics.addFloorSegment(WORLD.level0FloorY, -H, H, -H, H);
  }

  _floorPlane(cx, cz, w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0, cz);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  _buildWalls() {
    const H = HUB_HALF, WH = WORLD.wallHeight, T = 0.15;
    // S: z = +H
    this._addWall(-H,  H,  H,  H, WH, T);
    // N: z = -H
    this._addWall(-H, -H,  H, -H, WH, T);
    // W: x = -H
    this._addWall(-H, -H, -H,  H, WH, T);
    // E: x = +H
    this._addWall( H, -H,  H,  H, WH, T);
  }

  _addWall(x1, z1, x2, z2, height, thickness) {
    const minX = Math.min(x1, x2) - thickness / 2;
    const maxX = Math.max(x1, x2) + thickness / 2;
    const minZ = Math.min(z1, z2) - thickness / 2;
    const maxZ = Math.max(z1, z2) + thickness / 2;
    const w = maxX - minX, d = maxZ - minZ;

    const mat = this.wallMat.clone();
    const tex = mat.map.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(w, d) / 2.5, height / 2.5);
    mat.map = tex;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
    mesh.position.set((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    // Physics boxes must be in world space; root.position.y offsets visuals only.
    this.physics.addBox(
      new THREE.Vector3(minX, this._oy,          minZ),
      new THREE.Vector3(maxX, this._oy + height, maxZ),
    );
  }

  _buildCeiling() {
    const H = HUB_HALF;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), this.ceilMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, WORLD.wallHeight, 0);
    m.receiveShadow = true;
    this.root.add(m);
  }

  _buildLights() {
    // Bright cool-white fluorescent strip lights — normal office feel.
    const positions = [
      [-5, -5], [5, -5],
      [-5,  5], [5,  5],
      [ 0,  0],
    ];
    this._fixtures = [];
    for (const [x, z] of positions) {
      const light = new THREE.PointLight(
        0xf0f4ff,   // cool white
        9,          // brighter than backrooms level
        14,
        1.8,
      );
      light.position.set(x, WORLD.wallHeight - 0.1, z);
      this.root.add(light);

      // Ceiling fixture plate
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.04, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      plate.position.copy(light.position);
      plate.position.y = WORLD.wallHeight - 0.02;
      this.root.add(plate);

      // Very gentle flicker — office lights buzz slightly
      this._fixtures.push({
        light, plate,
        base: light.intensity,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _placeInteractables() {
    // Charger dock — west wall
    const dock = new ChargerDock({ x: -9.3, y: 0, z: 0 });
    this._addInteractive(dock);

    // Vending machine — NE corner
    this._addInteractive(new VendingMachine({ x: 8.5, y: 0, z: -8 }));

    // Info board — south wall, facing north into the room
    const board = new InfoBoard({ x: 0, y: 0, z: 9.7 });
    board.mesh.rotation.y = Math.PI;
    this._addInteractive(board);
  }

  _addInteractive(obj) {
    this.interactables.push(obj);
    if (obj.mesh) {
      obj.mesh.traverse?.((n) => {
        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
      });
      this.root.add(obj.mesh);
    }
  }

  update(dt, ctx) {
    for (const f of this._fixtures) {
      f.phase += dt * Math.PI * 2 * 0.8;  // slow office hum
      const flick = 1 - 0.015 * (0.5 + 0.5 * Math.sin(f.phase));
      f.light.intensity = f.base * flick;
    }
    for (const it of this.interactables) it.update?.(dt, ctx);
  }
}
