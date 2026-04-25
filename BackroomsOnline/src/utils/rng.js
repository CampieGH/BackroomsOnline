// Mulberry32 seeded PRNG.
// Returns a function () => [0, 1) identical to Math.random() but deterministic.
// Passing the same seed gives the same sequence on every client — required for
// Level 0 maze generation to be identical for all players.

export function seededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    s |= 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
