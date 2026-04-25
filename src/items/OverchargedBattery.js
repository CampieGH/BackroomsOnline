import { Item } from './Item.js';
import { FLASHLIGHT } from '../config.js';

// Instantly refills battery and overclocks the flashlight for 30 seconds.
// The light burns 2× brighter, but sanity drains faster while active.

export class OverchargedBattery extends Item {
  constructor() { super('overcharged_battery', 'Overcharged Battery'); }

  onUse(ctx) {
    const fl = ctx?.player?.flashlight;
    if (!fl) return false;
    fl.battery = FLASHLIGHT.batteryMax;
    fl.setOn(true);
    fl._overcharge = 30; // seconds remaining
    ctx?.audio?.pickup?.();
    return true; // consumed
  }
}
