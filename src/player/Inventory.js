import { INVENTORY } from '../config.js';
import { bus, EVT } from '../core/EventBus.js';

export class Inventory {
  constructor() {
    this.slots = new Array(INVENTORY.slots).fill(null); // Item instances or null
    this.active = 0;
  }

  getActive() { return this.slots[this.active]; }

  selectSlot(i) {
    if (i < 0 || i >= this.slots.length) return;
    this.active = i;
    bus.emit(EVT.SLOT_SELECTED, this.active);
  }

  // Find first empty slot index, or -1.
  _firstEmpty() {
    return this.slots.findIndex(s => s === null);
  }

  // Try to add item. Returns true on success.
  add(item) {
    const idx = this._firstEmpty();
    if (idx === -1) return false;
    this.slots[idx] = item;
    item.onPickup?.();
    bus.emit(EVT.INVENTORY_CHANGED, this.snapshot());
    bus.emit(EVT.ITEM_PICKED, { item, slot: idx });
    return true;
  }

  dropActive() {
    const item = this.getActive();
    if (!item) return null;
    this.slots[this.active] = null;
    item.onDrop?.();
    bus.emit(EVT.INVENTORY_CHANGED, this.snapshot());
    bus.emit(EVT.ITEM_DROPPED, { item, slot: this.active });
    return item;
  }

  useActive(ctx) {
    const item = this.getActive();
    if (!item) return false;
    const consumed = item.onUse?.(ctx);
    if (consumed) {
      this.slots[this.active] = null;
      bus.emit(EVT.INVENTORY_CHANGED, this.snapshot());
    }
    bus.emit(EVT.ITEM_USED, { item, slot: this.active });
    return true;
  }

  snapshot() {
    return this.slots.map(s => s ? { id: s.id, name: s.name } : null);
  }
}
