// Central state container — read-only from outside, mutations go through methods.

export const GameMode = Object.freeze({
  MENU:   'menu',
  PLAYING:'playing',
  PAUSED: 'paused',
  DEAD:   'dead',
  ENDED:  'ended',
});

export class GameState {
  constructor() {
    this.mode = GameMode.MENU;
    this.time = 0;          // seconds since game start
    this.delta = 0;         // last frame delta seconds
    this.frame = 0;

    // Local player (multiplayer later)
    this.player = null;     // Player instance
    this.world = null;      // Hub instance
    this.renderer = null;
    this.physics = null;
    this.audio = null;

    // Remote players (Phase 2) — keyed by peerId
    this.remotePlayers = new Map();

    this.drift = 0;  // global instability 0–120
  }

  setMode(m) { this.mode = m; }
  isPlaying() { return this.mode === GameMode.PLAYING; }
}

export const state = new GameState();
