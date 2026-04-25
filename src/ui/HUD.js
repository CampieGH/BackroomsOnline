import { bus, EVT } from '../core/EventBus.js';
import { SANITY, FLASHLIGHT, UI } from '../config.js';

export class HUD {
  constructor(state) {
    this.state = state;
    this.root  = document.getElementById('hud');

    this.sanFill  = document.getElementById('san-fill');
    this.sanText  = document.getElementById('san-text');
    this.batFill  = document.getElementById('bat-fill');
    this.batText  = document.getElementById('bat-text');
    this.prompt   = document.getElementById('prompt');
    this.vignette = document.getElementById('vignette');
    this.chatLog  = document.getElementById('chat-log');

    this.slots = Array.from(document.querySelectorAll('#inventory .slot'));
    this.onlineEl      = document.getElementById('online');
    this.zoneEl        = document.getElementById('zone-counter');
    this.levelNameEl   = document.getElementById('level-name');
    this.dangerEl      = document.getElementById('danger-display');
    this.quotaEl       = document.getElementById('quota-display');
    this.compassEl     = document.getElementById('elevator-compass');

    this._bindEvents();
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _bindEvents() {
    bus.on(EVT.PLAYER_SAN_CHANGED, (v) => this._setSanity(v));
    bus.on(EVT.FLASHLIGHT_BATTERY, (v) => this._setBar(this.batFill, this.batText, v, FLASHLIGHT.batteryMax));
    bus.on(EVT.INVENTORY_CHANGED,  (snap) => this._renderInventory(snap));
    bus.on(EVT.SLOT_SELECTED,      (i) => this._highlightSlot(i));
    bus.on(EVT.INTERACT_AVAILABLE, (p) => this._showPrompt(p));
    bus.on(EVT.INTERACT_NONE,      () => this._hidePrompt());
    bus.on(EVT.CHAT_MESSAGE,       (m) => this._addChat(m));
    bus.on(EVT.NETWORK_INFO,       (n) => this._setNetwork(n));
    bus.on(EVT.ZONE_PROGRESS,      (n) => this._setZone(n));
    bus.on(EVT.QUOTA_UPDATED,      (q) => this._setQuota(q));
  }

  setLevelInfo(name, danger) {
    if (!this.levelNameEl) return;
    this.levelNameEl.textContent = name ?? '';
    this.levelNameEl.classList.toggle('hidden', !name);
    if (this.dangerEl) {
      const filled = '█'.repeat(danger ?? 0);
      const empty  = '░'.repeat(5 - (danger ?? 0));
      this.dangerEl.textContent = `ОПАСНОСТЬ  ${filled}${empty}`;
      this.dangerEl.dataset.danger = danger ?? 0;
      this.dangerEl.classList.toggle('hidden', !name);
    }
  }

  setLevelName(name) { this.setLevelInfo(name, 0); }

  setElevatorCompass(arrow) {
    if (!this.compassEl) return;
    if (!arrow) { this.compassEl.classList.add('hidden'); return; }
    this.compassEl.classList.remove('hidden');
    this.compassEl.textContent = `ЛИФТ  ${arrow}`;
  }

  _setZone(n) {
    if (!n) { this.zoneEl.classList.add('hidden'); return; }
    this.zoneEl.classList.remove('hidden');
    const label = n.label ?? 'ЗОНА';
    this.zoneEl.textContent = `${label}  ${n.inZone} / ${n.total}`;
    this.zoneEl.classList.toggle('zone-ready', n.inZone >= n.total);
  }

  _setNetwork(n) {
    if (!n) { this.onlineEl.textContent = 'Online: 1/1'; return; }
    const role = n.isHost ? 'HOST' : 'CLIENT';
    this.onlineEl.innerHTML = `${role} · Online: ${n.peerCount + 1}<br>Code: <b>${n.code || '—'}</b>`;
  }

  _setBar(fillEl, textEl, v, max) {
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    fillEl.style.width = pct + '%';
    textEl.textContent = Math.floor(v);
  }

  _setSanity(v) {
    this._setBar(this.sanFill, this.sanText, v, SANITY.max);
    const t = v / SANITY.max;
    const r = 255, g = Math.floor(216 * t), b = Math.floor(74 * t);
    this.sanFill.style.background = `rgb(${r},${g},${b})`;
    if (v < SANITY.vignetteStart) {
      const strength = 1 - v / SANITY.vignetteStart;
      const px = 40 + strength * 60;
      const alpha = strength * 0.55;
      this.vignette.style.boxShadow =
        `inset 0 0 ${200 + strength * 200}px ${px}px rgba(220,0,0,${alpha.toFixed(3)})`;
    } else {
      this.vignette.style.boxShadow = 'inset 0 0 200px 40px rgba(255,0,0,0)';
    }
  }

  _setQuota({ current, target }) {
    if (!this.quotaEl) return;
    this.quotaEl.textContent = `QUOTA  ${current} / ${target}`;
  }

  _renderInventory(snap) {
    for (let i = 0; i < this.slots.length; i++) {
      const slot  = snap[i];
      const nameEl = this.slots[i].querySelector('.slot-name');
      if (nameEl) nameEl.textContent = slot ? slot.name : '—';
    }
  }

  _highlightSlot(active) {
    this.slots.forEach((el, i) => el.classList.toggle('active', i === active));
  }

  _showPrompt(text) {
    this.prompt.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  _hidePrompt() { this.prompt.classList.add('hidden'); }

  _addChat({ type = 'info', text }) {
    const el = document.createElement('div');
    el.className = `entry${type === 'system' ? ' system' : ''}`;
    el.textContent = text;
    this.chatLog.appendChild(el);
    while (this.chatLog.childNodes.length > 5) this.chatLog.removeChild(this.chatLog.firstChild);
    setTimeout(() => el.remove(), UI.chatTimeoutMs);
  }
}
