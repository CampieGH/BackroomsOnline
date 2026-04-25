import { Item } from './Item.js';

// Passive collectible — just sits in inventory and contributes to quota on elevator ride.
export class ScoreItem extends Item {
  constructor(id, name, value) {
    super(id, name);
    this.value      = value;
    this.isScoreItem = true;
  }
}
