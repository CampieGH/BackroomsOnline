// Base class for all inventory items.
// Subclasses override onPickup / onDrop / onUse / update.

export class Item {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
  onPickup() {}
  onDrop() {}
  // Return `true` if the item should be consumed (removed from inventory).
  onUse(/* ctx */) { return false; }
  update(/* dt, ctx */) {}
}
