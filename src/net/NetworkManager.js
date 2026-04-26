// Centralized WebSocket multiplayer — connects to server.js running on host's PC.
// Drop-in replacement for the old Trystero P2P NetworkManager.

import { makeStateMsg } from './Protocol.js';
import { bus, EVT }     from '../core/EventBus.js';

const SEED_TIMEOUT_MS = 20000;
const _selfId = crypto.randomUUID();

export class NetworkManager {
  constructor() {
    this._ws            = null;
    this._serverUrl     = 'ws://localhost:3000';
    this.isHost         = false;
    this.id             = null;          // 4-digit room code
    this.conns          = new Map();     // peerId -> true
    this._onRemote      = () => {};
    this._onLeft        = () => {};
    this._tickTimer     = 0;
    this._stateHz       = 20;
    this._worldSeed     = null;
    this._seedResolver  = null;
    this._seedRejecter  = null;
    this._onLevelSeed   = null;
    this._hostedResolve = null;
    this._joinedResolve = null;
    this._joinedReject  = null;
    this.voice          = null;          // voice disabled in server mode
  }

  setServerUrl(url) { this._serverUrl = url.trim() || 'ws://localhost:3000'; }
  setWorldSeed(seed) { this._worldSeed = seed; }

  // Resolves with seed once received from host (or immediately if already known).
  waitForSeed() {
    if (this._worldSeed != null) return Promise.resolve(this._worldSeed);
    return new Promise((resolve, reject) => {
      this._seedResolver = resolve;
      this._seedRejecter = reject;
      setTimeout(
        () => reject(new Error('Тайм-аут — хост не прислал данные. Убедитесь, что хост в игре.')),
        SEED_TIMEOUT_MS,
      );
    });
  }

  onRemoteState(fn) { this._onRemote = fn; }
  onPeerLeft(fn)    { this._onLeft   = fn; }
  onLevelSeed(fn)   { this._onLevelSeed = fn; }

  // ── host: create room, returns room code ─────────────────
  async host() {
    await this._connect();
    this.isHost = true;
    this._send({ type: 'host', id: _selfId });
    return new Promise((resolve) => {
      this._hostedResolve = resolve;
    });
  }

  // ── join: enter existing room — rejects immediately on error ──
  async join(code) {
    await this._connect();
    this.isHost = false;
    this._send({ type: 'join', id: _selfId, code: String(code).trim() });
    // wait for 'joined' confirmation or 'error' from server
    return new Promise((resolve, reject) => {
      this._joinedResolve = resolve;
      this._joinedReject  = reject;
    });
  }

  // ── open WebSocket connection ─────────────────────────────
  _connect() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this._serverUrl);
      } catch (e) {
        reject(new Error(`Неверный адрес сервера: ${this._serverUrl}`));
        return;
      }
      ws.addEventListener('open', () => {
        this._ws = ws;
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error(`Не удалось подключиться к серверу: ${this._serverUrl}`));
      });
      ws.addEventListener('message', (evt) => {
        try { this._onMessage(JSON.parse(evt.data)); } catch (_) {}
      });
      ws.addEventListener('close', () => this._onDisconnect());
    });
  }

  _send(msg) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  // ── incoming message handler ──────────────────────────────
  _onMessage(msg) {
    switch (msg.type) {

      case 'hosted':
        this.id = msg.code;
        this._hostedResolve?.(msg.code);
        this._hostedResolve = null;
        break;

      case 'joined':
        this.id = msg.code;
        this._joinedResolve?.();
        this._joinedResolve = null;
        this._joinedReject  = null;
        break;

      case 'peer_joined': {
        const pid = msg.id;
        this.conns.set(pid, true);
        // Host sends seed to everyone in room when a new peer joins.
        // Server relays it to all other peers (existing peers ignore duplicates).
        if (this.isHost && this._worldSeed != null) {
          this._send({ type: 'seed', seed: this._worldSeed });
        }
        bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Игрок подключился: ${pid.slice(0, 6)}` });
        break;
      }

      case 'peer_left': {
        const pid = msg.id;
        this.conns.delete(pid);
        this._onLeft(pid);
        bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Игрок ушёл: ${pid.slice(0, 6)}` });
        break;
      }

      case 'state':
        if (msg.from) this._onRemote(msg.from, msg);
        break;

      case 'chat':
        bus.emit(EVT.CHAT_MESSAGE, { text: msg.text });
        break;

      case 'seed':
        // Only accept seed if we don't have one yet (and we're not the host)
        if (this._worldSeed == null) {
          this._worldSeed = msg.seed;
          this._seedResolver?.(msg.seed);
          this._seedResolver = null;
          this._seedRejecter = null;
        }
        break;

      case 'level':
        this._onLevelSeed?.(msg.seed);
        break;

      case 'error': {
        const errText = msg.text ?? 'Неизвестная ошибка сервера';
        // Reject pending join/seed promises immediately instead of waiting for timeout
        this._joinedReject?.(new Error(errText));
        this._joinedReject  = null;
        this._joinedResolve = null;
        this._seedRejecter?.(new Error(errText));
        this._seedRejecter  = null;
        this._seedResolver  = null;
        bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: `Ошибка: ${errText}` });
        break;
      }
    }
  }

  _onDisconnect() {
    if (!this._ws) return; // intentional close — skip warning
    // Fail any pending promises
    const err = new Error('Соединение с сервером потеряно');
    this._joinedReject?.(err);
    this._seedRejecter?.(err);
    this._joinedReject  = null;
    this._joinedResolve = null;
    this._seedRejecter  = null;
    this._seedResolver  = null;
    bus.emit(EVT.CHAT_MESSAGE, { type: 'system', text: 'Потеряно соединение с сервером.' });
  }

  // ── game tick: send player state ──────────────────────────
  tick(dt, player, voted = false) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN || !player) return;
    this._tickTimer += dt;
    if (this._tickTimer < 1 / this._stateHz) return;
    this._tickTimer = 0;
    const msg = makeStateMsg(_selfId, player, voted);
    msg.type = 'state';
    this._send(msg);
  }

  // Host broadcasts next-level seed to all clients.
  broadcastLevel(seed) {
    this._send({ type: 'level', seed });
  }

  // Voice chat not available in server mode.
  async initVoice() { return null; }

  // ── cleanup ───────────────────────────────────────────────
  close() {
    const ws    = this._ws;
    this._ws    = null;   // mark as intentional so _onDisconnect stays quiet
    this.id     = null;
    this.isHost = false;
    this.conns.clear();
    this._hostedResolve = null;
    this._joinedResolve = null;
    this._joinedReject  = null;
    this._seedResolver  = null;
    this._seedRejecter  = null;
    try { ws?.close(); } catch (_) {}
  }
}
