// All tunable constants live here — per GDD section "Config-driven".

export const PLAYER = {
  walkSpeed: 4.0,
  sprintSpeed: 6.5,
  crouchSpeed: 2.0,
  jumpVelocity: 7.0,
  eyeHeightStand: 1.7,
  eyeHeightCrouch: 1.0,
  radius: 0.3,
  height: 1.8,
  gravity: 20.0,
  mouseSensitivity: 0.0022,
  fov: 75,
};

export const SANITY = {
  max: 100,
  darkLossPerSec: 0.15,
  aloneLossPerSec: 0.08,
  aloneThresholdSec: 45,
  entityHit: 10,
  almondWaterGain: 20,
  vignetteStart: 50,
  collapsePenalty: 50,   // sanity restored after collapse (set to this value)
};

export const FLASHLIGHT = {
  batteryMax: 100,
  drainPerSec: 1.5,
  chargePerSec: 2.0,
  radius: 25,
  angle: Math.PI / 5.5,
  penumbra: 0.45,
  decay: 1.1,
  intensity: 42,
  lowBatteryThreshold: 10,
  color: 0xfff0c8,
};

export const INVENTORY = {
  slots: 10,
  interactDistance: 2.5,
};

export const QUOTA = {
  baseTarget:  80,   // score needed on level 0
  perLevelAdd: 40,   // +40 per level
  maxLevels:   10,   // game ends after 10 elevator rides
};

export const WORLD = {
  tileSize: 4.0,
  hubRadius: 5,
  wallHeight: 3.0,
  ceilingColor: 0x1a1a1a,
  floorColor: 0x6b5530,
  wallColor: 0xffc857,
  ambientColor: 0x5a4820,
  fogColor: 0x120d04,
  fogNear: 6,
  fogFar: 38,
  spawn: { x: 0, y: 0, z: 0 },
  hubFloorY:    30,
  level0FloorY: 10,
  cityFloorY:   80,
  skyPlatformY: -40,
  skyExitY:    -160,
  fallDepth:    20,
  holeZoneRadius: 2.0,
  nodeFloorY: -50,
};

export const BIOMES = {
  backrooms: {
    id: 'backrooms',
    name: 'Level 0 — The Backrooms',
    wallC0: 0xe4e6a8,  wallC1: 0x3a3030,  wallC2: 0x1a0505,
    floorRGB: [0.42, 0.33, 0.19],
    ceilRGB:  [1.00, 1.00, 1.00],
    fogColor: 0x120d04, fogNear: 6,  fogFar: 38,
    lightColor: 0xffdca0, lightMul: 1.0,
    ambientColor: 0x5a4820,
  },
  poolrooms: {
    id: 'poolrooms',
    name: 'Level 37 — The Poolrooms',
    wallC0: 0x88ccee,  wallC1: 0x335566,  wallC2: 0x0a1a22,
    floorRGB: [0.22, 0.38, 0.52],
    ceilRGB:  [0.85, 0.96, 1.00],
    fogColor: 0x0d1a22, fogNear: 9,  fogFar: 55,
    lightColor: 0x88ddff, lightMul: 1.3,
    ambientColor: 0x1a3344,
  },
  ruins: {
    id: 'ruins',
    name: 'Level 6 — The Ruins',
    wallC0: 0x886644,  wallC1: 0x442222,  wallC2: 0x0e0505,
    floorRGB: [0.18, 0.10, 0.06],
    ceilRGB:  [0.20, 0.10, 0.08],
    fogColor: 0x080204, fogNear: 3,  fogFar: 22,
    lightColor: 0xff8833, lightMul: 0.65,
    ambientColor: 0x2a1a0a,
  },
};

// ── Level generation: cluster-based procedural system ─────────────────────
// Same seed → same level always. Difficulty controls cluster weights.

function _lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}
function _rlerp(rng, lo, hi) { return +(lo + rng() * (hi - lo)).toFixed(3); }

// Cluster definitions — all parameters are [min, max] ranges
const _CLUSTERS = {
  safe: {
    fogMul:     [0.75, 1.1],   sanMul: [0.5, 0.95],  batMul: [0.5, 0.85],
    lootMul:    [1.2,  1.8],   ambientMul: [0.9, 1.3],
    elevDist: 1, dangerBase: 1,
    biomeWeights: [0.75, 0.05, 0.20],  // backrooms / ruins / poolrooms
  },
  medium: {
    fogMul:     [1.0,  1.6],   sanMul: [0.9, 1.5],   batMul: [0.9, 1.35],
    lootMul:    [0.8,  1.25],  ambientMul: [0.55, 0.90],
    elevDist: 2, dangerBase: 2,
    biomeWeights: [0.40, 0.35, 0.25],
  },
  dangerous: {
    fogMul:     [1.5,  2.2],   sanMul: [1.4, 2.2],   batMul: [1.2, 1.85],
    lootMul:    [0.55, 1.0],   ambientMul: [0.18, 0.55],
    elevDist: 2, dangerBase: 3,
    biomeWeights: [0.15, 0.55, 0.30],
  },
  extreme: {
    fogMul:     [2.0,  3.8],   sanMul: [1.9, 3.5],   batMul: [1.5, 2.8],
    lootMul:    [0.35, 0.75],  ambientMul: [0.02, 0.20],
    elevDist: 3, dangerBase: 4,
    biomeWeights: [0.10, 0.52, 0.38],
  },
};

// Cluster probability weights by difficulty tier [safe, medium, dangerous, extreme]
const _TIER_WEIGHTS = [
  [1.00, 0.00, 0.00, 0.00],  // 0: forced safe (Level 0)
  [0.55, 0.35, 0.08, 0.02],  // 1: difficulty 1–3
  [0.18, 0.42, 0.30, 0.10],  // 2: difficulty 4–6
  [0.05, 0.18, 0.44, 0.33],  // 3: difficulty 7–9
  [0.03, 0.07, 0.32, 0.58],  // 4: difficulty 10+
];

function _pickWeighted(rng, weights) {
  let r = rng(), c = 0;
  for (let i = 0; i < weights.length; i++) { c += weights[i]; if (r < c) return i; }
  return weights.length - 1;
}

const _LEVEL_POOL = [4,6,7,8,9,11,13,16,22,26,31,37,41,52,74,94,188,333,355,404,666,777,999,1011];
const _BIOME_NAMES = ['backrooms', 'ruins', 'poolrooms'];

export function generateLevelData(levelSeed, difficulty) {
  // Level 0 is always the same safe starting room
  if (difficulty === 0) return {
    levelNum: 0, name: 'Level 0', biome: 'backrooms',
    fogMul: 1.0, sanMul: 1.0, batMul: 1.0, lootMul: 1.0,
    ambientMul: 1.0, wallTint: null, elevDist: 1, danger: 1,
  };

  const rng = _lcg(levelSeed ^ 0xba5eba11);

  const levelNum = _LEVEL_POOL[Math.floor(rng() * _LEVEL_POOL.length)];

  const tier = difficulty <= 3 ? 1 : difficulty <= 6 ? 2 : difficulty <= 9 ? 3 : 4;
  const clusterNames = ['safe', 'medium', 'dangerous', 'extreme'];
  const clusterName  = clusterNames[_pickWeighted(rng, _TIER_WEIGHTS[tier])];
  const c = _CLUSTERS[clusterName];

  const biome = _BIOME_NAMES[_pickWeighted(rng, c.biomeWeights)];

  const fogMul     = _rlerp(rng, c.fogMul[0],     c.fogMul[1]);
  const sanMul     = _rlerp(rng, c.sanMul[0],     c.sanMul[1]);
  const batMul     = _rlerp(rng, c.batMul[0],     c.batMul[1]);
  const lootMul    = _rlerp(rng, c.lootMul[0],    c.lootMul[1]);
  const ambientMul = _rlerp(rng, c.ambientMul[0], c.ambientMul[1]);

  // Wall tint: base biome color ± small random variation
  const wallTint = _wallTint(rng, biome);

  // Danger 1–5: base from cluster + rare +1 spike
  const danger = Math.min(5, c.dangerBase + (rng() < 0.2 ? 1 : 0));

  return {
    levelNum, name: `Level ${levelNum}`, biome,
    fogMul, sanMul, batMul, lootMul, ambientMul,
    wallTint, elevDist: c.elevDist, danger,
  };
}

function _wallTint(rng, biome) {
  const bases = { backrooms: [0xe4,0xe6,0xa8], ruins: [0x88,0x66,0x44], poolrooms: [0x88,0xcc,0xee] };
  const [br, bg, bb] = bases[biome] ?? bases.backrooms;
  const v = 28;
  const clamp = (x) => Math.min(255, Math.max(0, x));
  const r = clamp(br + Math.round((rng() - 0.5) * v * 2));
  const g = clamp(bg + Math.round((rng() - 0.5) * v * 2));
  const b = clamp(bb + Math.round((rng() - 0.5) * v * 2));
  return (r << 16) | (g << 8) | b;
}

export const LIGHT = {
  flickerHz: 1.1,
  flickerIntensity: 0.04,
  dropChance: 0.0,
  fixtureIntensity: 9.0,
  fixtureColor: 0xffdca0,
  fixtureDistance: 16,
  ambientIntensity: 1.5,
};

export const AUDIO = {
  footstep: { walk: 0.4, run: 0.7, crouch: 0.12 },
  footstepIntervalWalk: 0.45,
  footstepIntervalRun: 0.3,
  footstepIntervalCrouch: 0.7,
};

export const ENTITY = {
  smilerSpeed: 2.6,
  smilerRetreatSpeed: 4.0,
  smilerContactDist: 0.9,
  smilerSanityDPS: 18,       // sanity drained per second on contact
  smilerFlashRange: 9,
  smilerFlashCone: Math.cos(Math.PI / 7),
};

export const UI = {
  chatTimeoutMs: 5000,
  respawnDelayMs: 5000,
};
