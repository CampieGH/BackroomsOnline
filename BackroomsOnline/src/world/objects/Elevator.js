import * as THREE from 'three';
import { bus, EVT } from '../../core/EventBus.js';

// Dimensions
const SHAFT_W = 2.2;
const SHAFT_H = 2.8;
const SHAFT_D = 1.8;
const DOOR_W  = 0.95;  // each panel
const DOOR_H  = 2.4;
const DOOR_D  = 0.08;

const CLOSE_SPEED    = 1.1;   // m/s door close
const TRANSIT_DELAY  = 1.4;   // seconds after doors shut → fire LEVEL_UP

export class Elevator {
  constructor(position) {
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this._group   = new THREE.Group();
    this._group.position.set(position.x, position.y, position.z);

    this._doorOpen    = 1.0;   // 1 = fully open
    this._state       = 'idle'; // idle | closing | transit
    this._transitTimer = 0;
    this._triggered   = false;

    this._build();
  }

  _build() {
    const g = this._group;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.35, metalness: 0.85 });
    const darkMat  = new THREE.MeshStandardMaterial({ color: 0x060608 });
    const doorMat  = new THREE.MeshStandardMaterial({ color: 0x2e3e4a, roughness: 0.25, metalness: 0.95 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.4, metalness: 0.6, emissive: 0x001122, emissiveIntensity: 0.3 });

    // Interior shaft (visual only — dark box behind doors)
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W, SHAFT_H, SHAFT_D), darkMat);
    shaft.position.set(0, SHAFT_H / 2, SHAFT_D / 2 + DOOR_D);
    g.add(shaft);

    // Left post
    const postGeo = new THREE.BoxGeometry(0.18, SHAFT_H + 0.12, 0.22);
    const lPost = new THREE.Mesh(postGeo, metalMat);
    lPost.position.set(-SHAFT_W / 2 - 0.09, SHAFT_H / 2, 0);
    g.add(lPost);

    // Right post
    const rPost = new THREE.Mesh(postGeo, metalMat);
    rPost.position.set(SHAFT_W / 2 + 0.09, SHAFT_H / 2, 0);
    g.add(rPost);

    // Top lintel
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(SHAFT_W + 0.36 + 0.12, 0.22, 0.22), metalMat,
    );
    lintel.position.set(0, SHAFT_H + 0.11, 0);
    g.add(lintel);

    // Floor plate
    const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W, 0.1, SHAFT_D + DOOR_D), metalMat);
    floorPlate.position.set(0, 0.05, SHAFT_D / 2 + DOOR_D / 2);
    g.add(floorPlate);

    // Wall panel (decorative back-wall panel inside shaft)
    const wallPanel = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W - 0.2, SHAFT_H - 0.3, 0.06), panelMat);
    wallPanel.position.set(0, SHAFT_H / 2, SHAFT_D + DOOR_D - 0.03);
    g.add(wallPanel);

    // Doors
    const doorGeo = new THREE.BoxGeometry(DOOR_W, DOOR_H, DOOR_D);
    this._lDoor = new THREE.Mesh(doorGeo, doorMat);
    this._rDoor = new THREE.Mesh(doorGeo, doorMat);
    this._lDoor.position.set(-DOOR_W / 2, DOOR_H / 2 + 0.1, 0);
    this._rDoor.position.set( DOOR_W / 2, DOOR_H / 2 + 0.1, 0);
    g.add(this._lDoor);
    g.add(this._rDoor);

    // Door seam line (visual detail)
    const seamGeo = new THREE.BoxGeometry(0.02, DOOR_H, DOOR_D + 0.01);
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.position.set(0, DOOR_H / 2 + 0.1, 0);
    g.add(seam);

    // Main light — warm amber, bright, visible from distance
    const mainLight = new THREE.PointLight(0xffcc66, 28, 18, 1.8);
    mainLight.position.set(0, SHAFT_H + 0.6, -1.2);
    g.add(mainLight);

    // Soft fill light inside shaft
    const fillLight = new THREE.PointLight(0xaaccff, 6, 6, 2);
    fillLight.position.set(0, SHAFT_H * 0.6, SHAFT_D * 0.6);
    g.add(fillLight);

    // Status indicator (small glowing strip above door)
    this._indicatorMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    const indGeo = new THREE.BoxGeometry(SHAFT_W * 0.6, 0.1, 0.06);
    const ind = new THREE.Mesh(indGeo, this._indicatorMat);
    ind.position.set(0, SHAFT_H + 0.02, -0.08);
    g.add(ind);

    // Level number display strip (dark panel above door)
    const dispGeo = new THREE.BoxGeometry(SHAFT_W * 0.8, 0.25, 0.06);
    const dispMat = new THREE.MeshBasicMaterial({ color: 0x001a0a });
    const disp = new THREE.Mesh(dispGeo, dispMat);
    disp.position.set(0, SHAFT_H + 0.24, -0.08);
    g.add(disp);

    this._lDoorBaseX =  -DOOR_W / 2;
    this._rDoorBaseX =   DOOR_W / 2;
  }

  // Called by main.js each frame with zone info.
  setZoneStatus(inZone, total) {
    if (this._triggered) return;
    if      (inZone === 0)     this._indicatorMat.color.setHex(0x00ff66); // green: waiting
    else if (inZone < total)   this._indicatorMat.color.setHex(0xffaa00); // amber: some inside
    else                       this._indicatorMat.color.setHex(0xff2200); // red: all inside
  }

  startClosing() {
    if (this._state !== 'idle') return;
    this._state = 'closing';
  }

  update(dt) {
    if (this._state === 'idle') return;

    if (this._state === 'closing') {
      this._doorOpen = Math.max(0, this._doorOpen - dt * CLOSE_SPEED / DOOR_W);
      this._lDoor.position.x = this._lDoorBaseX - (1 - this._doorOpen) * DOOR_W;
      this._rDoor.position.x = this._rDoorBaseX + (1 - this._doorOpen) * DOOR_W;
      if (this._doorOpen <= 0) {
        this._state = 'transit';
        this._transitTimer = TRANSIT_DELAY;
      }
    }

    if (this._state === 'transit') {
      this._transitTimer -= dt;
      if (this._transitTimer <= 0 && !this._triggered) {
        this._triggered = true;
        bus.emit(EVT.LEVEL_UP);
      }
    }
  }

  dispose() {
    this._group.traverse(n => { if (n.isMesh) n.geometry?.dispose(); });
  }
}
