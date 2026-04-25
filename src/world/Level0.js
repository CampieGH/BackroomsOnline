import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, LIGHT, BIOMES } from '../config.js';
import { makeWallTexture, makeFloorTexture, makeCeilingTexture } from '../utils/textures.js';
import { seededRNG } from '../utils/rng.js';
import { SupplyCrate }  from './objects/SupplyCrate.js';
import { Elevator }     from './objects/Elevator.js';
import { SCORE_ITEM_IDS } from '../items/ItemRegistry.js';

const CHUNK_CELLS = 4;
const CELL_SIZE   = 8;
const CHUNK_SIZE  = CHUNK_CELLS * CELL_SIZE;
const LOAD_R      = 1;
const UNLOAD_R    = LOAD_R + 1;
const WALL_H      = WORLD.wallHeight;
const WALL_T      = 0.72;
const DEBUG_STRUCTS = false;

// Loot pool: utility items mixed with score items
const LOOT_POOL = ['almond_water', 'overcharged_battery', ...SCORE_ITEM_IDS];

export class Level0 {
  constructor({ renderer, physics, seed, biome = 'backrooms', wallTint = null, elevDist = null }) {
    this.renderer = renderer;
    this.physics  = physics;
    this._seed    = seed;
    this._biome   = BIOMES[biome] ?? BIOMES.backrooms;

    this.root = new THREE.Group();
    this.interactables = [];
    this.entities      = [];
    this.isSafe        = false;

    this._chunkMeta = new Map();
    this._curCX = null;
    this._curCZ = null;
    this._elapsed = 0;
    this._disposed = false;

    // 3 elevators placed at ~120° intervals; distance controlled by levelData
    const rng0 = seededRNG(seed ^ 0xdeadbeef);
    const baseAngle = rng0() * Math.PI * 2;
    const _elevDist = elevDist ?? 1;
    this._elevPositions = [0, 1, 2].map(i => {
      const a  = baseAngle + (i * Math.PI * 2) / 3 + (rng0() - 0.5) * 0.4;
      rng0();  // consume slot — keep RNG sequence stable
      const cx = Math.round(Math.cos(a) * _elevDist);
      const cz = Math.round(Math.sin(a) * _elevDist);
      return { cx: cx === 0 && cz === 0 ? 1 : cx, cz, built: false };
    });
    this._elevators = [];

    const fr = this._biome.floorRGB;
    const cr = this._biome.ceilRGB;
    this._wallMat = new THREE.MeshStandardMaterial({
      map: makeWallTexture(), roughness: 0.95, metalness: 0,
      color: wallTint ?? this._biome.wallC0,
    });
    this._floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 1, metalness: 0 });
    this._floorMat.color.setRGB(fr[0], fr[1], fr[2]);
    this._ceilMat = new THREE.MeshStandardMaterial({ map: makeCeilingTexture(), roughness: 1, metalness: 0 });
    this._ceilMat.color.setRGB(cr[0], cr[1], cr[2]);
    this._lightPlateMat = new THREE.MeshBasicMaterial({ color: this._biome.lightColor });

    renderer.add(this.root);
    this._loadAround(0, 0);
    // Pre-load elevator chunks so elevators exist from the start
    for (const ep of this._elevPositions) this._loadChunk(ep.cx, ep.cz);
  }

  get biomeName() { return this._biome.name; }

  get spawn() {
    return new THREE.Vector3(CELL_SIZE / 2, WORLD.level0FloorY, CELL_SIZE / 2);
  }

  getRandomSpawnPos() {
    const cx = (this._curCX ?? 0) + (Math.floor(Math.random() * 3) - 1);
    const cz = (this._curCZ ?? 0) + (Math.floor(Math.random() * 3) - 1);
    return new THREE.Vector3(
      cx * CHUNK_SIZE + CELL_SIZE / 2,
      WORLD.level0FloorY,
      cz * CHUNK_SIZE + CELL_SIZE / 2,
    );
  }

  // Dispose all chunks and remove root from scene.
  disposeAll() {
    for (const [key, meta] of this._chunkMeta) {
      if (meta.group) this._unloadChunk(key, meta);
    }
    this._chunkMeta.clear();
    // Elevators cleanup
    for (const elev of this._elevators) {
      elev.dispose();
      this.root.remove(elev._group);
    }
    this._elevators = [];
    this._disposed = true;
    this.renderer.remove(this.root);
  }

  update(dt, ctx) {
    if (this._disposed) return;
    this._elapsed += dt;

    for (const meta of this._chunkMeta.values()) {
      if (!meta.group) continue;
      for (const f of meta.fixtures) {
        f.phase += dt * Math.PI * 2 * LIGHT.flickerHz;
        f.light.intensity = f.base * Math.max(0,
          1 - LIGHT.flickerIntensity * (0.5 + 0.5 * Math.sin(f.phase)),
        );
      }
    }

    for (const e of this.entities) e.update?.(dt, ctx);

    // Elevators animation
    for (const elev of this._elevators) elev.update(dt);

    // Second disposed check — LEVEL_UP may have fired synchronously above
    if (this._disposed) return;
    if (!ctx?.player) return;
    const cx = Math.floor(ctx.player.position.x / CHUNK_SIZE);
    const cz = Math.floor(ctx.player.position.z / CHUNK_SIZE);
    if (cx !== this._curCX || cz !== this._curCZ) {
      this._curCX = cx;
      this._curCZ = cz;
      this._loadAround(cx, cz);
    }
  }

  _loadAround(cx, cz) {
    for (let dx = -LOAD_R; dx <= LOAD_R; dx++)
      for (let dz = -LOAD_R; dz <= LOAD_R; dz++)
        this._loadChunk(cx + dx, cz + dz);

    for (const [key, meta] of this._chunkMeta) {
      if (!meta.group) continue;
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > UNLOAD_R || Math.abs(kz - cz) > UNLOAD_R)
        this._unloadChunk(key, meta);
    }
  }

  _loadChunk(cx, cz) {
    const key  = `${cx},${cz}`;
    const meta = this._chunkMeta.get(key);
    if (meta?.group) return;

    const rng   = seededRNG(this._seed ^ ((cx * 73856093 + cz * 19349663 + 1) >>> 0));
    const maze  = this._genMaze(rng, cx, cz);

    // Clear center 2×2 cells so the elevator isn't buried inside a wall
    if (this._elevPositions.some(ep => ep.cx === cx && ep.cz === cz)) {
      const mid = Math.floor(CHUNK_CELLS / 2); // = 2
      for (let y = mid - 1; y <= mid; y++) {
        for (let x = mid - 1; x <= mid; x++) {
          if (x + 1 <= mid) { maze[y][x].E = false; maze[y][x + 1].W = false; }
          if (y + 1 <= mid) { maze[y][x].S = false; maze[y + 1][x].N = false; }
        }
      }
    }
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, WORLD.level0FloorY, cz * CHUNK_SIZE);
    this.root.add(group);

    const physBoxes = [];
    let   physFloor = null;
    const fixtures  = [];

    this._buildGeometry(group, maze, cx, cz, rng, physBoxes, fixtures, (f) => physFloor = f);

    if (meta) {
      meta.group     = group;
      meta.physBoxes = physBoxes;
      meta.physFloor = physFloor;
      meta.fixtures  = fixtures;
    } else {
      this._chunkMeta.set(key, {
        group, physBoxes, physFloor, fixtures, itemsBuilt: true, entities: [],
      });
      this._buildItems(cx, cz, rng, key, maze._debug);
    }
  }

  _unloadChunk(key, meta) {
    meta.group.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      } else if (obj.isLine || obj.isSprite) {
        obj.geometry?.dispose();
        obj.material?.map?.dispose();
        obj.material?.dispose();
      }
    });
    this.root.remove(meta.group);
    meta.group = null;

    for (const ref of meta.physBoxes) this.physics.removeBox(ref);
    if (meta.physFloor) this.physics.removeFloorSegment(meta.physFloor);
    meta.physBoxes = [];
    meta.physFloor = null;
    meta.fixtures  = [];

    if (meta.entities.length) {
      const dead = new Set(meta.entities);
      for (const e of dead) {
        if (e.mesh)   this.root.remove(e.mesh);
        if (e._group) this.root.remove(e._group);
        e.dispose?.();
      }
      this.interactables = this.interactables.filter(x => !dead.has(x));
      this.entities      = this.entities.filter(x => !dead.has(x));
      meta.entities = [];
    }
  }

  _genMaze(rng, cx, cz) {
    const G = CHUNK_CELLS;
    const cells = Array.from({ length: G }, () =>
      Array.from({ length: G }, () =>
        ({ N: true, S: true, E: true, W: true, visited: false }),
      ),
    );
    const stack = [{ x: 0, y: 0 }];
    cells[0][0].visited = true;
    while (stack.length) {
      const { x, y } = stack[stack.length - 1];
      const nb = [];
      if (y > 0   && !cells[y-1][x].visited) nb.push({ x,   y: y-1, dir: 'N' });
      if (y < G-1 && !cells[y+1][x].visited) nb.push({ x,   y: y+1, dir: 'S' });
      if (x < G-1 && !cells[y][x+1].visited) nb.push({ x: x+1, y,   dir: 'E' });
      if (x > 0   && !cells[y][x-1].visited) nb.push({ x: x-1, y,   dir: 'W' });
      if (!nb.length) { stack.pop(); continue; }
      const pick = nb[Math.floor(rng() * nb.length)];
      const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[pick.dir];
      cells[y][x][pick.dir]       = false;
      cells[pick.y][pick.x][back] = false;
      cells[pick.y][pick.x].visited = true;
      stack.push({ x: pick.x, y: pick.y });
    }
    for (let i = 0; i < G; i++) {
      const x = Math.floor(rng() * (G - 1));
      const y = Math.floor(rng() * G);
      cells[y][x].E = false;
      if (x + 1 < G) cells[y][x + 1].W = false;
    }
    const mid = Math.floor(G / 2);
    cells[0][mid].N   = false;
    cells[G-1][mid].S = false;
    cells[mid][0].W   = false;
    cells[mid][G-1].E = false;

    if (rng() < 0.06) cells._debug = this._applyStructure(cells, rng, G);

    return cells;
  }

  _applyStructure(cells, rng, G) {
    return this._structPlaza(cells, rng, G);
  }

  _structPlaza(cells, rng, G) {
    const w    = 3 + Math.floor(rng() * 2);
    const h    = 3 + Math.floor(rng() * 2);
    const maxW = Math.min(w, G), maxH = Math.min(h, G);
    const ax   = Math.floor(rng() * (G - maxW + 1));
    const ay   = Math.floor(rng() * (G - maxH + 1));
    for (let y = ay; y < ay + maxH; y++) {
      for (let x = ax; x < ax + maxW; x++) {
        if (y + 1 < ay + maxH) { cells[y][x].S = false; cells[y+1][x].N = false; }
        if (x + 1 < ax + maxW) { cells[y][x].E = false; cells[y][x+1].W = false; }
      }
    }
    return { name: 'ПЛОЩАДЬ', color: 0x00ff88, ax, ay, w: maxW, h: maxH };
  }

  _buildGeometry(group, maze, cx, cz, rng, physBoxes, fixtures, onFloor) {
    const G = CHUNK_CELLS, S = CELL_SIZE, H = WALL_H;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(G * S, G * S), this._floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(G * S / 2, 0, G * S / 2);
    floor.receiveShadow = true;
    group.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(G * S, G * S), this._ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(G * S / 2, H, G * S / 2);
    group.add(ceil);

    onFloor(this.physics.addFloorSegment(
      WORLD.level0FloorY, wx0, wx0 + G * S, wz0, wz0 + G * S,
    ));

    const wallGeos = [];
    for (let cy = 0; cy < G; cy++) {
      for (let ccx = 0; ccx < G; ccx++) {
        const c  = maze[cy][ccx];
        const x0 = ccx * S, x1 = (ccx + 1) * S;
        const z0 = cy  * S, z1 = (cy  + 1) * S;
        if (c.N) wallGeos.push(this._wallGeo(wx0, wz0, x0, z0, x1, z0, physBoxes));
        if (c.W) wallGeos.push(this._wallGeo(wx0, wz0, x0, z0, x0, z1, physBoxes));
      }
    }
    if (wallGeos.length) {
      const merged = mergeGeometries(wallGeos);
      const wallMesh = new THREE.Mesh(merged, this._wallMat);
      wallMesh.castShadow    = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);
      for (const g of wallGeos) g.dispose();
    }

    const lightSlots = [
      { lx: S * 1.5, lz: S * 1.5 },
      { lx: S * 2.5, lz: S * 2.5 },
    ];

    const platePosns = [];
    for (let cy = 0; cy < G; cy++) {
      for (let ccx = 0; ccx < G; ccx++) {
        if ((cx * G + ccx + cz * G + cy) % 2 !== 0) continue;
        if (rng() < 0.25) continue;
        platePosns.push({ lx: ccx * S + S / 2, lz: cy * S + S / 2 });
      }
    }

    if (platePosns.length) {
      const plateGeo = new THREE.BoxGeometry(0.7, 0.04, 0.3);
      const iMesh    = new THREE.InstancedMesh(plateGeo, this._lightPlateMat, platePosns.length);
      iMesh.castShadow = false;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < platePosns.length; i++) {
        dummy.position.set(platePosns[i].lx, H - 0.03, platePosns[i].lz);
        dummy.updateMatrix();
        iMesh.setMatrixAt(i, dummy.matrix);
      }
      iMesh.instanceMatrix.needsUpdate = true;
      group.add(iMesh);
    }

    for (let i = 0; i < lightSlots.length; i++) {
      const { lx, lz } = lightSlots[i];
      const base  = LIGHT.fixtureIntensity * 0.75;
      const light = new THREE.PointLight(this._biome.lightColor, base, LIGHT.fixtureDistance * 0.85, 2);
      light.castShadow = false;
      light.position.set(lx, H - 0.1, lz);
      group.add(light);
      fixtures.push({
        light, base,
        phase: ((cx * 7 + i * 31 + cz * 11) & 0xffff) / 0xffff * Math.PI * 2,
      });
    }

    if (DEBUG_STRUCTS && maze._debug) this._addStructDebug(group, maze._debug, S);
  }

  _addStructDebug(group, { name, color, ax, ay, w, h }, S) {
    const H  = WALL_H;
    const x0 = ax * S, x1 = (ax + w) * S;
    const z0 = ay * S, z1 = (ay + h) * S;
    const yfl = 0.12;
    const pts = [
      new THREE.Vector3(x0, yfl, z0), new THREE.Vector3(x1, yfl, z0),
      new THREE.Vector3(x1, yfl, z1), new THREE.Vector3(x0, yfl, z1),
      new THREE.Vector3(x0, yfl, z0),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false });
    group.add(new THREE.Line(lineGeo, lineMat));

    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 48;
    const ctx     = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 256, 48);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, 6, 48);
    ctx.font      = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(name, 131, 24);
    const tex    = new THREE.CanvasTexture(canvas);
    const spMat  = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(spMat);
    sprite.scale.set(5.5, 1.04, 1);
    sprite.position.set((x0 + x1) / 2, H * 0.55, (z0 + z1) / 2);
    group.add(sprite);
  }

  _wallGeo(wx0, wz0, lx1, lz1, lx2, lz2, physBoxes) {
    const H = WALL_H, T = WALL_T;
    const minX = Math.min(lx1, lx2) - T / 2, maxX = Math.max(lx1, lx2) + T / 2;
    const minZ = Math.min(lz1, lz2) - T / 2, maxZ = Math.max(lz1, lz2) + T / 2;
    physBoxes.push(this.physics.addBox(
      new THREE.Vector3(wx0 + minX, WORLD.level0FloorY,     wz0 + minZ),
      new THREE.Vector3(wx0 + maxX, WORLD.level0FloorY + H, wz0 + maxZ),
    ));
    const geo = new THREE.BoxGeometry(maxX - minX, H, maxZ - minZ);
    geo.translate((minX + maxX) / 2, H / 2, (minZ + maxZ) / 2);
    return geo;
  }

  _buildItems(cx, cz, rng, key, structDebug) {
    const meta = this._chunkMeta.get(key);
    const S  = CELL_SIZE, G = CHUNK_CELLS;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    const fy  = WORLD.level0FloorY;

    const rand = (min, max) => min + Math.floor(rng() * (max - min + 1));
    const cellPos = () => ({
      x: wx0 + rand(1, G - 2) * S + S / 2,
      z: wz0 + rand(1, G - 2) * S + S / 2,
    });

    // Elevators — one per designated chunk
    for (const ep of this._elevPositions) {
      if (cx === ep.cx && cz === ep.cz && !ep.built) {
        ep.built = true;
        const ex   = wx0 + CHUNK_SIZE / 2;
        const ez   = wz0 + CHUNK_SIZE / 2;
        const elev = new Elevator({ x: ex, y: fy, z: ez });
        this._elevators.push(elev);
        this.root.add(elev._group);
      }
    }

    // Plaza always gets 2 supply crates (guaranteed reward)
    if (structDebug) {
      for (let i = 0; i < 2; i++) {
        const { x, z } = cellPos();
        const crate = new SupplyCrate({ x, y: fy, z }, LOOT_POOL);
        if (crate.mesh) this.root.add(crate.mesh);
        this.interactables.push(crate);
        this.entities.push(crate);
        meta.entities.push(crate);
      }
      return; // no random crate on top of plaza crates
    }

    // Random crate in normal chunks (~15% chance)
    if (rng() < 0.15) {
      const { x, z } = cellPos();
      const crate = new SupplyCrate({ x, y: fy, z }, LOOT_POOL);
      if (crate.mesh) this.root.add(crate.mesh);
      this.interactables.push(crate);
      this.entities.push(crate);
      meta.entities.push(crate);
    }

  }
}
