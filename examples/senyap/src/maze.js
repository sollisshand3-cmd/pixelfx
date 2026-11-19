// The house: a tile grid (1 wall, 0 floor) carved as a maze with a few extra openings so a chase is never
// one long dead end, plus breadth-first paths over it for the thing that hunts you.

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeMaze(cells, rand, extraOpenings = 0.12) {
  const W = cells * 2 + 1, H = W;
  const g = new Uint8Array(W * H).fill(1);
  const at = (x, y) => y * W + x;
  const seen = new Uint8Array(cells * cells);
  const stack = [[0, 0]];
  seen[0] = 1;
  g[at(1, 1)] = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = dirs.filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen[ny * cells + nx];
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(rand() * options.length)];
    const nx = cx + dx, ny = cy + dy;
    seen[ny * cells + nx] = 1;
    g[at(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = 0;
    g[at(nx * 2 + 1, ny * 2 + 1)] = 0;
    stack.push([nx, ny]);
  }
  // knock through some inner walls that sit between two corridors, never at a corner post
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (!g[at(x, y)] || (x % 2 === 0 && y % 2 === 0)) continue;
      const h = !g[at(x - 1, y)] && !g[at(x + 1, y)], v = !g[at(x, y - 1)] && !g[at(x, y + 1)];
      if ((h || v) && rand() < extraOpenings) g[at(x, y)] = 0;
    }
  return { W, H, g, wall: (x, y) => x < 0 || y < 0 || x >= W || y >= H || g[at(x, y)] === 1 };
}

/** Breadth-first distances from a tile, -1 where it can't reach. */
export function distances(m, sx, sy) {
  const d = new Int32Array(m.W * m.H).fill(-1);
  const q = [sx + sy * m.W];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % m.W, y = (c / m.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (m.wall(nx, ny)) continue;
      const n = nx + ny * m.W;
      if (d[n] < 0) {
        d[n] = d[c] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

/** The tiles from (sx, sy) to (tx, ty), first step first; empty when there is none. */
export function path(m, sx, sy, tx, ty) {
  const d = distances(m, tx, ty);
  if (d[sx + sy * m.W] < 0) return [];
  const out = [];
  let x = sx, y = sy;
  while (x !== tx || y !== ty) {
    let best = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (m.wall(nx, ny)) continue;
      const v = d[nx + ny * m.W];
      if (v >= 0 && v < d[x + y * m.W] && (!best || v < best[2])) best = [nx, ny, v];
    }
    if (!best) break;
    x = best[0];
    y = best[1];
    out.push([x, y]);
  }
  return out;
}

export function floorTiles(m) {
  const out = [];
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (!m.wall(x, y)) out.push([x, y]);
  return out;
}

export function isDeadEnd(m, x, y) {
  let w = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.wall(x + dx, y + dy)) w++;
  return w === 3;
}
