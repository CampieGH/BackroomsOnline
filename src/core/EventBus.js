// Minimal pub/sub. Keep it simple — no wildcards, no priorities.

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); }
      catch (err) { console.error(`[EventBus] ${type}:`, err); }
    }
  }
}

export const bus = new EventBus();

export const EVT = {
  GAME_START: 'game:start',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_EXIT: 'game:exit',

  PLAYER_SPAWN: 'player:spawn',
  PLAYER_DIED: 'player:died',
  PLAYER_RESPAWN: 'player:respawn',
  PLAYER_SAN_CHANGED: 'player:san',
  SANITY_COLLAPSE: 'sanity:collapse',   // sanity hit 0 → teleport penalty

  ITEM_PICKED: 'item:picked',
  ITEM_DROPPED: 'item:dropped',
  ITEM_USED: 'item:used',
  INVENTORY_CHANGED: 'inventory:changed',
  SLOT_SELECTED: 'inventory:slot',

  FLASHLIGHT_TOGGLED: 'flashlight:toggled',
  FLASHLIGHT_BATTERY: 'flashlight:battery',

  INTERACT_AVAILABLE: 'interact:available',
  INTERACT_NONE: 'interact:none',
  INTERACT_TRIGGERED: 'interact:triggered',

  CHAT_MESSAGE: 'chat:message',

  NETWORK_INFO: 'network:info',
  ZONE_PROGRESS: 'zone:progress',   // { inZone, total, label } | null

  QUOTA_UPDATED: 'quota:updated',   // { current, target, delta }
  LEVEL_UP: 'level:up',             // elevator triggered transition
};
