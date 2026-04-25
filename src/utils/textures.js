// Procedural canvas textures. All deterministic, no asset files required.
// Visual knobs live in `src/textureConfig.js` — tweak there.

import * as THREE from 'three';
import { TEXTURES } from '../textureConfig.js';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finalize(canvas, { repeat = [1, 1], anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function addNoise(ctx, w, h, { amount, dotAlpha, dotCount }) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i]     = clamp255(d[i]     + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${dotAlpha})`;
  for (let i = 0; i < dotCount; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rand(min, max) { return min + Math.random() * (max - min); }

// ---------- Office plaster ----------
export function makeOfficePlasterTexture() {
  const cfg = TEXTURES.officeWall;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = cfg.baseColor;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  // Horizontal drywall joints
  ctx.fillStyle = `rgba(0,0,0,${cfg.jointAlpha})`;
  for (let y = 0; y < cfg.size; y += cfg.jointSpacingPx) ctx.fillRect(0, y, cfg.size, 1);

  // Vertical stud-bay lines
  ctx.fillStyle = `rgba(0,0,0,${cfg.studAlpha})`;
  for (let x = 0; x < cfg.size; x += cfg.studSpacingPx) ctx.fillRect(x, 0, 1, cfg.size);

  const [sr, sg, sb] = cfg.smudgeColor;
  for (let i = 0; i < cfg.smudgeCount; i++) {
    const x = Math.random() * cfg.size;
    const y = Math.random() * cfg.size;
    const r = rand(cfg.smudgeRadiusRange[0], cfg.smudgeRadiusRange[1]);
    const a = rand(cfg.smudgeAlphaRange[0], cfg.smudgeAlphaRange[1]);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   `rgba(${sr},${sg},${sb},${a})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  addNoise(ctx, cfg.size, cfg.size, cfg.noise);
  return finalize(c, { repeat: cfg.repeat, anisotropy: cfg.anisotropy });
}

// ---------- Office carpet ----------
export function makeOfficeCarpetTexture() {
  const cfg = TEXTURES.officeFloor;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = cfg.baseColor;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  // Carpet-tile grid lines
  ctx.fillStyle = `rgba(0,0,0,${cfg.tileLineAlpha})`;
  for (let y = 0; y < cfg.size; y += cfg.tileSpacingPx) ctx.fillRect(0, y, cfg.size, 1);
  for (let x = 0; x < cfg.size; x += cfg.tileSpacingPx) ctx.fillRect(x, 0, 1, cfg.size);

  for (let i = 0; i < cfg.fiberCount; i++) {
    const x = Math.random() * cfg.size, y = Math.random() * cfg.size;
    const shade = cfg.fiberShadeBase + Math.random() * cfg.fiberShadeRange;
    const a = rand(cfg.fiberAlphaRange[0], cfg.fiberAlphaRange[1]);
    ctx.fillStyle = `rgba(${shade + 50},${shade + 50},${shade + 50},${a})`;
    ctx.fillRect(x, y, 1, 1 + Math.random() * 2);
  }

  addNoise(ctx, cfg.size, cfg.size, cfg.noise);
  return finalize(c, { repeat: cfg.repeat, anisotropy: cfg.anisotropy });
}

// ---------- Caution tape ----------
export function makeCautionTexture() {
  const cfg = TEXTURES.caution;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = cfg.yellow;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  ctx.fillStyle = cfg.black;
  const sw = cfg.stripeWidth;
  // Diagonal stripes (45°)
  for (let i = -(cfg.size); i < cfg.size * 2; i += sw * 2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + cfg.size, cfg.size);
    ctx.lineTo(i + cfg.size + sw, cfg.size);
    ctx.lineTo(i + sw, 0);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Wallpaper ----------
export function makeWallTexture() {
  const cfg = TEXTURES.wall;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  const grd = ctx.createLinearGradient(0, 0, 0, cfg.size);
  const stops = cfg.gradient;
  stops.forEach((col, i) => grd.addColorStop(i / (stops.length - 1), col));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  ctx.fillStyle = `rgba(0,0,0,${cfg.bandAlpha})`;
  for (let y = 0; y < cfg.size; y += cfg.bandSpacingPx) ctx.fillRect(0, y, cfg.size, 1);

  ctx.fillStyle = `rgba(0,0,0,${cfg.seamAlpha})`;
  for (let x = 0; x < cfg.size; x += cfg.seamSpacingPx) ctx.fillRect(x, 0, 1, cfg.size);

  const [sr, sg, sb] = cfg.stainColor;
  for (let i = 0; i < cfg.stainCount; i++) {
    const x = Math.random() * cfg.size;
    const y = Math.random() * cfg.size;
    const r = rand(cfg.stainRadiusRange[0], cfg.stainRadiusRange[1]);
    const a = rand(cfg.stainAlphaRange[0], cfg.stainAlphaRange[1]);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   `rgba(${sr},${sg},${sb},${a})`);
    g.addColorStop(0.6, `rgba(${sr + 30},${sg + 25},${sb + 10},${a * 0.4})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  addNoise(ctx, cfg.size, cfg.size, cfg.noise);
  return finalize(c, { repeat: cfg.repeat, anisotropy: cfg.anisotropy });
}

// ---------- Carpet ----------
export function makeFloorTexture() {
  const cfg = TEXTURES.floor;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = cfg.baseColor;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  for (let i = 0; i < cfg.fiberCount; i++) {
    const x = Math.random() * cfg.size, y = Math.random() * cfg.size;
    const shade = cfg.fiberShadeBase + Math.random() * cfg.fiberShadeRange;
    const a = rand(cfg.fiberAlphaRange[0], cfg.fiberAlphaRange[1]);
    ctx.fillStyle = `rgba(${shade + 40},${shade + 25},${shade},${a})`;
    ctx.fillRect(x, y, 1, 2 + Math.random() * 2);
  }

  for (let i = 0; i < cfg.dampPatchCount; i++) {
    const x = Math.random() * cfg.size;
    const y = Math.random() * cfg.size;
    const r = rand(cfg.dampPatchRadiusRange[0], cfg.dampPatchRadiusRange[1]);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${cfg.dampAlpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  addNoise(ctx, cfg.size, cfg.size, cfg.noise);
  return finalize(c, { repeat: cfg.repeat, anisotropy: cfg.anisotropy });
}

// ---------- Ceiling ----------
export function makeCeilingTexture() {
  const cfg = TEXTURES.ceiling;
  const c = makeCanvas(cfg.size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = cfg.baseColor;
  ctx.fillRect(0, 0, cfg.size, cfg.size);

  ctx.strokeStyle = cfg.seamColor;
  ctx.lineWidth = cfg.seamWidthPx;
  ctx.strokeRect(0, 0, cfg.size, cfg.size);

  ctx.fillStyle = `rgba(0,0,0,${cfg.perfAlpha})`;
  for (let y = cfg.perfStartPx; y < cfg.size; y += cfg.perfSpacingPx) {
    for (let x = cfg.perfStartPx; x < cfg.size; x += cfg.perfSpacingPx) {
      ctx.beginPath(); ctx.arc(x, y, cfg.perfRadiusPx, 0, Math.PI * 2); ctx.fill();
    }
  }

  const [sr, sg, sb] = cfg.stainColor;
  for (let i = 0; i < cfg.stainCount; i++) {
    const x = Math.random() * cfg.size;
    const y = Math.random() * cfg.size;
    const r = rand(cfg.stainRadiusRange[0], cfg.stainRadiusRange[1]);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${sr},${sg},${sb},${cfg.stainAlpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  addNoise(ctx, cfg.size, cfg.size, cfg.noise);
  return finalize(c, { repeat: cfg.repeat, anisotropy: cfg.anisotropy });
}
