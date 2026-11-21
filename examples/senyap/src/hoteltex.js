// The hotel's surfaces: faded wallpaper over a wood dado, dark lobby panelling, basement concrete, a
// patterned corridor carpet, a chequered lobby floor, bathroom tiles, numbered doors, metal service doors and
// signs. Text is set in pixelfx's own pixel font so it matches the HUD.
import * as THREE from "three";
import { createFrame, painterFor, composite, hex } from "../../../src/core/index.js";
import { canvas, toTexture, rgb, shade, paint, noise2 } from "./textures.js";
import { mulberry } from "./maze.js";

/** Pixel text drawn into a 2D canvas context. */
export function pixelText(ctx, str, x, y, color, { font = "mini", scale = 1, align = "center", shadow } = {}) {
  const f = createFrame(ctx.canvas.width, ctx.canvas.height);
  const p = painterFor(f).place(0, 0);
  p.text(str, x, y, hex(color), { font, scale, align, shadow: shadow ? hex(shadow) : undefined });
  const img = new ImageData(f.w, f.h);
  composite(f, img.data, null);
  const tmp = canvas(f.w, f.h);
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

export function wallpaper(seed = 21) {
  return once("paper" + seed, () => {
    const W = 64, H = 90, n = noise2(seed, 6, W, H), stain = noise2(seed + 4, 18, W, H);
    const base = rgb(104, 92, 66), stripe = rgb(86, 64, 52), wood = rgb(58, 36, 26);
    const r = mulberry(seed), drips = Array.from({ length: 5 }, () => ({ x: Math.floor(r() * W), len: 10 + r() * 40 }));
    return toTexture(
      paint(W, H, seed, (x, y, rand) => {
        if (y >= 62) {
          let c = shade(wood, 0.85 + 0.2 * n(x * 3, y));
          if (x % 16 === 0) c = shade(wood, 0.55);
          if (y === 62 || y === 63) c = shade(wood, y === 62 ? 1.4 : 0.6);
          if (y > H - 4) c = shade(wood, 0.45);
          return c;
        }
        // stripes with a small damask diamond between them
        const sx = x % 16, motif = Math.abs(sx - 8) + Math.abs((y % 16) - 8) < 4 && sx > 3 && sx < 13;
        let c = sx < 2 ? stripe : motif ? shade(base, 0.82) : base;
        c = shade(c, 0.82 + 0.25 * n(x, y));
        const s = stain(x, y);
        if (s > 0.6) c = shade(c, 1 - (s - 0.6) * 1.5);
        for (const d of drips) if (x === d.x && y < d.len) c = shade(c, 0.6 + (y / d.len) * 0.35);
        if (y < 6) c = shade(c, 0.7 + y * 0.05);
        if (rand() < 0.03) c = shade(c, 0.86);
        return c;
      }),
    );
  });
}

export function panelling(seed = 22) {
  return once("panel", () => {
    const W = 64, H = 90, n = noise2(seed, 2, W, H), wood = rgb(64, 40, 28);
    return toTexture(
      paint(W, H, seed, (x, y, rand) => {
        let c = shade(wood, 0.8 + 0.3 * n(x * 2, y * 0.35));
        const px = x % 32, py = y % 45;
        if (px === 0 || py === 0) c = shade(wood, 0.45);
        if (px === 3 || py === 3) c = shade(wood, 1.25);
        if (px === 29 || py === 42) c = shade(wood, 0.6);
        if (y < 4) c = shade(wood, 1.4);
        if (rand() < 0.02) c = shade(c, 0.85);
        return c;
      }),
    );
  });
}

export function concrete(seed = 23) {
  return once("concrete", () => {
    const W = 64, H = 90, n = noise2(seed, 5, W, H), m = noise2(seed + 2, 2, W, H), s = noise2(seed + 3, 16, W, H);
    return toTexture(
      paint(W, H, seed, (x, y) => {
        let c = shade(rgb(96, 94, 88), 0.72 + 0.25 * n(x, y) + 0.1 * (m(x, y) - 0.5));
        if (y % 30 === 0) c = shade(c, 0.7);
        const v = s(x, y);
        if (v > 0.62) c = [c[0] * 0.9, c[1] * 0.85, c[2] * 0.7];
        if (y > 76) c = shade(c, 0.75);
        if (y > 74 && y < 78) c = rgb(150, 126, 40);
        return c;
      }),
    );
  });
}

export function carpet(seed = 24) {
  return once("carpet", () => {
    const W = 32, H = 32, n = noise2(seed, 2, W, H);
    return toTexture(
      paint(W, H, seed, (x, y, rand) => {
        const red = rgb(108, 28, 30), gold = rgb(150, 112, 48), dark = rgb(60, 14, 18);
        const cx = (x % 16) - 8, cy = (y % 16) - 8, d = Math.abs(cx) + Math.abs(cy);
        let c = d === 6 ? gold : d < 3 ? dark : (x + y) % 16 === 0 ? shade(gold, 0.7) : red;
        c = shade(c, 0.8 + 0.3 * n(x * 2, y * 2));
        if (rand() < 0.06) c = shade(c, 0.75);
        return c;
      }),
      true,
    );
  });
}

export function roomCarpet(seed = 25) {
  return once("roomcarpet", () => {
    const W = 32, H = 32, n = noise2(seed, 2, W, H);
    return toTexture(paint(W, H, seed, (x, y, rand) => shade(rgb(70, 74, 58), 0.8 + 0.3 * n(x * 2, y * 2) - (rand() < 0.05 ? 0.15 : 0))), true);
  });
}

export function marble(seed = 26) {
  return once("marble", () => {
    const W = 32, H = 32, n = noise2(seed, 4, W, H), v = noise2(seed + 1, 8, W, H);
    return toTexture(
      paint(W, H, seed, (x, y) => {
        const dark = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 1;
        let c = dark ? rgb(44, 40, 38) : rgb(150, 140, 124);
        c = shade(c, 0.85 + 0.2 * n(x, y));
        const vein = Math.abs(v(x, y) - 0.5) < 0.025;
        if (vein) c = shade(c, dark ? 1.6 : 0.7);
        if (x % 16 === 0 || y % 16 === 0) c = shade(c, 0.6);
        return c;
      }),
      true,
    );
  });
}

export function tiles(seed = 27) {
  return once("tiles", () => {
    const W = 32, H = 32, n = noise2(seed, 3, W, H);
    return toTexture(
      paint(W, H, seed, (x, y) => {
        let c = shade(rgb(150, 156, 150), 0.85 + 0.15 * n(x, y));
        if (x % 8 === 0 || y % 8 === 0) c = rgb(70, 72, 64);
        return c;
      }),
      true,
    );
  });
}

export function concreteFloor(seed = 28) {
  return once("cfloor", () => {
    const W = 32, H = 32, n = noise2(seed, 4, W, H), s = noise2(seed + 1, 12, W, H);
    return toTexture(
      paint(W, H, seed, (x, y) => {
        let c = shade(rgb(80, 78, 72), 0.75 + 0.3 * n(x, y));
        if (s(x, y) > 0.68) c = shade(c, 0.6);
        return c;
      }),
      true,
    );
  });
}

export function ceiling(seed = 29) {
  return once("ceil", () => {
    const W = 32, H = 32, n = noise2(seed, 4, W, H), s = noise2(seed + 1, 14, W, H);
    return toTexture(
      paint(W, H, seed, (x, y) => {
        let c = shade(rgb(120, 116, 104), 0.6 + 0.25 * n(x, y));
        if (x % 16 === 0 || y % 16 === 0) c = shade(c, 0.6);
        const v = s(x, y);
        if (v > 0.66) c = [c[0] * 0.9, c[1] * 0.78, c[2] * 0.55];
        return c;
      }),
      true,
    );
  });
}

/** A hotel room door, with a brass number plate. */
export function doorTex(label = "", { burnt = false, metal = false } = {}) {
  return once(`door${label}${burnt}${metal}`, () => {
    const W = 32, H = 72, n = noise2(label.length * 7 + 3, 2, W, H);
    const wood = metal ? rgb(84, 90, 92) : burnt ? rgb(30, 22, 18) : rgb(92, 52, 30);
    const c = paint(W, H, 31, (x, y) => {
      let col = shade(wood, (metal ? 0.9 : 0.8) + (metal ? 0.1 : 0.3) * n(x * 2, y * 0.3));
      if (x < 2 || x > W - 3 || y < 2) col = shade(wood, 0.5);
      if (!metal)
        for (const [x0, y0, x1, y1] of [[6, 22, 25, 42], [6, 48, 25, 66]]) {
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) col = shade(col, 0.85);
          if ((x === x0 || y === y0) && x >= x0 && x <= x1 && y >= y0 && y <= y1) col = shade(wood, 0.5);
          if ((x === x1 || y === y1) && x >= x0 && x <= x1 && y >= y0 && y <= y1) col = shade(wood, 1.3);
        }
      if ((x - 25) ** 2 + (y - 40) ** 2 <= 2) col = rgb(220, 180, 90);
      if (burnt && n(x * 4, y) > 0.55) col = shade(col, 0.4);
      return col;
    });
    const ctx = c.getContext("2d");
    if (label && label.length <= 6) {
      const w = Math.min(28, 6 + label.length * 4);
      ctx.fillStyle = metal ? "#d8d4c0" : burnt ? "#3a2a18" : "#b08a3a";
      ctx.fillRect(16 - w / 2, 8, w, 9);
      ctx.fillStyle = metal ? "#3a3a36" : "#5a4018";
      ctx.fillRect(16 - w / 2, 16, w, 1);
      pixelText(ctx, label, 16, 10, metal ? "#202020" : burnt ? "#000000" : "#2a1808");
    }
    return toTexture(c);
  });
}

/** A sign: dark plate with light text, or a lit green exit sign. */
export function signTex(text, { exit = false, scale = 1 } = {}) {
  return once(`sign${text}${exit}`, () => {
    const w = Math.max(24, text.length * 4 + 8), h = 11;
    const c = canvas(w, h), ctx = c.getContext("2d");
    ctx.fillStyle = exit ? "#0c3a1c" : "#1a1814";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = exit ? "#1c6a30" : "#5a5448";
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, h - 1, w, 1);
    pixelText(ctx, text, w / 2, 3, exit ? "#b8ffc8" : "#d8d0b8", { scale });
    const t = toTexture(c);
    t.userData = { aspect: w / h };
    return t;
  });
}

/** The lobby clock's face, hands at h:m. */
export function clockTex(h, m) {
  const S = 32, c = canvas(S, S), ctx = c.getContext("2d");
  ctx.fillStyle = "#2a2018";
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8ccb0";
  ctx.beginPath();
  ctx.arc(16, 16, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2018";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(16 + Math.sin(a) * 11 - 0.5, 16 - Math.cos(a) * 11 - 0.5, 1.5, 1.5);
  }
  const hand = (a, len, w) => {
    ctx.strokeStyle = "#140c08";
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(16 + Math.sin(a) * len, 16 - Math.cos(a) * len);
    ctx.stroke();
  };
  hand(((h % 12) / 12 + m / 720) * Math.PI * 2, 7, 2);
  hand((m / 60) * Math.PI * 2, 10.5, 1.2);
  const t = toTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** A sheet of paper with a few lines of handwriting, for notes, the register and the memo. */
export function paperTex(lines = 6, seed = 1) {
  return once(`paper${lines}${seed}`, () => {
    const r = mulberry(seed);
    return toTexture(
      paint(16, 20, seed, (x, y) => {
        const line = y > 2 && y % 3 === 0 && y < 3 + lines * 3 && x > 1 && x < 14 - Math.floor(r() * 3);
        return line ? rgb(60, 60, 90) : shade(rgb(214, 204, 176), 0.9 + r() * 0.1);
      }),
    );
  });
}

/** A flat color texture-free material helper. */
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
