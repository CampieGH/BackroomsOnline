import { Flashlight }         from './Flashlight.js';
import { AlmondWater }        from './AlmondWater.js';
import { OverchargedBattery } from './OverchargedBattery.js';
import { ScoreItem }          from './ScoreItem.js';

const factories = new Map();
export function register(id, ctor, ...args) {
  factories.set(id, args.length ? () => new ctor(...args) : () => new ctor());
}
export function create(id) {
  const fn = factories.get(id);
  if (!fn) throw new Error(`Unknown item: ${id}`);
  return fn();
}

register('flashlight',          Flashlight);
register('almond_water',        AlmondWater);
register('overcharged_battery', OverchargedBattery);

// Score items — collected and submitted to quota on elevator ride
const SCORE_ITEMS = [
  ['brass_pipe',       'Медная труба',           8],
  ['office_stapler',   'Степлер',                5],
  ['yellow_notepad',   'Жёлтый блокнот',         4],
  ['cassette_tape',    'Кассета',                12],
  ['broken_watch',     'Сломанные часы',          9],
  ['manila_folder',    'Папка',                   3],
  ['ceramic_mug',      'Кружка',                  2],
  ['photo_frame',      'Рамка с фото',            6],
  ['old_keycard',      'Старый пропуск',         15],
  ['circuit_board',    'Плата',                  20],
  ['copper_wire',      'Медная проволока',        7],
  ['glass_bottle',     'Стеклянная бутылка',      3],
  ['crumpled_paper',   'Скомканная бумага',       1],
  ['office_clock',     'Настенные часы',         18],
];

for (const [id, name, value] of SCORE_ITEMS) {
  factories.set(id, () => new ScoreItem(id, name, value));
}

export const ItemRegistry = { register, create };

// All score item ids for loot tables
export const SCORE_ITEM_IDS = SCORE_ITEMS.map(([id]) => id);
