// Small hand-painted-in-code textures for the house: stained plaster over a wood wainscot, warped floor
// boards, a water-stained ceiling and an old door. Drawn pixel by pixel and shown with nearest filtering so
// they sit with the pixelfx effects.
import * as THREE from "three";
import { mulberry } from "./maze.js";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const rgb = (r, g, b) => [r, g, b];
const shade = ([r, g, b], k) => [r * k, g * k, b * k];

function paint(w, h, seed, fn) {
  const c = canvas(w, h), ctx = c.getContext("2d"), img = ctx.createImageData(w, h), rand = mulberry(seed);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y, rand);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

// value noise on a lattice, tiling over (w, h)
function noise2(seed, cell, w, h) {
  const r = mulberry(seed), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), v = [];
  for (let i = 0; i < cw * ch; i++) v.push(r());
  const g = (x, y) => v[((y % ch) + ch) % ch * cw + (((x % cw) + cw) % cw)];
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx, b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export function wallTexture(seed = 3) {
  const W = 64, H = 80, plaster = rgb(118, 108, 92), wood = rgb(62, 40, 28);
  const n1 = noise2(seed, 8, W, H), n2 = noise2(seed + 1, 3, W, H), stain = noise2(seed + 2, 16, W, H);
  const drips = [];
  const r = mulberry(seed + 9);
  for (let i = 0; i < 7; i++) drips.push({ x: Math.floor(r() * W), len: 8 + r() * 40, w: r() < 0.3 ? 2 : 1 });
  const cracks = new Set();
  let cx = 40, cy = 6;
  for (let i = 0; i < 26; i++) {
    cracks.add(cx + "," + cy);
    cy++;
    cx += r() < 0.3 ? -1 : r() < 0.6 ? 1 : 0;
    cx = Math.max(0, Math.min(W - 1, cx));
  }
  const c = paint(W, H, seed, (x, y, rand) => {
    const panel = y >= 54;
    let col;
    if (panel) {
      // wainscot: vertical boards with a rail on top
      const board = Math.floor(x / 8), edge = x % 8 === 0;
      col = shade(wood, 0.85 + 0.25 * n2(x * 0.4, y * 3 + board * 7));
      if (edge) col = shade(wood, 0.5);
      if (y === 54 || y === 55) col = shade(wood, y === 54 ? 1.35 : 0.7);
      if (y >= H - 3) col = shade(wood, 0.45);
    } else {
      col = shade(plaster, 0.78 + 0.22 * n1(x, y) + 0.08 * (n2(x, y) - 0.5));
      // damp and smoke stains
      const s = stain(x, y);
      if (s > 0.62) col = shade(col, 1 - (s - 0.62) * 1.6);
      if (y < 10) col = shade(col, 0.7 + y * 0.03);
      for (const d of drips) if (x >= d.x && x < d.x + d.w && y < d.len) col = shade(col, 0.62 + (y / d.len) * 0.3);
      if (cracks.has(x + "," + y)) col = shade(col, 0.35);
    }
    if (rand() < 0.04) col = shade(col, 0.88);
    return col;
  });
  return toTexture(c);
}

export function floorTexture(seed = 5) {
  const W = 64, H = 64, base = rgb(70, 50, 36);
  const grain = noise2(seed, 2, W, H), stain = noise2(seed + 3, 21, W, H), r = mulberry(seed);
  const tones = Array.from({ length: 8 }, () => 0.75 + r() * 0.4), offs = Array.from({ length: 8 }, () => Math.floor(r() * 64));
  const c = paint(W, H, seed, (x, y, rand) => {
    const b = Math.floor(x / 8), lx = x % 8;
    let col = shade(base, tones[b] * (0.85 + 0.25 * grain(x * 3, y * 0.4)));
    if (lx === 0) col = shade(base, 0.35);
    if ((y + offs[b]) % 64 === 0) col = shade(base, 0.4);
    if (lx === 7) col = shade(col, 0.82);
    const s = stain(x, y);
    if (s > 0.7) col = [col[0] * 0.9 + (s - 0.7) * 120, col[1] * (1 - (s - 0.7) * 2), col[2] * (1 - (s - 0.7) * 2)];
    if (rand() < 0.03) col = shade(col, 0.8);
    return col;
  });
  return toTexture(c, true);
}

export function ceilingTexture(seed = 8) {
  const W = 64, H = 64, base = rgb(64, 62, 58), n = noise2(seed, 6, W, H), s = noise2(seed + 1, 20, W, H);
  const c = paint(W, H, seed, (x, y, rand) => {
    let col = shade(base, 0.8 + 0.3 * n(x, y));
    const v = s(x, y);
    if (v > 0.6 && v < 0.64) col = rgb(70, 52, 34);
    else if (v > 0.64) col = shade([92, 76, 54], 0.7 + 0.2 * n(x, y));
    if (x % 32 === 0 || y % 32 === 0) col = shade(col, 0.6);
    if (rand() < 0.04) col = shade(col, 0.85);
    return col;
  });
  return toTexture(c, true);
}

export function doorTexture(seed = 11) {
  const W = 32, H = 64, wood = rgb(54, 32, 22), n = noise2(seed, 2, W, H);
  const c = paint(W, H, seed, (x, y) => {
    let col = shade(wood, 0.8 + 0.3 * n(x * 2, y * 0.3));
    const frame = x < 2 || x > W - 3 || y < 2;
    if (frame) col = shade(wood, 0.45);
    const inPanel = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    for (const [x0, y0, x1, y1] of [[5, 6, 14, 28], [17, 6, 26, 28], [5, 33, 14, 58], [17, 33, 26, 58]]) {
      if (inPanel(x0, y0, x1, y1)) col = shade(col, 0.82);
      if ((x === x0 || y === y0) && inPanel(x0, y0, x1, y1)) col = shade(wood, 0.4);
      if ((x === x1 || y === y1) && inPanel(x0, y0, x1, y1)) col = shade(wood, 1.3);
    }
    // a brass knob
    if ((x - 25) ** 2 + (y - 34) ** 2 <= 2) col = x + y < 59 ? rgb(232, 192, 96) : rgb(140, 100, 40);
    return col;
  });
  return toTexture(c);
}

/** A soft round glow, for eyes in the dark. */
export function glowTexture(color = [255, 40, 30]) {
  const S = 16, c = canvas(S, S), ctx = c.getContext("2d"), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
      const a = d < 0.28 ? 1 : Math.max(0, 1 - d) ** 2 * 0.9;
      const i = (y * S + x) * 4, hot = d < 0.2;
      img.data[i] = hot ? 255 : color[0];
      img.data[i + 1] = hot ? 220 : color[1];
      img.data[i + 2] = hot ? 200 : color[2];
      img.data[i + 3] = a * 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
