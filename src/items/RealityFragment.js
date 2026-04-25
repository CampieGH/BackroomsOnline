import { Item } from './Item.js';

// A crystallised shard of stable reality.
// Collect 3 to begin stabilising the drift.
// Cannot be used — it passively exists in your inventory.

export class RealityFragment extends Item {
  constructor() { super('reality_fragment', 'Reality Fragment'); }

  onUse(ctx) {
    ctx?.audio?.deny?.();
    return false; // not consumable
  }
}
