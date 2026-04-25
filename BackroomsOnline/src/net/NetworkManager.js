// Trystero mesh: every peer connects directly to every other peer.
// Signaling via Nostr decentralized relays — no single server, works in Russia.
// Loaded lazily via dynamic import so a CDN hiccup never breaks the game bootstrap.

import { makeStateMsg } from './Protocol.js';
import { bus, EVT } from '../core/EventBus.js';

const APP_ID  = 'backrooms-online-v1';
const SEED_TIMEOUT_MS = 15000;

// Unique ID for this session — used as the "sender" field in state packets.
const _selfId = crypto.randomUUID();

let _joinRoom = null;

async function ensureTrystero() {
  if (_joinRoom) return;
  const mod = await import('https://esm.sh/trystero/nostr');
  _joinRoom = mod.joinRoom;
}

function gen4() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export class NetworkManager {
  constructor() {
    this.room     = null;
    this.isHost   = false;
    this.id       = null;         // room code shown to users
    this.conns    = new Map();    // peerId -> true
    this._onRemote    = () => {};
    this._onLeft      = () => {};
    this._tickTimer   = 0;
    this._stateHz     = 20;
    this._worldSeed   = null;
    this._seedResolver = null;
    this._sendState   = null;
    this._sendChat    = null;
    this._sendSeed    = null;
    this._sendLevel   = null;
    this._onLevelSeed = null;
    this.voice        = null;
  }

  setWorldSeed(seed) { this._worldSeed = seed; }

  // Resolves immediately if seed already known, otherwise waits with timeout.
  waitForSeed() {
    if (this._worldSeed != null) return Promise.resolve(this._worldSeed);
    return new Promise((resolve, reject) => {
      this._seedResolver = resolve;
      setTimeout(
        () => reject(new Error('Тайм-аут — комната не найдена или хост недоступен')),
        SEED_TIMEOUT_MS,
      );
    });
  }

  onRemoteState(fn) { this._onRemote = fn; }
  onPeerLeft(fn)    { this._onLeft   = fn; }

  // --- host ---------------------------------------------------------------
  async host() {
    await ensureTrystero();
    this.isHost = true;
    const code  = gen4();
    this.id     = code;
    this._setupRoom(code);
    return code;
  }

  // --- client -------------------------------------------------------------
  async join(code) {
    await ensureTrystero();
    this.isHost = false;
    this.id     = code;
    this._setupRoom(code);
  }

  // --- shared setup -------------------------------------------------------
  _setupRoom(code) {
    this.room = _joinRoom({ appId: APP_ID }, code);

    const [sendState, onState] = this.room.makeAction('state');
    const [sendChat,  onChat]  = this.room.makeAction('chat');
    const [sendSeed,  onSeed]  = this.room.makeAction('seed');
    const [sendLevel, onLevel] = this.room.makeAction('level');

    this._sendState = sendState;
    this._sendChat  = sendChat;
    this._sendSeed  = sendSeed;
    this._sendLevel = sendLevel;

    this.room.onPeerJoin(peerId => {
      this.conns.set(peerId, true);
      // Send world seed so the new peer builds the same maze.
      if (this.isHost && this._worldSeed != null) {
        sendSeed(this._worldSeed, peerId);
      }
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Player joined: ${peerId.slice(0, 6)}` });
    });

    this.room.onPeerLeave(peerId => {
      this.conns.delete(peerId);
      this._onLeft(peerId);
      bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Player left: ${peerId.slice(0, 6)}` });
    });

    // Trystero gives sender's peerId in callbacks — use it as the map key.
    onState((data, peerId) => {
      data.id = peerId;
      this._onRemote(peerId, data);
    });

    onChat((data) => {
      bus.emit(EVT.CHAT_MESSAGE, { text: data.text });
    });

    onSeed((seed) => {
      this._worldSeed = seed;
      this._seedResolver?.(seed);
    });

    onLevel((data) => {
      this._onLevelSeed?.(data.seed);
    });
  }

  // --- tick ---------------------------------------------------------------
  tick(dt, player, voted = false) {
    if (!this.room || !player) return;
    this._tickTimer += dt;
    const period = 1 / this._stateHz;
    if (this._tickTimer < period) return;
    this._tickTimer = 0;
    this._sendState?.(makeStateMsg(_selfId, player, voted));
  }

  onLevelSeed(fn) { this._onLevelSeed = fn; }

  // Host broadcasts new level seed to all peers after elevator transition.
  broadcastLevel(seed) {
    this._sendLevel?.({ seed });
  }

  // Initialize voice chat after room is set up.
  async initVoice(remotes) {
    if (!this.room) return null;
    const { VoiceChat } = await import('./VoiceChat.js');
    this.voice = new VoiceChat();
    await this.voice.init(this.room, remotes);
    return this.voice;
  }

  close() {
    this.voice?.dispose();
    this.voice = null;
    try { this.room?.leave?.(); } catch (_) {}
    this.room      = null;
    this.id        = null;
    this.isHost    = false;
    this.conns.clear();
    this._sendState = null;
    this._sendChat  = null;
    this._sendSeed  = null;
    this._sendLevel = null;
  }
}
