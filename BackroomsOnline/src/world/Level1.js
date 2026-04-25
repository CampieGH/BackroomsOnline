import * as THREE from 'three';
import { WORLD, LIGHT } from '../config.js';
import { ExitPortal } from './objects/ExitPortal.js';
import { makeWallTexture, makeFloorTexture, makeCeilingTexture } from '../utils/textures.js';
import { Smiler } from '../entities/Smiler.js';

// Level 1 — procedurally generated yellow-room maze.
// Generated with a recursive-backtracker DFS over a grid of cells.
// Each cell is `cell` metres square; walls between cells become physics boxes.
// One entity (Smiler) spawns in a far cell. The exit portal back to the hub
// sits in the corner cell furthest from the player spawn.

const GRID = 8;          // 8x8 cells
const CELL = 4.0;        // 4m per cell → 32m × 32m maze

export class Level1 {
  constructor({ renderer, physics }) {
    this.renderer = renderer;
    this.physics = physics;
    this.root = new THREE.Group();
    this.interactables = [];
    this.entities = [];
    this._fixtures = [];
    this.isSafe = false;     // sanity drains here

    this._buildMaterials();
    const grid = this._generateMaze();
    this._buildFloorCeiling();
    this._buildWalls(grid);
    this._buildLights();
    this._placeSpawnAndExit();
    this._placeEntities();

    renderer.add(this.root);
  }

  _buildMaterials() {
    this.wallTex  = makeWallTexture();
    this.floorTex = makeFloorTexture();
    this.ceilTex  = makeCeilingTexture();
    this.wallMat = new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.95, metalness: 0 });
    this.floorMat = new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 1, metalness: 0 });
    this.ceilMat = new THREE.MeshStandardMaterial({ map: this.ceilTex, roughness: 1, metalness: 0 });
  }

  // Returns a GRID×GRID array of {N,S,E,W} bool walls (true = wall present).
  _generateMaze() {
    const cells = [];
    for (let y = 0; y < GRID; y++) {
      const row = [];
      for (let x = 0; x < GRID; x++) {
        row.push({ N: true, S: true, E: true, W: true, visited: false });
      }
      cells.push(row);
    }
    // Iterative DFS
    const stack = [{ x: 0, y: 0 }];
    cells[0][0].visited = true;
    while (stack.length) {
      const { x, y } = stack[stack.length - 1];
      const neighbours = [];
      if (y > 0        && !cells[y - 1][x].visited) neighbours.push({ x, y: y - 1, dir: 'N' });
      if (y < GRID - 1 && !cells[y + 1][x].visited) neighbours.push({ x, y: y + 1, dir: 'S' });
      if (x < GRID - 1 && !cells[y][x + 1].visited) neighbours.push({ x: x + 1, y, dir: 'E' });
      if (x > 0        && !cells[y][x - 1].visited) neighbours.push({ x: x - 1, y, dir: 'W' });
      if (neighbours.length === 0) { stack.pop(); continue; }
      const n = neighbours[Math.floor(Math.random() * neighbours.length)];
      // Carve wall between current and chosen neighbour
      cells[y][x][n.dir] = false;
      const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[n.dir];
      cells[n.y][n.x][back] = false;
      cells[n.y][n.x].visited = true;
      stack.push({ x: n.x, y: n.y });
    }
    // Sprinkle a few extra openings to make loops (less mazey, more roomy).
    for (let i = 0; i < GRID; i++) {
      const x = Math.floor(Math.random() * (GRID - 1));
      const y = Math.floor(Math.random() * GRID);
      cells[y][x].E = false;
      cells[y][x + 1].W = false;
    }
    return cells;
  }

  _buildFloorCeiling() {
    const sizeX = GRID * CELL;
    const sizeZ = GRID * CELL;
    this.floorTex.repeat.set(sizeX / 2, sizeZ / 2);
    this.ceilTex.repeat.set(sizeX / 1.5, sizeZ / 1.5);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(sizeX / 2, 0, sizeZ / 2);
    floor.receiveShadow = true;
    this.root.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), this.ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(sizeX / 2, WORLD.wallHeight, sizeZ / 2);
    ceiling.receiveShadow = true;
    this.root.add(ceiling);
  }

  _buildWalls(grid) {
    const H = WORLD.wallHeight;
    const T = 0.18;
    // For each cell, draw its N and W walls if present, plus S/E walls only on the boundary.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = grid[y][x];
        const x0 = x * CELL, z0 = y * CELL;
        const x1 = x0 + CELL, z1 = z0 + CELL;
        if (c.N) this._addWall(x0, z0, x1, z0, H, T);
        if (c.W) this._addWall(x0, z0, x0, z1, H, T);
        if (y === GRID - 1 && c.S) this._addWall(x0, z1, x1, z1, H, T);
        if (x === GRID - 1 && c.E) this._addWall(x1, z0, x1, z1, H, T);
      }
    }
  }

  _addWall(x1, z1, x2, z2, height, thickness) {
    const minX = Math.min(x1, x2) - thickness / 2;
    const maxX = Math.max(x1, x2) + thickness / 2;
    const minZ = Math.min(z1, z2) - thickness / 2;
    const maxZ = Math.max(z1, z2) + thickness / 2;
    const w = maxX - minX, d = maxZ - minZ;

    const mat = this.wallMat.clone();
    const tex = this.wallTex.clone();
    tex.needsUpdate = true;
    const wallLen = Math.max(w, d);
    tex.repeat.set(wallLen / 2.0, height / 3.0);
    mat.map = tex;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
    mesh.position.set((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.physics.addBox(
      new THREE.Vector3(minX, 0, minZ),
      new THREE.Vector3(maxX, height, maxZ),
    );
  }

  _buildLights() {
    // Sparse, dim ceiling lights — every other cell. Some cells get nothing
    // (deliberate dark spots for tension / flashlight to matter).
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if ((x + y) % 2 !== 0) continue;
        if (Math.random() < 0.35) continue; // skip ~35% to leave dark cells
        const cx = x * CELL + CELL / 2;
        const cz = y * CELL + CELL / 2;
        const light = new THREE.PointLight(
          LIGHT.fixtureColor,
          LIGHT.fixtureIntensity * 0.6,   // dimmer than hub
          LIGHT.fixtureDistance * 0.7,
          2.0,
        );
        light.position.set(cx, WORLD.wallHeight - 0.1, cz);
        this.root.add(light);

        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.05, 0.3),
          new THREE.MeshBasicMaterial({ color: 0xfff5d0 }),
        );
        plate.position.set(cx, WORLD.wallHeight - 0.03, cz);
        this.root.add(plate);

        this._fixtures.push({
          light, plate,
          base: light.intensity,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  _placeSpawnAndExit() {
    // Spawn at cell (0,0). Exit portal at far corner cell (GRID-1, GRID-1).
    this.spawn = new THREE.Vector3(CELL / 2, 0, CELL / 2);

    const ex = (GRID - 1) * CELL + CELL / 2;
    const ez = (GRID - 1) * CELL + CELL / 2;
    const portal = new ExitPortal({ x: ex, y: 0, z: ez - 1.2 }, 'Return to Hub', 'hub', 0x9bff9b);
    this._addInteractive(portal);
  }

  _placeEntities() {
    // One Smiler somewhere in the middle/far portion of the maze.
    const sx = (Math.floor(GRID * 0.5) + 1) * CELL + CELL / 2;
    const sz = (Math.floor(GRID * 0.5) + 1) * CELL + CELL / 2;
    this.entities.push(new Smiler({ x: sx, y: 0, z: sz }, this));
    for (const e of this.entities) {
      if (e.root) this.root.add(e.root);
    }
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
      f.phase += dt * Math.PI * 2 * LIGHT.flickerHz;
      const flick = 1 - LIGHT.flickerIntensity * (0.5 + 0.5 * Math.sin(f.phase));
      f.light.intensity = f.base * flick;
    }
    for (const it of this.interactables) it.update?.(dt, ctx);
    for (const e of this.entities) e.update?.(dt, ctx);
  }
}
