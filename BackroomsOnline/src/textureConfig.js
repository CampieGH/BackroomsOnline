// All knobs for procedural textures live here.
// Add `office*` sections for the hub, and `caution` for the tape barrier.
// Tweak numbers/colours and reload — `utils/textures.js` reads from this.
//
// `repeat` is the default UV repeat for that texture (each surface can still
// override via `tex.repeat.set(x, y)` after creation, like Hub does).

export const TEXTURES = {
  // ---------- Office plaster (hub walls) ----------
  officeWall: {
    size: 256,
    repeat: [5, 2],
    anisotropy: 8,
    baseColor: '#dddbd0',          // warm off-white
    // Horizontal joint lines (drywall boards)
    jointSpacingPx: 64,
    jointAlpha: 0.07,
    // Vertical stud lines
    studSpacingPx: 128,
    studAlpha: 0.04,
    // Smudges / scuff marks
    smudgeCount: 0,
    smudgeColor: [80, 70, 60],
    smudgeAlphaRange: [0.05, 0.14],
    smudgeRadiusRange: [15, 50],
    noise: { amount: 10, dotAlpha: 0.03, dotCount: 60 },
  },

  // ---------- Grey office carpet (hub floor) ----------
  officeFloor: {
    size: 256,
    repeat: [10, 10],
    anisotropy: 8,
    baseColor: '#8a877e',          // medium grey-beige
    // Subtle tile grid (carpet tiles are usually 50×50 cm)
    tileSpacingPx: 64,
    tileLineAlpha: 0.12,
    fiberCount: 4000,
    fiberShadeBase: 20,
    fiberShadeRange: 40,
    fiberAlphaRange: [0.08, 0.25],
    noise: { amount: 8, dotAlpha: 0.02, dotCount: 60 },
  },

  // ---------- Caution tape (no-clip barrier) ----------
  caution: {
    size: 128,
    stripeWidth: 18,               // px, black diagonal stripes
    stripeAngle: 45,               // degrees
    yellow: '#ffd700',
    black: '#111111',
  },

  // ---------- Yellow wallpaper (walls) ----------
  wall: {
    size: 512,
    repeat: [2, 1],
    anisotropy: 8,
    // Vertical gradient from top → middle → bottom
    gradient: ['#e8b43d', '#d9a237', '#c8912b'],
    // Horizontal "ribbed" wallpaper bands
    bandSpacingPx: 8,
    bandAlpha: 0.05,
    // Vertical wallpaper-strip seams
    seamSpacingPx: 128,
    seamAlpha: 0.18,
    // Brown stains (count + base colour + alpha range)
    stainCount: 0,
    stainColor: [60, 30, 10],
    stainAlphaRange: [0.08, 0.23],
    stainRadiusRange: [20, 100],
    // Noise overlay
    noise: { amount: 16, dotAlpha: 0.05, dotCount: 120 },
  },

  // ---------- Damp carpet (floor) ----------
  floor: {
    size: 512,
    repeat: [8, 8],
    anisotropy: 8,
    baseColor: '#4d3a1c',
    // Fibrous specks
    fiberCount: 9000,
    fiberShadeBase: 20,
    fiberShadeRange: 60,
    fiberAlphaRange: [0.15, 0.45],
    // Damp dark patches
    dampPatchCount: 0,
    dampPatchRadiusRange: [40, 120],
    dampAlpha: 0,
    noise: { amount: 10, dotAlpha: 0.03, dotCount: 120 },
  },

  // ---------- Ceiling tiles ----------
  ceiling: {
    size: 256,
    repeat: [10, 10],
    anisotropy: 8,
    baseColor: '#cbbfa0',
    seamColor: 'rgba(0,0,0,0.35)',
    seamWidthPx: 2,
    // Perforation dots
    perfSpacingPx: 12,
    perfStartPx: 16,
    perfRadiusPx: 1.2,
    perfAlpha: 0.12,
    // Yellow stains
    stainCount: 0,
    stainColor: [120, 80, 20],
    stainAlpha: 0.25,
    stainRadiusRange: [20, 50],
    noise: { amount: 8, dotAlpha: 0.02, dotCount: 80 },
  },
};
