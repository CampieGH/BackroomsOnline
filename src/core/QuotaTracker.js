import { QUOTA } from '../config.js';
import { bus, EVT } from './EventBus.js';

export class QuotaTracker {
  constructor() {
    this.levelNum  = 0;
    this.submitted = 0;
    this.target    = QUOTA.baseTarget;
  }

  get remaining()   { return Math.max(0, this.target - this.submitted); }
  get isComplete()  { return this.submitted >= this.target; }
  get maxLevels()   { return QUOTA.maxLevels; }

  // Consume all score items from inventory, return points scored this ride.
  submitInventory(inventory) {
    let score = 0;
    for (let i = 0; i < inventory.slots.length; i++) {
      const item = inventory.slots[i];
      if (item?.isScoreItem) { score += item.value; inventory.slots[i] = null; }
    }
    if (score > 0) {
      bus.emit(EVT.INVENTORY_CHANGED, inventory.snapshot());
    }
    this.submitted += score;
    bus.emit(EVT.QUOTA_UPDATED, { current: this.submitted, target: this.target, delta: score });
    return score;
  }

  nextLevel() {
    this.levelNum++;
    this.target = QUOTA.baseTarget + this.levelNum * QUOTA.perLevelAdd;
  }
}
