import * as THREE from 'three';
import { WORLD } from '../config.js';
import { seededRNG } from '../utils/rng.js';
import { bus, EVT } from '../core/EventBus.js';
import { FragmentPickup } from './objects/FragmentPickup.js';
import { SupplyCrate }    from './objects/SupplyCrate.js';
import { RiftPortal }     from './objects/RiftPortal.js';

// PLAN.md §3: Procedural node-based world.
// Each node is a room: { id, seed, type, stability, connections: {N,S,E,W} }
// Rooms are generated on demand as the player moves.
// Drift influences which types get generated (§5).
// Fragments only spawn in stable rooms (§7).

const NODE_W = 12;   // room width  (X)
const NODE_D = 12;   // room depth  (Z)
const NODE_H = 3.0;  // ceiling height
const DOOR_W = 3.2;  // doorway width
const DOOR_H = 2.7;  // doorway height
const LOAD_R = 2;    // load radius in nodes (render distance)

export class NodeWorld {
  constructor({ renderer, physics, seed = 0 }) {
    this.renderer  = renderer;
    this.physics   = physics;
    this._seed     = seed;
    this._nodes    = new Map();    // key `${nx},${nz}` → nodeData
    this._curNX    = 0;
    this._curNZ    = 0;
    this.interactables = [];
    this.entities      = [];
    this.isSafe        = false;

    this._floorY = WORLD.nodeFloorY;  // Y=-50, below Level0 (Y=10), no physics cross-snap

    this.root = new THREE.Group();
    this.root.visible = false;
    renderer.add(this.root);
  }

  get biomeName() {
    const cur = this._nodes.get(`${this._curNX},${this._curNZ}`);
    const names = { corridor: 'The Backrooms', urban: 'Urban Zone', ocean: 'The Abyss — Ocean',
                    void: 'The Void', hazard: 'Hazard Zone' };
    return cur ? (names[cur.type] ?? cur.type) : 'The Abyss';
  }

  get spawn() {
    return new THREE.Vector3(0, this._floorY, 0);
  }

  show() { this.root.visible = true; }
  hide() { this.root.visible = false; }

  enable() {
    this.root.visible = true;
    this._curNX = 0;
    this._curNZ = 0;
    // Pre-generate starting node + immediate neighbours
    this._ensureNode(0, 0, 0);
    for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      this._ensureNode(dx, dz, 0);
    }
  }

  // -------------------------------------------------------------------------

  update(dt, ctx) {
    if (!this.root.visible || !ctx.player) return;

    const px = ctx.player.position.x;
    const pz = ctx.player.position.z;
    const nx = Math.round(px / NODE_W);
    const nz = Math.round(pz / NODE_D);

    if (nx !== this._curNX || nz !== this._curNZ) {
      this._curNX = nx;
      this._curNZ = nz;

      const drift = ctx.state?.drift ?? 0;

      // Pre-generate load radius
      for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
        for (let dz = -LOAD_R; dz <= LOAD_R; dz++) {
          this._ensureNode(nx + dx, nz + dz, drift);
        }
      }

      // Visibility culling — show LOAD_R, hide beyond LOAD_R+1
      for (const [key, nd] of this._nodes) {
        const [kx, kz] = key.split(',').map(Number);
        nd.group.visible = (Math.abs(kx - nx) <= LOAD_R && Math.abs(kz - nz) <= LOAD_R);
      }

      // Notify main.js — fires applyRoomType in the handler
      const cur = this._nodes.get(`${nx},${nz}`);
      if (cur) bus.emit(EVT.ROOM_CHANGE, { type: cur.type, stability: cur.stability });
    }

    // Update entities
    for (const e of this.entities) e.update?.(dt);
  }

  // Return current node type (used by drift event system)
  getCurrentType() {
    return this._nodes.get(`${this._curNX},${this._curNZ}`)?.type ?? 'corridor';
  }

  // Force the next unvisited node to a given type (PLAN.md §11: portal)
  forceNextNodeType(type) {
    this._forcedType = type;
  }

  // Random world position within explored nodes (for teleport events)
  getRandomSpawnPos() {
    const keys = [...this._nodes.keys()];
    if (!keys.length) return this.spawn.clone();
    const key = keys[Math.floor(Math.random() * keys.length)];
    const [nx, nz] = key.split(',').map(Number);
    return new THREE.Vector3(nx * NODE_W, this._floorY, nz * NODE_D);
  }

  // -------------------------------------------------------------------------
  // Internal — node generation

  _ensureNode(nx, nz, drift = 0) {
    const key = `${nx},${nz}`;
    if (this._nodes.has(key)) return this._nodes.get(key);
    const nd = this._createNode(nx, nz, drift);
    this._nodes.set(key, nd);
    return nd;
  }

  _createNode(nx, nz, drift) {
    // Deterministic RNG per node position
    const rng = seededRNG(this._seed ^ ((nx * 73856093 + nz * 19349663 + 1) >>> 0));

    // PLAN.md §5: type depends on drift
    let type;
    if (nx === 0 && nz === 0) {
      type = 'corridor'; // start node is always safe
    } else if (this._forcedType) {
      type = this._forcedType;
      this._forcedType = null;
    } else {
      type = this._pickType(rng, drift);
    }

    // Node stability: decreases with drift
    const stability = Math.max(0.1, 1.0 - (drift / WORLD.driftMax ?? 100) * rng() * 0.9);

    // Connections — ensure at least 2 open to avoid dead ends
    const conns = { N: rng() > 0.3, S: rng() > 0.3, E: rng() > 0.3, W: rng() > 0.3 };
    if (Object.values(conns).filter(Boolean).length < 2) {
      conns.N = true; conns.E = true;
    }

    // Group positioned at node world-space centre (origin-near for shadow precision)
    const wx = nx * NODE_W;
    const wz = nz * NODE_D;
    const group = new THREE.Group();
    group.position.set(wx, this._floorY, wz);
    this.root.add(group);

    // Geometry
    this._buildGeometry(group, type, conns, rng, stability);

    // Physics
    this.physics.addFloorSegment(
      this._floorY,
      wx - NODE_W / 2, wx + NODE_W / 2,
      wz - NODE_D / 2, wz + NODE_D / 2,
    );
    this._addWallPhysics(wx, wz, conns);

    // Items / interactables
    this._spawnNodeItems(group, nx, nz, type, stability, rng, wx, wz);

    return { type, stability, conns, group };
  }

  // PLAN.md §5: drift drives type distribution
  _pickType(rng, drift) {
    if (drift < 30) {
      return rng() > 0.82 ? 'urban' : 'corridor';
    }
    if (drift < 60) {
      const r = rng();
      if (r < 0.45) return 'corridor';
      if (r < 0.65) return 'urban';
      if (r < 0.82) return 'hazard';
      return 'ocean';
    }
    // drift >= 60 — void and ocean allowed (PLAN.md §5)
    const r = rng();
    if (r < 0.18) return 'corridor';
    if (r < 0.38) return 'urban';
    if (r < 0.55) return 'ocean';
    if (r < 0.75) return 'void';
    return 'hazard';
  }

  // -------------------------------------------------------------------------
  // Geometry builders

  _buildGeometry(group, type, conns, rng, stability) {
    const PAL = {
      corridor: { fl: 0xcfb97e, wl: 0xbfae72, cl: 0xbcbc8a, li: 0xffeedd, lInt: 9  },
      urban:    { fl: 0x1c1c1c, wl: 0x222222, cl: 0x181818, li: 0xff9944, lInt: 7  },
      ocean:    { fl: 0x0a1820, wl: 0x0d2232, cl: 0x081420, li: 0x2288ff, lInt: 5 },
      void:     { fl: 0x050508, wl: 0x030305, cl: 0x020205, li: 0x8822ee, lInt: 3 },
      hazard:   { fl: 0x1e0000, wl: 0x1a0000, cl: 0x150000, li: 0xff2200, lInt: 10  },
    };
    const p   = PAL[type] ?? PAL.corridor;
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 });
    const h   = NODE_H, w = NODE_W, d = NODE_D;

    // Floor slab
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat(p.fl));
    fl.position.set(0, -0.1, 0);   // top face at y=0 (local) = floorY (world)
    fl.receiveShadow = true;
    group.add(fl);

    // Ceiling slab
    const cl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat(p.cl));
    cl.position.set(0, h + 0.1, 0);
    group.add(cl);

    // Walls
    this._buildWallGeometry(group, mat(p.wl), conns, w, d, h);

    // Point light
    const li = new THREE.PointLight(p.li, p.lInt * (0.5 + stability * 0.5), w * 1.7, 2);
    li.position.set(0, h - 0.4, 0);
    group.add(li);

    // Corridor ceiling strip (fluorescent look)
    if (type === 'corridor') {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.05, w * 0.65),
        new THREE.MeshBasicMaterial({ color: 0xffffc8 }),
      );
      strip.position.set(0, h - 0.02, 0);
      group.add(strip);
    }

    // Urban: window panel on one wall
    if (type === 'urban' && rng() > 0.4) {
      const wnd = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.0, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.65 }),
      );
      wnd.position.set((rng() - 0.5) * (w * 0.4), 1.8, -d / 2 + 0.08);
      group.add(wnd);
    }

    // Void: floating debris
    if (type === 'void') {
      const dMat = new THREE.MeshStandardMaterial({ color: 0x220033 });
      for (let i = 0; i < 4; i++) {
        const db = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dMat);
        db.position.set(
          (rng() - 0.5) * (w - 1),
          0.5 + rng() * (h - 1),
          (rng() - 0.5) * (d - 1),
        );
        group.add(db);
      }
    }
  }

  _buildWallGeometry(group, mat, conns, w, d, h) {
    const dw = DOOR_W, dh = DOOR_H, t = 0.3;
    const hw = w / 2, hd = d / 2;

    const seg = (gw, gh, gd, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };

    const side = (open, isZ, sign) => {
      const px = isZ ? 0      : sign * hw;
      const pz = isZ ? sign * hd : 0;
      const full_a = isZ ? w : d;
      const full_b = isZ ? d : w;  // unused but kept for reference

      if (!open) {
        seg(isZ ? w : t, h, isZ ? t : d, px, h / 2, pz);
      } else {
        const side_w = (full_a - dw) / 2;
        const ox = isZ ? (dw / 2 + side_w / 2) : 0;
        const oz = isZ ? 0 : (dw / 2 + side_w / 2);
        seg(isZ ? side_w : t, h, isZ ? t : side_w, px + (isZ ? -ox : 0), h / 2, pz + (isZ ? 0 : -oz));
        seg(isZ ? side_w : t, h, isZ ? t : side_w, px + (isZ ?  ox : 0), h / 2, pz + (isZ ? 0 :  oz));
        if (h > dh) seg(isZ ? dw : t, h - dh, isZ ? t : dw, px, dh + (h - dh) / 2, pz);
      }
    };

    side(conns.N, true,  -1); // North wall  z = -hd
    side(conns.S, true,   1); // South wall  z = +hd
    side(conns.E, false,  1); // East wall   x = +hw
    side(conns.W, false, -1); // West wall   x = -hw
  }

  _addWallPhysics(wx, wz, conns) {
    const fy = this._floorY;
    const h  = NODE_H, hw = NODE_W / 2, hd = NODE_D / 2;
    const dw = DOOR_W / 2, dh = DOOR_H, t = 0.15;

    const box = (x0, z0, x1, z1) => {
      this.physics.addBox(
        new THREE.Vector3(wx + x0, fy,     wz + z0),
        new THREE.Vector3(wx + x1, fy + h, wz + z1),
      );
    };
    const topBox = (x0, z0, x1, z1) => {
      this.physics.addBox(
        new THREE.Vector3(wx + x0, fy + dh,     wz + z0),
        new THREE.Vector3(wx + x1, fy + h, wz + z1),
      );
    };

    // North (z = -hd)
    if (!conns.N) { box(-hw, -hd - t, hw, -hd + t); }
    else {
      box(-hw, -hd - t, -dw, -hd + t);
      box( dw, -hd - t,  hw, -hd + t);
      topBox(-dw, -hd - t, dw, -hd + t);
    }
    // South (z = +hd)
    if (!conns.S) { box(-hw, hd - t, hw, hd + t); }
    else {
      box(-hw, hd - t, -dw, hd + t);
      box( dw, hd - t,  hw, hd + t);
      topBox(-dw, hd - t, dw, hd + t);
    }
    // East (x = +hw)
    if (!conns.E) { box(hw - t, -hd, hw + t, hd); }
    else {
      box(hw - t, -hd, hw + t, -dw);
      box(hw - t,  dw, hw + t,  hd);
      topBox(hw - t, -dw, hw + t, dw);
    }
    // West (x = -hw)
    if (!conns.W) { box(-hw - t, -hd, -hw + t, hd); }
    else {
      box(-hw - t, -hd, -hw + t, -dw);
      box(-hw - t,  dw, -hw + t,  hd);
      topBox(-hw - t, -dw, -hw + t, dw);
    }
  }

  // -------------------------------------------------------------------------
  // Item spawning — PLAN.md §7: fragments only where stability > 0.7

  _spawnNodeItems(group, nx, nz, type, stability, rng, wx, wz) {
    const fy  = this._floorY;
    const off = () => (rng() - 0.5) * (NODE_W - 2.5);

    // Reality Fragments — only in stable rooms
    if (stability > 0.7 && rng() > 0.6) {
      const frag = new FragmentPickup({ x: wx + off(), y: fy + 0.01, z: wz + off() });
      frag.addToScene(group);
      this.interactables.push(frag);
      this.entities.push(frag);
    }

    // Supply crates in corridor / urban
    if ((type === 'corridor' || type === 'urban') && rng() > 0.55) {
      const crate = new SupplyCrate({ x: wx + off(), y: fy, z: wz + off() });
      if (crate.mesh) group.add(crate.mesh);
      this.interactables.push(crate);
      this.entities.push(crate);
    }

    // Rift portals occasionally in urban rooms (change next node type)
    if (type === 'urban' && rng() > 0.8) {
      const types = ['ocean', 'void', 'corridor'];
      const pType = types[Math.floor(rng() * types.length)];
      const portal = new RiftPortal({ x: wx + off(), y: fy, z: wz + off() }, pType);
      portal.activate();
      portal.addToScene(group);
      this.interactables.push(portal);
      this.entities.push(portal);
    }
  }
}
