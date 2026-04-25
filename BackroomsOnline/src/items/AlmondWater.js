import { Item } from './Item.js';
import { SANITY } from '../config.js';

export class AlmondWater extends Item {
  constructor() { super('almond_water', 'Almond Water'); }

  onUse(ctx) {
    ctx?.player?.sanity?.add(SANITY.almondWaterGain);
    ctx?.audio?.drink?.();
    return true; // consumed
  }
}
