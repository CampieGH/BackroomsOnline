import * as THREE from 'three';
import { state, GameMode } from './core/GameState.js';
import { bus, EVT } from './core/EventBus.js';
import { Renderer } from './engine/Renderer.js';
import { Physics } from './engine/Physics.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { Controls } from './player/Controls.js';
import { Player } from './player/Player.js';
import { Hub }   from './world/Hub.js';
import { Level0 } from './world/Level0.js';
import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { DeathScreen } from './ui/DeathScreen.js';
import { EndScreen }   from './ui/EndScreen.js';
import { INVENTORY, SANITY, WORLD, LIGHT, BIOMES, generateLevelData } from './config.js';
import { NetworkManager } from './net/NetworkManager.js';
import { RemotePlayer } from './net/RemotePlayer.js';
import { CameraOverlay } from './fx/CameraOverlay.js';
import { QuotaTracker } from './core/QuotaTracker.js';

// ---------- bootstrap ----------
const canvas = document.getElementById('game-canvas');
const cameraOverlay = new CameraOverlay();

const renderer = new Renderer(canvas);
const physics  = new Physics();
const audio    = new AudioEngine();
const controls = new Controls(canvas);

state.renderer = renderer;
state.physics  = physics;
state.audio    = audio;

const menu      = new Menu();
const hud       = new HUD(state);
const death     = new DeathScreen();
const endScreen = new EndScreen();

let player  = null;
let world   = null;
let network = null;
let quota   = null;
let worldSeed = 0;
let interactTarget = null;
let localVoted   = false;
let hubCollapsed = false;

const remotes = new Map();
state.network = null;
state.remotes = remotes;

menu.showMain();

// ---------- game start ----------
bus.on(EVT.GAME_START, async (payload = { mode: 'singleplayer' }) => {
  await audio.resume();
  audio.startAmbient();

  worldSeed = (Math.random() * 0xFFFFFFFF) >>> 0;

  if (payload.mode === 'host' || payload.mode === 'join') {
    try {
      network = new NetworkManager();
      if (payload.serverUrl) network.setServerUrl(payload.serverUrl);
      network.onRemoteState(handleRemoteState);
      network.onPeerLeft(handlePeerLeft);
      network.onLevelSeed((seed) => {
        if (quota && world) doLevelTransition(seed, quota.levelNum);
      });
      if (payload.mode === 'host') {
        network.setWorldSeed(worldSeed);
        const id = await network.host();
        bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Код комнаты: ${id}` });
      } else {
        await network.join(payload.code);
        bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Подключено к хосту.' });
      }
      state.network = network;
      emitNetworkInfo();
      worldSeed = (payload.mode === 'join') ? await network.waitForSeed() : worldSeed;
      network.initVoice(remotes).then(() => {
        if (network.voice?.enabled)
          bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Голосовой чат готов. Держи T для разговора.' });
      });
    } catch (err) {
      alert('Network error: ' + (err?.message || err));
      network?.close(); network = null; return;
    }
  }

  menu.hideMain();
  menu.hideCode();
  hud.show();

  quota = new QuotaTracker();
  localVoted   = false;
  hubCollapsed = false;
  bus.emit(EVT.QUOTA_UPDATED, { current: 0, target: quota.target, delta: 0 });

  const hub    = new Hub({ renderer, physics });
  const level0 = new Level0({ renderer, physics, seed: worldSeed, biome: 'backrooms', wallTint: null, elevDist: 1 });

  world = makeGameWorld(hub, level0);
  state.world = world;

  player = new Player({ camera: renderer.camera, controls, physics, audio, world });
  state.player = player;

  // Spawn in the hub (office above Level 0)
  player.position.copy(hub.spawn);

  bus.emit(EVT.PLAYER_SAN_CHANGED, player.sanity.value);
  bus.emit(EVT.FLASHLIGHT_BATTERY, player.flashlight.battery);
  bus.emit(EVT.INVENTORY_CHANGED, player.inventory.snapshot());
  bus.emit(EVT.SLOT_SELECTED, player.inventory.active);

  await acquireInput();
  state.setMode(GameMode.PLAYING);

  const startLevel = generateLevelData(worldSeed, 0);
  applyLevelModifiers(startLevel);
  hud.setLevelInfo(startLevel.name, startLevel.danger);

  bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Нажмите V чтобы начать. Все игроки должны проголосовать.' });

  _setupDevPanel(player, renderer);
});

// ---------- sanity collapse ----------
bus.on(EVT.SANITY_COLLAPSE, () => {
  if (!player || !world) return;
  player.sanity.set(SANITY.collapsePenalty);
  player.sanity.resetCollapse();
  player.position.copy(world._level0?.spawn ?? world.spawn);
  player.velocity.set(0, 0, 0);
  player._inElevator = false;
  player.addShake(2.5);
  bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Разум помутился. Вы очнулись у входа в уровень.' });
});

// ---------- elevator / level transition ----------
bus.on(EVT.LEVEL_UP, () => {
  if (!player || !quota) return;
  if (state.mode !== GameMode.PLAYING) return;

  const scored = quota.submitInventory(player.inventory);
  const msg = scored > 0
    ? `+${scored} ед. Квота: ${quota.submitted} / ${quota.target}`
    : `Ничего не сдано. Квота: ${quota.submitted} / ${quota.target}`;
  bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: msg });

  quota.nextLevel();

  if (quota.levelNum >= quota.maxLevels) {
    const extra = { score: quota.submitted, levels: quota.levelNum, remaining: quota.remaining };
    triggerEnd(quota.isComplete ? 'quota_success' : 'quota_fail', extra);
    return;
  }

  // New seed: XOR original with level-based shift
  const newSeed = (worldSeed ^ (quota.levelNum * 0x9e3779b9)) >>> 0;
  if (network?.isHost) network.broadcastLevel(newSeed);
  doLevelTransition(newSeed, quota.levelNum);
});

function doLevelTransition(newSeed, difficulty) {
  if (!player || !world || !quota) return;

  const levelData = generateLevelData(newSeed, difficulty ?? quota.levelNum);

  // Dispose old Level0 and rebuild
  world._level0.disposeAll();
  const newLevel0 = new Level0({ renderer, physics, seed: newSeed, biome: levelData.biome, wallTint: levelData.wallTint, elevDist: levelData.elevDist });
  world._level0 = newLevel0;
  world._level0.isSafe = false;

  player.position.copy(newLevel0.spawn);
  player.velocity.set(0, 0, 0);
  player._inElevator = false;

  applyLevelModifiers(levelData);
  hud.setLevelInfo(levelData.name, levelData.danger);

  const remaining = quota.target - quota.submitted;
  bus.emit(EVT.QUOTA_UPDATED, { current: quota.submitted, target: quota.target, delta: 0 });
  bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `${levelData.name}  [ Опасность: ${levelData.danger}/5 ]  До квоты: ${remaining} ед.` });
}

function applyLevelModifiers(level) {
  const b = BIOMES[level.biome] ?? BIOMES.backrooms;
  if (renderer.scene.fog) {
    renderer.scene.fog.color.set(b.fogColor);
    renderer.scene.background.set(b.fogColor);
    renderer.scene.fog.near = b.fogNear;
    renderer.scene.fog.far  = b.fogFar / (level.fogMul ?? 1);
  }
  // ambientMul from levelData scales on top of biome's lightMul
  const ambientMul = (level.ambientMul ?? 1.0) * (b.lightMul ?? 1.0);
  renderer.ambient.intensity = LIGHT.ambientIntensity * ambientMul;
  renderer.ambient.color.set(b.ambientColor);
  if (player) player._sanMul = level.sanMul ?? 1.0;
}

// ---------- pause / resume / exit ----------
bus.on(EVT.GAME_PAUSE, () => {
  if (state.mode !== GameMode.PLAYING) return;
  state.setMode(GameMode.PAUSED);
  releaseInput();
  menu.showPause();
});

bus.on(EVT.GAME_RESUME, async () => {
  if (state.mode !== GameMode.PAUSED) return;
  menu.hidePause();
  await acquireInput();
  state.setMode(GameMode.PLAYING);
});

bus.on(EVT.GAME_EXIT, () => {
  menu.hidePause();
  hud.hide();
  death.hide();
  endScreen.hide();
  audio.stopAmbient();
  releaseInput();
  if (world) { disposeWorld(world); world = null; }
  for (const rp of remotes.values()) { renderer.remove(rp.root); rp.dispose(); }
  remotes.clear();
  if (network) { network.close(); network = null; state.network = null; emitNetworkInfo(); }
  menu.hideCode();
  physics.clear();
  player = null;
  quota  = null;
  localVoted   = false;
  hubCollapsed = false;
  state.player = null;
  state.world  = null;
  state.setMode(GameMode.MENU);
  menu.showMain();
});

// ---------- world helpers ----------
function makeGameWorld(hub, level0) {
  return {
    _hub:    hub,
    _level0: level0,
    isSafe:  false,
    spawn:   level0.spawn,
    get interactables() {
      return [...(this._hub?.interactables ?? []), ...this._level0.interactables];
    },
    get entities() {
      return [...(this._hub?.entities ?? []), ...this._level0.entities];
    },
    update(dt, ctx) {
      this.isSafe = false;
      this._hub?.update(dt, ctx);
      this._level0.update(dt, ctx);
    },
  };
}

function disposeWorld(w) {
  if (!w) return;
  w._level0?.disposeAll?.();
  if (w._hub?.root) renderer.remove(w._hub.root);
  if (w.root)       renderer.remove(w.root);
}

// ---------- input acquisition ----------
async function acquireInput() {
  controls.setEnabled(true);
  controls.requestLock();
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (navigator.keyboard?.lock) await navigator.keyboard.lock();
  } catch (_) {}
}

function releaseInput() {
  controls.setEnabled(false);
  controls.releaseLock();
  if (navigator.keyboard?.unlock) { try { navigator.keyboard.unlock(); } catch (_) {} }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

let _lockRetryTimer = null;
document.addEventListener('pointerlockerror', () => {
  if (state.mode !== GameMode.PLAYING) return;
  bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Нажмите куда-нибудь, чтобы вернуть мышь.' });
  clearTimeout(_lockRetryTimer);
  _lockRetryTimer = setTimeout(() => {
    if (state.mode === GameMode.PLAYING && document.pointerLockElement !== canvas)
      controls.requestLock();
  }, 1600);
});

canvas.addEventListener('click', () => {
  if (state.mode === GameMode.PLAYING && document.pointerLockElement !== canvas) acquireInput();
});

window.addEventListener('beforeunload', (e) => {
  if (state.mode === GameMode.PLAYING || state.mode === GameMode.PAUSED) {
    e.preventDefault(); e.returnValue = ''; return '';
  }
});

// ---------- network ----------
function handleRemoteState(peerId, msg) {
  let rp = remotes.get(peerId);
  if (!rp) {
    rp = new RemotePlayer(peerId);
    remotes.set(peerId, rp);
    renderer.add(rp.root);
    emitNetworkInfo();
  }
  rp.applyState(msg);
}

function handlePeerLeft(peerId) {
  const rp = remotes.get(peerId);
  if (!rp) return;
  renderer.remove(rp.root);
  rp.dispose();
  remotes.delete(peerId);
  network?.voice?.removePeer(peerId);
  emitNetworkInfo();
}

function emitNetworkInfo() {
  if (!network) { bus.emit(EVT.NETWORK_INFO, null); return; }
  bus.emit(EVT.NETWORK_INFO, { code: network.id, isHost: network.isHost, peerCount: remotes.size });
}

// ---------- main loop ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  state.delta = dt;
  state.time  += dt;
  state.frame++;

  if (state.mode === GameMode.PLAYING && player && world) {
    handleInput();
    updateNearbyPeers();
    player.update(dt);
    world.update(dt, { player, audio, controls, state, remotes });
    updateInteraction();
    if (!hubCollapsed) { checkHubVote(); hud.setElevatorCompass(null); }
    else               checkElevator();
    if (network) network.tick(dt, player, localVoted);
    if (network?.voice) network.voice.update(player.getEyePos(), player.getForward());
  }

  for (const rp of remotes.values()) rp.update(dt);
  cameraOverlay.update(dt);
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- hub vote (drop floor) ----------
function checkHubVote() {
  if (!world?._hub || !player) return;
  const total  = 1 + remotes.size;
  let   voted  = localVoted ? 1 : 0;
  for (const rp of remotes.values()) if (rp.voted) voted++;

  if (voted === 0) {
    bus.emit(EVT.ZONE_PROGRESS, { inZone: 0, total, label: 'V — НАЧАТЬ' });
    return;
  }
  bus.emit(EVT.ZONE_PROGRESS, { inZone: voted, total, label: 'ГОТОВО' });
  if (voted >= total) {
    hubCollapsed = true;
    world._hub.collapseFloor();
    bus.emit(EVT.ZONE_PROGRESS, null);
    bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Реальность рушится. Найдите лифт.' });
  }
}

// ---------- elevator zone check ----------
const ELEVATOR_RADIUS = 2.5;

function checkElevator() {
  const elevators = world?._level0?._elevators;
  if (!elevators?.length) { bus.emit(EVT.ZONE_PROGRESS, null); hud.setElevatorCompass(null); return; }

  const total = 1 + remotes.size;
  const pp    = player.position;

  // Find the elevator the local player is closest to (if inside radius)
  let activeElev = null;
  let nearestElev = null;
  let nearestDist = Infinity;
  for (const elev of elevators) {
    if (elev._triggered) continue;
    const ep   = elev.position;
    const dist = Math.hypot(pp.x - ep.x, pp.z - ep.z);
    if (dist < nearestDist) { nearestDist = dist; nearestElev = elev; }
    if (dist < ELEVATOR_RADIUS && Math.abs(pp.y - ep.y) < 3) activeElev = elev;
  }

  player._inElevator = activeElev !== null;

  // Reset indicators on all non-active elevators
  for (const elev of elevators) {
    if (elev !== activeElev && !elev._triggered) elev.setZoneStatus(0, total);
  }

  // Compass arrow toward nearest elevator (hide when close or inside)
  if (nearestElev && nearestDist > ELEVATOR_RADIUS * 2) {
    hud.setElevatorCompass(_elevatorCompassArrow(nearestElev.position));
  } else {
    hud.setElevatorCompass(null);
  }

  if (!activeElev) { bus.emit(EVT.ZONE_PROGRESS, null); return; }

  let inZone = 1;
  for (const rp of remotes.values()) if (rp.inElevator) inZone++;

  bus.emit(EVT.ZONE_PROGRESS, { inZone, total, label: 'ЛИФТ' });
  activeElev.setZoneStatus(inZone, total);
  if (inZone >= total) activeElev.startClosing();
}

function _elevatorCompassArrow(elevPos) {
  const dx  = elevPos.x - player.position.x;
  const dz  = elevPos.z - player.position.z;
  const yaw = player.controls.yaw ?? 0;
  // Player forward = (-sin(yaw), 0, -cos(yaw)) in world space
  const fwd = dx * (-Math.sin(yaw)) + dz * (-Math.cos(yaw));
  const rgt = dx *   Math.cos(yaw)  + dz * (-Math.sin(yaw));
  const rel = Math.atan2(rgt, fwd); // 0=forward, π/2=right, ±π=back
  const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
  const idx = Math.round(rel / (Math.PI * 2) * 8 + 8) % 8;
  return arrows[idx];
}

// ---------- coop ----------
const NEARBY_DIST_SQ = 8 * 8;

function updateNearbyPeers() {
  if (!player) return;
  let count = 0;
  for (const rp of remotes.values()) {
    const dx = rp.root.position.x - player.position.x;
    const dz = rp.root.position.z - player.position.z;
    if (dx * dx + dz * dz <= NEARBY_DIST_SQ) count++;
    rp.root.visible = true;
  }
  player._nearbyPeers = count;
}

// ---------- end game ----------
function triggerEnd(type, extra = {}) {
  if (state.mode === GameMode.ENDED) return;
  state.setMode(GameMode.ENDED);
  releaseInput();
  hud.hide();
  endScreen.show(type, extra);
}

// ---------- per-frame input ----------
function handleInput() {
  // Slot selection: keys 1–9 → slots 0–8, key 0 → slot 9
  for (let i = 0; i < INVENTORY.slots; i++) {
    const code = `Digit${(i + 1) % 10}`;
    if (controls.consumeKey(code)) { player.inventory.selectSlot(i); audio.click(); }
  }

  if (controls.consumeKey('KeyF') && player.flashlight) {
    player.flashlight.toggle(); audio.click();
  }

  if (controls.consumeKey('KeyQ')) {
    const active = player.inventory.getActive();
    if (active && active.id !== 'flashlight') { player.inventory.dropActive(); audio.click(); }
    else audio.deny();
  }

  if (controls.consumeKey('KeyR')) {
    const active = player.inventory.getActive();
    if (active && active.id !== 'flashlight') player.inventory.useActive({ player, audio });
  }

  // Hub vote
  if (!hubCollapsed && controls.consumeKey('KeyV')) {
    if (!localVoted) {
      localVoted = true;
      const total = 1 + remotes.size;
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Вы готовы. Ожидание ${total > 1 ? 'остальных...' : 'начала...'}` });
    }
  }

  // Push-to-talk
  if (network?.voice) {
    const talking = controls.keys.has('KeyT');
    if (talking !== network.voice.talking) {
      network.voice.setPTT(talking);
      document.getElementById('voice-indicator')?.classList.toggle('hidden', !talking);
    }
  }

  if (controls.consumeKey('Backquote')) _devToggle();
  if (_devIsOpen()) {
    if (controls.consumeKey('ArrowUp'))   _devMove(-1);
    if (controls.consumeKey('ArrowDown')) _devMove(+1);
    if (controls.consumeKey('Enter'))     _devActivate(player, renderer);
    controls.consumeKey('ArrowLeft');
    controls.consumeKey('ArrowRight');
  }

  if (controls.consumeKey('Escape')) { bus.emit(EVT.GAME_PAUSE); return; }

  if (controls.consumeKey('KeyE') && interactTarget) {
    interactTarget.onInteract({ player, audio, controls, state });
  }
}

function updateInteraction() {
  const origin = player.getEyePos();
  const dir    = player.getForward();
  const hit    = physics.raycastInteractables(origin, dir, INVENTORY.interactDistance, world.interactables);

  const newTarget = hit ? hit.target : null;
  if (newTarget !== interactTarget) {
    interactTarget = newTarget;
    if (interactTarget) bus.emit(EVT.INTERACT_AVAILABLE, interactTarget.prompt);
    else                bus.emit(EVT.INTERACT_NONE);
  }

  if (interactTarget?.onProximity)
    interactTarget.onProximity(state.delta, { player, audio, controls, state });
}

// ---------- dev panel ----------
let _echoNodes = null;

const _DEV_ITEMS = [
  {
    id: 'bright', label: 'Яркость',
    on(p, rend)  { rend.renderer.toneMappingExposure = 3.0; rend.ambient.intensity = 2.5; },
    off(p, rend) { rend.renderer.toneMappingExposure = 1.4; rend.ambient.intensity = 0.6; },
  },
  { id: 'fly',    label: 'Полёт',        on(p) { p.velocity.set(0,0,0); }, off() {} },
  { id: 'noclip', label: 'No-clip',      on() {}, off() {} },
  { id: 'speed',  label: 'Ускорение ×4', on() {}, off() {} },
  {
    id: 'voiceecho', label: 'Эхо микрофона',
    on() {
      const v = network?.voice;
      if (!v?.enabled) { bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Голосовой чат не активен.' }); return; }
      const ctx  = v._ctx();
      const src  = ctx.createMediaStreamSource(v._stream);
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain).connect(ctx.destination);
      v._stream.getAudioTracks().forEach(t => t.enabled = true);
      _echoNodes = { src, gain };
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Эхо ВКЛ — говори в микрофон (наушники!).' });
    },
    off() {
      const v = network?.voice;
      try { _echoNodes?.src?.disconnect(); _echoNodes?.gain?.disconnect(); } catch (_) {}
      _echoNodes = null;
      if (v) v._stream?.getAudioTracks().forEach(t => t.enabled = v.talking);
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Эхо ВЫКЛ.' });
    },
  },
];

let _devCursor = 0;

function _setupDevPanel(p, rend) {
  const panel = document.getElementById('dev-panel');
  const title = panel.querySelector('.dev-title');
  panel.innerHTML = '';
  panel.appendChild(title);
  for (let i = 0; i < _DEV_ITEMS.length; i++) {
    const row  = document.createElement('div');
    row.className = 'dev-row';
    row.dataset.idx = i;
    const mark = document.createElement('span');
    mark.className = 'dev-mark'; mark.textContent = '[ ]';
    const lbl = document.createElement('span');
    lbl.textContent = ' ' + _DEV_ITEMS[i].label;
    row.appendChild(mark); row.appendChild(lbl);
    panel.appendChild(row);
  }
  _devRefresh(p);
}

function _devIsOpen()  { return !document.getElementById('dev-panel').classList.contains('hidden'); }
function _devToggle()  {
  const panel = document.getElementById('dev-panel');
  const btn   = document.getElementById('dev-toggle');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  btn.classList.toggle('active', opening);
}
function _devMove(dir) {
  _devCursor = (_devCursor + dir + _DEV_ITEMS.length) % _DEV_ITEMS.length;
  if (player) _devRefresh(player);
}
function _devActivate(p, rend) {
  const item = _DEV_ITEMS[_devCursor];
  p.dev[item.id] = !p.dev[item.id];
  if (p.dev[item.id]) item.on(p, rend); else item.off(p, rend);
  _devRefresh(p);
}
function _devRefresh(p) {
  const panel = document.getElementById('dev-panel');
  const rows  = panel.querySelectorAll('.dev-row');
  rows.forEach((row, i) => {
    const item = _DEV_ITEMS[i];
    row.querySelector('.dev-mark').textContent = p.dev[item.id] ? '[x]' : '[ ]';
    row.classList.toggle('dev-cursor', i === _devCursor);
    row.classList.toggle('dev-on', !!p.dev[item.id]);
  });
}
