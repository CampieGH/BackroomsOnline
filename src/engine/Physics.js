// Very simple axis-aligned collision physics.
// Walls are AABB boxes. Floors are declared as flat XZ segments at a given Y,
// which lets us have holes (tape zone → Level 0 below) and multiple floor
// levels (hub at Y=0, Level 0 at Y=-fallDepth) in the same scene.

import * as THREE from 'three';
import { PLAYER } from '../config.js';

export class Physics {
  constructor() {
    // Wall / solid colliders: { min: Vec3, max: Vec3 }
    this.colliders = [];
    // Floor segments: { y, minX, maxX, minZ, maxZ }
    // Player lands on the highest segment whose XZ range contains them.
    this.floorSegments = [];
  }

  addBox(min, max) {
    const c = {
      min: min.clone ? min.clone() : new THREE.Vector3(min.x, min.y, min.z),
      max: max.clone ? max.clone() : new THREE.Vector3(max.x, max.y, max.z),
    };
    this.colliders.push(c);
    return c; // return ref so callers can removeBox() later
  }

  removeBox(ref) {
    const i = this.colliders.indexOf(ref);
    if (i !== -1) this.colliders.splice(i, 1);
  }

  // Register a flat floor rectangle.
  // y        — height of the floor surface
  // minX/maxX/minZ/maxZ — world-space XZ bounds
  addFloorSegment(y, minX, maxX, minZ, maxZ) {
    const seg = { y, minX, maxX, minZ, maxZ };
    this.floorSegments.push(seg);
    return seg;
  }

  removeFloorSegment(seg) {
    const i = this.floorSegments.indexOf(seg);
    if (i !== -1) this.floorSegments.splice(i, 1);
  }

  clear() {
    this.colliders.length = 0;
    this.floorSegments.length = 0;
  }

  // Returns { pos, onGround }.
  moveAndSlide(pos, velocity, dt) {
    const r = PLAYER.radius;
    const h = PLAYER.height;

    let newPos = pos.clone();
    let onGround = false;

    // Y axis FIRST: apply gravity/jump before XZ collision checks.
    // This way a jump that clears an obstacle is reflected in newPos.y
    // before the XZ blocker test runs — player can hop over low walls.
    newPos.y += velocity.y * dt;

    // Find the highest floor segment that:
    //  1. Contains the player XZ position (still the old XZ — that's fine).
    //  2. Player is at or below the segment surface (falling down to it).
    //  3. Player hasn't "tunnelled" more than 4 m below it.
    let groundY = null;
    for (const s of this.floorSegments) {
      if (
        newPos.x >= s.minX && newPos.x <= s.maxX &&
        newPos.z >= s.minZ && newPos.z <= s.maxZ &&
        newPos.y <= s.y &&
        newPos.y >= s.y - 4
      ) {
        if (groundY === null || s.y > groundY) groundY = s.y;
      }
    }

    if (groundY !== null) {
      newPos.y = groundY;
      velocity.y = 0;
      onGround = true;
    }

    // X axis — uses the already-updated Y so a mid-jump height is reflected.
    newPos.x += velocity.x * dt;
    if (this._collidesXZ(newPos, r, h)) {
      newPos.x = pos.x;
      velocity.x = 0;
    }

    // Z axis
    newPos.z += velocity.z * dt;
    if (this._collidesXZ(newPos, r, h)) {
      newPos.z = pos.z;
      velocity.z = 0;
    }

    return { pos: newPos, velocity, onGround };
  }

  _collidesXZ(pos, r, h) {
    const pMinX = pos.x - r, pMaxX = pos.x + r;
    const pMinY = pos.y,     pMaxY = pos.y + h;
    const pMinZ = pos.z - r, pMaxZ = pos.z + r;
    for (const c of this.colliders) {
      if (pMaxX <= c.min.x || pMinX >= c.max.x) continue;
      if (pMaxY <= c.min.y || pMinY >= c.max.y) continue;
      if (pMaxZ <= c.min.z || pMinZ >= c.max.z) continue;
      return true;
    }
    return false;
  }

  raycastInteractables(origin, direction, maxDistance, interactables) {
    let nearest = null;
    for (const it of interactables) {
      if (!it.aabb) continue;
      const hit = rayAABB(origin, direction, it.aabb.min, it.aabb.max, maxDistance);
      if (hit !== null && (!nearest || hit < nearest.distance)) {
        nearest = { target: it, distance: hit };
      }
    }
    return nearest;
  }
}

function rayAABB(o, d, min, max, maxDist) {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    const od = d[ax];
    if (Math.abs(od) < 1e-8) {
      if (o[ax] < min[ax] || o[ax] > max[ax]) return null;
    } else {
      let t1 = (min[ax] - o[ax]) / od;
      let t2 = (max[ax] - o[ax]) / od;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmin < 0) tmin = tmax;
  if (tmin < 0 || tmin > maxDist) return null;
  return tmin;
}
