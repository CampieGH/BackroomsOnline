import { Item } from './Item.js';
import { HEALTH } from '../config.js';

export class RoyalRation extends Item {
  constructor() { super('royal_ration', 'Royal Ration'); }

  onUse(ctx) {
    ctx?.player?.heal?.(HEALTH.royalRationHeal);
    ctx?.audio?.pickup?.();
    return true; // consumed
  }
}
