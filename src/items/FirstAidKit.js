import { Item } from './Item.js';
import { HEALTH } from '../config.js';

export class FirstAidKit extends Item {
  constructor() { super('first_aid', 'First Aid Kit'); }

  onUse(ctx) {
    ctx?.player?.heal?.(HEALTH.firstAidHeal);
    ctx?.audio?.pickup?.();
    return true; // consumed
  }
}
