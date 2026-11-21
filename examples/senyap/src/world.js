// Builds Hotel Seri Malam from the floor data: every floor is in the scene at once, stacked LEVEL_GAP
// metres apart (so the security cameras can look at any of them), with doors that swing, lifts with lit
// cabins, furniture that blocks you and your sight, and the lights the story dims and flickers.
import * as THREE from "three";
import { FLOORS, FLOOR, T, WALL_H, LEVEL_GAP, LIGHTS, CAMERAS } from "./data/maps.js";
import * as tex from "./hoteltex.js";
import { glowTexture } from "./textures.js";
import { FxSprite } from "./fxsprite.js";
import { t as t_ } from "./i18n.js";
import * as rain from "../../../src/fx/weather/rain.js";
import * as candleFx from "../../../src/fx/fire/candle.js";
import * as keyGlint from "../../../src/fx/pickups/key-glint.js";
import * as eyeballFx from "../../../src/fx/critters/eyeball.js";
import * as graspingHands from "../../../src/fx/shadow/grasping-hands.js";
import * as collectBurst from "../../../src/fx/pickups/collect-burst.js";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const FACE_VEC = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const BRASS = [ "#140c04", "#3a2408", "#6a4614", "#a87a2a", "#e0b450", "#ffe08a", "#fff4c8", "#ffffff" ];
const RED_IRIS = ["#2a0606", "#6a0c0c", "#b01818", "#ff3a2a", "#ffd0a0"];

const M = {
  wood: tex.mat(0x5a3a24),
  darkWood: tex.mat(0x2e1e14),
  white: tex.mat(0x9e9a90),
  sheet: tex.mat(0x8c887e),
  burnt: tex.mat(0x161210, { roughness: 1 }),
  metal: tex.mat(0x6a7074, { metalness: 0.4, roughness: 0.5 }),
  darkMetal: tex.mat(0x30343a, { metalness: 0.5, roughness: 0.5 }),
  brass: tex.mat(0xb08a3a, { metalness: 0.7, roughness: 0.35 }),
  fabric: tex.mat(0x5a2a2a),
  green: tex.mat(0x1e3a1e),
  pot: tex.mat(0x6a3a20),
  black: tex.mat(0x0a0a0a),
  cream: tex.mat(0xc8b898),
  rust: tex.mat(0x5a3a28, { metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.15, metalness: 0.6 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false }),
  curtain: new THREE.MeshStandardMaterial({ color: 0xc8d4d0, transparent: true, opacity: 0.88, side: THREE.DoubleSide, roughness: 0.9 }),
  screen: new THREE.MeshBasicMaterial({ color: 0x18301c }),
  led: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  cabin: new THREE.MeshBasicMaterial({ color: 0xf0e6c8 }),
  cabinWall: tex.mat(0x8a8270, { metalness: 0.3, roughness: 0.6 }),
  fixtureOn: new THREE.MeshBasicMaterial({ color: 0xfff0d0 }),
  fixtureOff: new THREE.MeshBasicMaterial({ color: 0x2a2a26 }),
};
const WALL_MATS = { paper: tex.wallpaper(), panel: tex.panelling(), concrete: tex.concrete() };
const FLOOR_MATS = { marble: tex.marble(), carpet: tex.roomCarpet(), concrete: tex.concreteFloor() };

function boxMesh(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

export class Hotel {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.floors = {};
    this.doors = [];
    this.props = {};
    this.interactables = [];
    this.sprites = [];
    this.oneShots = [];
    this.lights = {};
    this.lifts = {};
    this.curtains = {};
    this.candleLights = [];
    this.powered = true;
    for (const f of FLOORS) this.buildFloor(f);
    this.buildLights();
    this.buildCameras();
  }

  // ---------------------------------------------------------------- coordinates
  levelY(fid) {
    return FLOOR[fid].level * LEVEL_GAP;
  }
  /** Tile units to a world position on a floor, h metres above it. */
  pos(fid, x, y, h = 0) {
    return new THREE.Vector3(x * T, this.levelY(fid) + h, y * T);
  }
  floorOfY(y) {
    let best = "G", d = Infinity;
    for (const f of FLOORS) {
      const e = Math.abs(y - f.level * LEVEL_GAP - 1.5);
      if (e < d) [best, d] = [f.id, e];
    }
    return best;
  }

  // ---------------------------------------------------------------- building
  buildFloor(f) {
    const W = f.map[0].length, H = f.map.length, Y = f.level * LEVEL_GAP;
    const grid = f.map.map((row) => [...row]);
    const F = (this.floors[f.id] = { data: f, W, H, grid, Y, colliders: [], zones: f.zones, group: new THREE.Group() });
    this.root.add(F.group);
    const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? "#" : grid[y][x]);
    const walkable = (c) => c === "." || c === "+";

    // floor, ceiling and the patches that set rooms apart
    const fm = FLOOR_MATS[f.floorMat].clone();
    fm.repeat.set(W, H);
    fm.needsUpdate = true;
    const floorMat = new THREE.MeshStandardMaterial({ map: fm, roughness: 0.9 });
    const plane = (w, h, mat, x, y, z, rx) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.rotation.x = rx;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      F.group.add(p);
      return p;
    };
    plane(W * T, H * T, floorMat, (W * T) / 2, Y, (H * T) / 2, -Math.PI / 2);
    const cm = tex.ceiling().clone();
    cm.repeat.set(W, H);
    cm.needsUpdate = true;
    plane(W * T, H * T, new THREE.MeshStandardMaterial({ map: cm, roughness: 1 }), (W * T) / 2, Y + WALL_H, (H * T) / 2, Math.PI / 2);
    const patch = (z, texture, lift) => {
      const t = texture.clone();
      t.repeat.set((z.x1 - z.x0) * 1.5, (z.y1 - z.y0) * 1.5);
      t.needsUpdate = true;
      plane((z.x1 - z.x0) * T, (z.y1 - z.y0) * T, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), ((z.x0 + z.x1) / 2) * T, Y + lift, ((z.y0 + z.y1) / 2) * T, -Math.PI / 2);
    };
    for (const z of f.zones) {
      if (z.kind === "bath" || z.id === "dobi") patch(z, tex.tiles(), 0.008);
      else if (z.kind === "room" && f.floorMat === "carpet") patch(z, tex.roomCarpet(), 0.004);
    }

    // walls: tiles next to somewhere you can stand
    const walls = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (walkable(c) || c === "E" || c === "Q") continue;
        if (DIRS.some(([dx, dy]) => walkable(ch(x + dx, y + dy)) || ch(x + dx, y + dy) === "Q")) walls.push([x, y]);
      }
    const wt = WALL_MATS[f.wallMat];
    const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.92 });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(T, WALL_H, T), wallMat, walls.length);
    const mtx = new THREE.Matrix4();
    walls.forEach(([x, y], i) => inst.setMatrixAt(i, mtx.makeTranslation((x + 0.5) * T, Y + WALL_H / 2, (y + 0.5) * T)));
    inst.receiveShadow = true;
    F.group.add(inst);
    F.wallMat = wallMat;

    // the face of a special tile: the side that looks onto a corridor
    const faceOf = (x, y) => {
      for (const [dx, dy] of DIRS) if (walkable(ch(x + dx, y + dy))) return { dx, dy };
      return { dx: 0, dy: 1 };
    };
    const facePos = (x, y, { dx, dy }, h, out = 0.012) => new THREE.Vector3((x + 0.5 + dx * 0.5) * T + dx * out, Y + h, (y + 0.5 + dy * 0.5) * T + dy * out);
    const faceRot = ({ dx, dy }) => Math.atan2(dx, dy);

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === "+") this.buildDoor(F, x, y, f.doors?.[`${x},${y}`] ?? {});
        else if (c === "Q") {
          const meta = f.doors?.[`${x},${y}`] ?? {};
          const block = boxMesh(T, WALL_H, T, wallMat);
          block.position.set((x + 0.5) * T, Y + WALL_H / 2, (y + 0.5) * T);
          F.group.add(block);
          const door = this.buildDoor(F, x, y, meta);
          door.hidden = true;
          door.block = block;
          door.group.visible = false;
        } else if (c === "S" || c === "X" || c === "M" || c === "w") {
          const fc = faceOf(x, y), rot = faceRot(fc);
          if (c === "w" || c === "M") {
            const glass = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.94, c === "M" ? 2.4 : 1.6), M.glass);
            glass.position.copy(facePos(x, y, fc, c === "M" ? 1.2 : 1.5));
            glass.rotation.y = rot;
            F.group.add(glass);
            this.windows ??= [];
            this.windows.push({ pos: facePos(x, y, fc, c === "M" ? 1.2 : 1.5, 0.03), rot, w: T * 0.94, h: c === "M" ? 2.4 : 1.6 });
            if (c === "M") {
              const bar = boxMesh(0.06, 2.4, 0.05, M.brass);
              bar.position.copy(facePos(x, y, fc, 1.2, 0.04));
              bar.rotation.y = rot;
              F.group.add(bar);
              this.addInteract({ id: "mainDoor", kind: "mainDoor", floor: f.id, pos: facePos(x, y, fc, 1.1), label: "p.mainDoor", radius: 2 });
            }
          } else {
            const d = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ map: tex.doorTex(c === "S" ? "" : "SERVIS", { metal: true }), roughness: 0.6, metalness: 0.3 }));
            d.position.copy(facePos(x, y, fc, 1.1));
            d.rotation.y = rot;
            F.group.add(d);
            const kind = c === "S" ? "stairs" : "exitDoor";
            this.addInteract({ id: kind === "stairs" ? `stairs_${f.id}` : "exitDoor", kind, floor: f.id, pos: facePos(x, y, fc, 1.1), label: c === "S" ? "ui.stairs" : "p.serviceDoor", radius: 1.9 });
            if (c === "S") F.stairs = { x, y, face: fc };
            this.props[kind === "stairs" ? `stairs_${f.id}` : "exitDoor"] = { floor: f.id, pos: facePos(x, y, fc, 1.4) };
          }
        } else if (c === "E") this.buildLift(F, x, y, faceOf(x, y));
      }

    for (const p of f.props) this.buildProp(F, p);
  }

  buildDoor(F, x, y, meta) {
    const grid = F.grid, Y = F.Y;
    const isWall = (c) => c !== "." && c !== "+";
    const along = isWall(grid[y]?.[x - 1] ?? "#") && isWall(grid[y]?.[x + 1] ?? "#"); // the door spans x
    const cx = (x + 0.5) * T, cz = (y + 0.5) * T;
    const g = new THREE.Group();
    g.position.set(cx, Y, cz);
    if (!along) g.rotation.y = Math.PI / 2;
    F.group.add(g);
    const wallMat = F.wallMat ?? new THREE.MeshStandardMaterial({ map: WALL_MATS[F.data.wallMat] });
    const open = 1.0, side = (T - open) / 2;
    for (const s of [-1, 1]) {
      const pillar = boxMesh(side, WALL_H, T, wallMat);
      pillar.position.set(s * (open / 2 + side / 2), WALL_H / 2, 0);
      g.add(pillar);
    }
    const lintel = boxMesh(open, WALL_H - 2.3, T, wallMat);
    lintel.position.set(0, 2.3 + (WALL_H - 2.3) / 2, 0);
    g.add(lintel);
    // the leaf hangs on a hinge at one side
    const hinge = new THREE.Group();
    hinge.position.set(-open / 2, 0, 0);
    g.add(hinge);
    const plate = /^\d+$/.test(meta.label ?? "") ? meta.label : "";
    const leafMat = new THREE.MeshStandardMaterial({ map: tex.doorTex(plate, { burnt: meta.label === "317" }), roughness: 0.8 });
    const leaf = boxMesh(open, 2.3, 0.07, leafMat);
    leaf.position.set(open / 2, 1.15, 0);
    hinge.add(leaf);
    // which side it swings into: the side with more room
    const roomy = (dz) => {
      let n = 0;
      for (let k = 1; k <= 2; k++) for (let j = -1; j <= 1; j++) {
        const tx = along ? x + j : x + dz * k, ty = along ? y + dz * k : y + j;
        if (grid[ty]?.[tx] === ".") n++;
      }
      return n;
    };
    const swing = roomy(1) >= roomy(-1) ? 1 : -1;
    // pillars are always solid; the middle is solid while the door is shut
    const ax = along ? [[x, x + side / T], [x + 1 - side / T, x + 1]] : null;
    if (along) for (const [x0, x1] of ax) F.colliders.push({ x0, x1, y0: y, y1: y + 1, sight: true, h: WALL_H });
    else for (const [y0, y1] of [[y, y + side / T], [y + 1 - side / T, y + 1]]) F.colliders.push({ x0: x, x1: x + 1, y0, y1, sight: true, h: WALL_H });
    const door = {
      floor: F.data.id,
      x,
      y,
      label: meta.label ?? null,
      locked: !!meta.locked,
      key: meta.key ?? null,
      lockMsg: null,
      open: false,
      t: 0,
      hinge,
      group: g,
      swing,
      hidden: false,
      lock(v, msg = null, key = undefined) {
        this.locked = v;
        if (msg) this.lockMsg = msg;
        if (key !== undefined) this.key = key;
      },
    };
    this.doors.push(door);
    this.addInteract({ id: `door_${F.data.id}_${x}_${y}`, kind: "door", door, floor: F.data.id, pos: new THREE.Vector3(cx, Y + 1.1, cz), radius: 2.1 });
    return door;
  }

  buildLift(F, x, y, fc) {
    const Y = F.Y, cx = (x + 0.5) * T, cz = (y + 0.5) * T;
    const g = new THREE.Group();
    g.position.set(cx, Y, cz);
    g.rotation.y = Math.atan2(fc.dx, fc.dy); // local +z faces the corridor
    F.group.add(g);
    const inner = 1.6;
    // the cabin: back and side walls, a lit ceiling, a floor
    const back = boxMesh(T, WALL_H, 0.2, M.cabinWall);
    back.position.set(0, WALL_H / 2, -T / 2 + 0.1);
    g.add(back);
    for (const s of [-1, 1]) {
      const w = boxMesh(0.2, WALL_H, T, M.cabinWall);
      w.position.set(s * (T / 2 - 0.1), WALL_H / 2, 0);
      g.add(w);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(inner, inner), M.cabin);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 2.4, -0.1);
    g.add(ceil);
    const top = boxMesh(T, WALL_H - 2.4, T, M.cabinWall);
    top.position.set(0, 2.4 + (WALL_H - 2.4) / 2, 0);
    g.add(top);
    // the frame and two sliding doors at the corridor face
    const frameMat = M.darkMetal;
    for (const s of [-1, 1]) {
      const post = boxMesh(0.42, 2.4, 0.18, frameMat);
      post.position.set(s * (T / 2 - 0.21), 1.2, T / 2 - 0.09);
      g.add(post);
    }
    const panels = [-1, 1].map((s) => {
      const p = boxMesh(0.6, 2.25, 0.05, M.metal);
      p.position.set(s * 0.29, 1.125, T / 2 - 0.12);
      g.add(p);
      return { mesh: p, s };
    });
    // the floor indicator
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), new THREE.MeshBasicMaterial({ map: tex.signTex(F.data.id === "G" ? "G" : F.data.id) }));
    ind.position.set(0, 2.55, T / 2 + 0.01);
    g.add(ind);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), M.led);
    light.position.set(0.45, 1.2, T / 2 + 0.01);
    g.add(light);
    const lift = { floor: F.data.id, x, y, face: fc, panels, open: false, t: 0, group: g };
    this.lifts[F.data.id] = lift;
    this.props[`lift_${F.data.id}`] = { floor: F.data.id, pos: new THREE.Vector3(cx + fc.dx * T * 0.45, Y + 1.6, cz + fc.dy * T * 0.45) };
    this.addInteract({ id: `lift_${F.data.id}`, kind: "lift", floor: F.data.id, pos: new THREE.Vector3(cx + fc.dx * T * 0.5, Y + 1.2, cz + fc.dy * T * 0.5), label: "ui.lift", radius: 1.9 });
    F.colliders.push({ x0: x, x1: x + 1, y0: y, y1: y + 1, sight: true, h: WALL_H });
  }

  addInteract(o) {
    this.interactables.push(o);
    return o;
  }

  buildProp(F, p) {
    const Y = F.Y, g = new THREE.Group();
    const box = p.x0 !== undefined && p.y0 !== undefined;
    const cx = box ? ((p.x0 + p.x1) / 2) * T : p.x * T, cz = box ? ((p.y0 + p.y1) / 2) * T : p.y * T;
    const w = box ? (p.x1 - p.x0) * T : 0, d = box ? (p.y1 - p.y0) * T : 0;
    g.position.set(cx, Y, cz);
    const add = (m, x = 0, y = 0, z = 0) => {
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const rotFace = () => (g.rotation.y = FACE_ROT[p.face ?? "s"]);
    let interact = null;
    switch (p.kind) {
      case "bed": {
        const mat = p.burnt ? M.burnt : M.sheet;
        add(boxMesh(w, 0.3, d, p.burnt ? M.burnt : M.darkWood), 0, 0.15);
        add(boxMesh(w * 0.96, 0.22, d * 0.96, mat), 0, 0.41);
        const head = p.face === "n" ? 1 : -1;
        add(boxMesh(w, 1.0, 0.08, p.burnt ? M.burnt : M.wood), 0, 0.5, (head * d) / 2);
        add(boxMesh(w * 0.7, 0.12, 0.35, p.burnt ? M.burnt : M.white), 0, 0.58, (head * d) / 2 - head * 0.3);
        break;
      }
      case "partition":
      case "pillar": {
        const m = boxMesh(w, p.h, d, p.kind === "pillar" ? M.darkWood : F.wallMat);
        add(m, 0, p.h / 2);
        break;
      }
      case "tub":
        add(boxMesh(w, p.h, d, M.white), 0, p.h / 2);
        add(boxMesh(w * 0.86, 0.02, d * 0.7, M.black), 0, p.h + 0.005);
        break;
      case "curtain": {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.8, 10, 1), M.curtain);
        add(c, 0, 1.2);
        const pole = boxMesh(w, 0.03, 0.03, M.metal);
        add(pole, 0, 2.12);
        this.curtains[p.id.replace("curtain", "")] = { mesh: c, base: c.geometry.attributes.position.array.slice(), on: false, t: 0 };
        break;
      }
      case "sink":
        add(boxMesh(w, 0.12, d, M.white), 0, p.h);
        add(boxMesh(w * 0.3, p.h, d * 0.3, M.white), 0, p.h / 2);
        interact = { label: "p.sink" };
        break;
      case "hook": {
        rotFace();
        add(boxMesh(0.04, 0.04, 0.12, M.metal), 0, p.h, 0.06);
        if (p.id === "uniform207") {
          add(boxMesh(0.5, 0.75, 0.12, tex.mat(0x1c2438)), 0, p.h - 0.42, 0.1);
          add(boxMesh(0.12, 0.05, 0.02, M.brass), 0.12, p.h - 0.22, 0.17);
          interact = { label: "p.uniform" };
        } else interact = { label: "p.hook" };
        break;
      }
      case "wardrobe": {
        const mat = p.burnt ? M.burnt : p.metal ? M.metal : M.wood;
        add(boxMesh(w, p.h, d, mat), 0, p.h / 2);
        const fv = FACE_VEC[p.face ?? "e"];
        const line = boxMesh(fv[0] ? 0.02 : w * 0.02, p.h * 0.9, fv[1] ? 0.02 : d * 0.02, M.black);
        add(line, (fv[0] * w) / 2, p.h / 2, (fv[1] * d) / 2);
        if (p.hide) interact = { label: "p.hide", kind: "hide", face: p.face };
        break;
      }
      case "desk":
      case "table":
      case "counter":
      case "box": {
        const mat = p.color !== undefined ? tex.mat(p.color) : p.kind === "counter" ? M.darkWood : M.wood;
        add(boxMesh(w, p.h, d, mat), 0, p.h / 2);
        if (p.kind === "counter") add(boxMesh(w + 0.06, 0.05, d + 0.06, M.brass), 0, p.h);
        break;
      }
      case "tv":
        rotFace();
        add(boxMesh(0.5, 0.35, 0.1, M.black), 0, p.h + 0.2);
        add(new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), M.screen), 0, p.h + 0.2, 0.051);
        break;
      case "painting": {
        rotFace();
        add(boxMesh(0.8, 0.55, 0.04, M.brass), 0, p.h);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), tex.mat(0x4a5a2a));
        add(art, 0, p.h, 0.022);
        art.rotation.z = 0.03;
        interact = { label: "p.painting" };
        break;
      }
      case "phone":
        add(boxMesh(0.22, 0.08, 0.16, p.id === "phone_317" ? M.burnt : M.cream), 0, p.h + 0.04);
        add(boxMesh(0.24, 0.05, 0.06, M.black), 0, p.h + 0.1, -0.04);
        interact = { label: p.label ?? "p.phone", kind: "phone" };
        break;
      case "monitor": {
        rotFace();
        add(boxMesh(0.5, 0.38, 0.32, M.black), 0, p.h + 0.22);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), p.live ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : M.screen);
        add(scr, 0, p.h + 0.22, 0.165);
        if (p.live) this.liveScreen = scr;
        if (p.id) interact = { label: p.label, kind: "cctv" };
        break;
      }
      case "logbook":
      case "register": {
        const paper = new THREE.MeshStandardMaterial({ map: tex.paperTex(6, p.kind === "register" ? 3 : 5), roughness: 1 });
        for (const s of [-1, 1]) {
          const page = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), paper);
          page.rotation.x = -Math.PI / 2;
          page.rotation.y = s * 0.08;
          add(page, s * 0.1, p.h + 0.02);
        }
        add(boxMesh(0.42, 0.02, 0.3, p.kind === "register" ? tex.mat(0x4a1010) : tex.mat(0x1a2a4a)), 0, p.h + 0.005);
        interact = { label: p.label };
        break;
      }
      case "chair":
        add(boxMesh(0.45, 0.05, 0.45, M.darkMetal), 0, 0.45);
        add(boxMesh(0.45, 0.5, 0.05, M.darkMetal), 0, 0.72, 0.2);
        break;
      case "board": {
        rotFace();
        add(boxMesh(0.9, 0.6, 0.03, tex.mat(0x6a4a2a)), 0, p.h);
        for (let i = 0; i < 3; i++) {
          const n = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ map: tex.paperTex(4, i + 7) }));
          n.rotation.z = (i - 1) * 0.08;
          add(n, -0.28 + i * 0.28, p.h, 0.02);
        }
        interact = { label: p.label };
        break;
      }
      case "lamp": {
        const base = p.table ? p.h : 0, tall = p.table ? 0.35 : 1.5;
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, tall, 6), M.brass), 0, base + tall / 2);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }));
        add(shade, 0, base + tall);
        this.fixtures ??= [];
        this.fixtures.push({ mesh: shade, on: shade.material, off: M.fixtureOff });
        break;
      }
      case "cubby": {
        rotFace();
        add(boxMesh(1.2, 0.8, 0.25, M.darkWood), 0, p.h);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add(boxMesh(0.24, 0.2, 0.02, M.black), -0.42 + i * 0.28, p.h - 0.25 + j * 0.25, 0.13);
        break;
      }
      case "bell":
        add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.brass), 0, p.h);
        interact = { label: p.label };
        break;
      case "clock": {
        rotFace();
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshStandardMaterial({ map: tex.clockTex(11, 0), roughness: 0.7 }));
        add(face, 0, p.h, 0.03);
        this.clockFace = face;
        interact = { label: p.label };
        break;
      }
      case "sofa": {
        const back = p.face === "n" ? 1 : -1;
        add(boxMesh(w, 0.42, d, M.fabric), 0, 0.21);
        add(boxMesh(w, 0.5, 0.18, M.fabric), 0, 0.62, (back * (d - 0.18)) / 2);
        if (p.id) interact = null;
        break;
      }
      case "plant":
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8), M.pot), 0, 0.2);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 6), M.green), 0, 0.9);
        F.colliders.push({ x0: p.x - 0.12, x1: p.x + 0.12, y0: p.y - 0.12, y1: p.y + 0.12, h: 1.4 });
        break;
      case "rug":
      case "carpet": {
        const t = p.kind === "carpet" ? tex.carpet().clone() : tex.carpet().clone();
        t.repeat.set((p.x1 - p.x0) * 2, (p.y1 - p.y0) * 2);
        t.needsUpdate = true;
        const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
        r.rotation.x = -Math.PI / 2;
        add(r, 0, 0.006);
        break;
      }
      case "sign": {
        rotFace();
        const t = tex.signTex(t_(p.text), { exit: p.exit }), sw = p.w ?? 0.8, sh = sw / t.userData.aspect;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), p.exit ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
        add(m, 0, p.h, 0.01);
        break;
      }
      case "punch": {
        rotFace();
        add(boxMesh(0.25, 0.32, 0.12, M.metal), 0, p.h, 0.06);
        add(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), M.led), 0.06, p.h + 0.1, 0.125);
        add(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.06), M.screen), -0.02, p.h + 0.02, 0.125);
        interact = { label: "p.punch", kind: "punch" };
        break;
      }
      case "shelf":
        add(boxMesh(w, p.h, d, M.darkWood), 0, p.h / 2);
        for (let i = 1; i < 4; i++) add(boxMesh(w * 1.02, 0.03, d * 1.02, M.wood), 0, (p.h / 4) * i);
        break;
      case "washer":
        add(boxMesh(w, p.h, d, M.white), 0, p.h / 2);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), M.black), 0, p.h * 0.55, -d / 2 - 0.01).rotation.x = Math.PI / 2;
        if (p.id) interact = { label: p.label };
        break;
      case "cart":
        add(boxMesh(w, p.h * 0.8, d, tex.mat(0x3a4a5a)), 0, p.h * 0.5);
        add(boxMesh(w * 0.9, 0.2, d * 0.9, M.sheet), 0, p.h * 0.9);
        break;
      case "keyboard": {
        rotFace();
        add(boxMesh(1.0, 0.7, 0.04, tex.mat(0x4a3a2a)), 0, p.h);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) add(boxMesh(0.03, 0.08, 0.03, M.brass), -0.38 + i * 0.15, p.h + 0.2 - j * 0.2, 0.04);
        interact = { label: p.label };
        break;
      }
      case "breaker":
        rotFace();
        add(boxMesh(0.5, 0.7, 0.15, M.darkMetal), 0, p.h, 0.075);
        add(boxMesh(0.06, 0.2, 0.08, M.led), 0.12, p.h, 0.17);
        interact = { label: p.label };
        break;
      case "boiler":
        add(new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, p.h, 12), M.rust), 0, p.h / 2);
        break;
      case "pipe": {
        const len = (p.x1 - p.x0) * T, m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6), M.rust);
        m.rotation.z = Math.PI / 2;
        g.position.set(((p.x0 + p.x1) / 2) * T, Y, p.y * T);
        add(m, 0, p.h);
        break;
      }
      case "plastic": {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(d || T, p.h), M.plastic);
        s.rotation.y = Math.PI / 2;
        add(s, 0, p.h / 2);
        break;
      }
      case "ladder":
        for (const s of [-1, 1]) add(boxMesh(0.05, 1.8, 0.05, M.metal), s * 0.22, 0.9);
        for (let i = 0; i < 5; i++) add(boxMesh(0.44, 0.03, 0.03, M.metal), 0, 0.3 + i * 0.32);
        g.rotation.y = 0.3;
        break;
    }
    if (p.collide && box) F.colliders.push({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, sight: !!p.sight, h: p.h });
    else if (p.sight && box) F.colliders.push({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, sight: true, pass: true, h: p.h });
    F.group.add(g);
    if (p.id) {
      const h = (p.h ?? 1) + (p.kind === "wardrobe" ? -p.h / 2 : 0.1);
      const here = new THREE.Vector3(cx, Y + Math.max(0.6, Math.min(1.6, h)), cz);
      this.props[p.id] = { ...p, floor: F.data.id, pos: here, group: g };
      if (interact || p.label) {
        const fv = FACE_VEC[p.face ?? "s"];
        this.addInteract({
          id: p.id,
          kind: interact?.kind ?? p.kind,
          floor: F.data.id,
          pos: here,
          label: interact?.label ?? p.label,
          radius: p.kind === "wardrobe" ? 1.6 : 1.7,
          hideAt: interact?.kind === "hide" ? { x: cx, z: cz, face: fv } : null,
          examine: p.examine,
        });
      }
    }
  }

  buildLights() {
    for (const l of LIGHTS) {
      const light = new THREE.PointLight(l.color, l.intensity, l.dist, 2);
      light.position.copy(this.pos(l.floor, l.x, l.y, l.h));
      this.root.add(light);
      let fixture = null;
      if (l.h >= 2.4) {
        fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), M.fixtureOn);
        fixture.position.copy(this.pos(l.floor, l.x, l.y, WALL_H - 0.03));
        this.root.add(fixture);
      }
      this.lights[l.id] = { light, base: l.intensity, level: l.intensity, flicker: false, fixture, floor: l.floor };
    }
    // a small pool of warm lights for candles the story lights
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xff9a40, 0, 6, 2);
      this.root.add(light);
      this.candleLights.push(light);
    }
  }

  buildCameras() {
    this.cameras = CAMERAS.map((c) => {
      const cam = new THREE.PerspectiveCamera(62, 4 / 3, 0.1, 40);
      cam.position.copy(this.pos(c.floor, c.at[0], c.at[1], c.at[2]));
      cam.lookAt(this.pos(c.floor, c.look[0], c.look[1], c.look[2]));
      return { ...c, cam };
    });
  }

  /** The rain outside the lobby glass: one live pixelfx effect shown on every pane. */
  buildRain() {
    if (!this.windows) return;
    const fx = new FxSprite(rain, { density: 1.2, seed: 4 }, { scale: 1 / 100 });
    fx.always = true;
    this.rainFx = fx;
    for (const w of this.windows) {
      const m = fx.makeMesh(w.w, w.h);
      m.position.copy(w.pos);
      m.rotation.y = w.rot;
      this.root.add(m);
    }
  }

  // ---------------------------------------------------------------- queries
  ch(fid, x, y) {
    const F = this.floors[fid];
    return x < 0 || y < 0 || x >= F.W || y >= F.H ? "#" : F.grid[y][x];
  }
  doorAt(fid, x, y) {
    return this.doors.find((d) => d.floor === fid && d.x === x && d.y === y);
  }
  /** Can a body stand in tile (x, y)? */
  tileOpen(fid, x, y) {
    const c = this.ch(fid, x, y);
    if (c === ".") return true;
    if (c === "+" || c === "Q") {
      const d = this.doorAt(fid, x, y);
      return !!d && !d.hidden && d.open;
    }
    return false;
  }
  /** Is the circle at world (wx, wz) blocked? */
  blocked(fid, wx, wz, r) {
    const x0 = Math.floor((wx - r) / T), x1 = Math.floor((wx + r) / T), y0 = Math.floor((wz - r) / T), y1 = Math.floor((wz + r) / T);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!this.tileOpen(fid, x, y)) return true;
    const tx = wx / T, tz = wz / T, tr = r / T;
    for (const c of this.floors[fid].colliders) {
      if (c.pass) continue;
      const nx = Math.max(c.x0, Math.min(tx, c.x1)), nz = Math.max(c.y0, Math.min(tz, c.y1));
      if ((nx - tx) ** 2 + (nz - tz) ** 2 < tr * tr) return true;
    }
    return false;
  }
  sightBlocked(fid, wx, wz) {
    const x = Math.floor(wx / T), y = Math.floor(wz / T);
    if (!this.tileOpen(fid, x, y)) return true;
    const tx = wx / T, tz = wz / T;
    for (const c of this.floors[fid].colliders) if (c.sight && tx > c.x0 && tx < c.x1 && tz > c.y0 && tz < c.y1) return true;
    return false;
  }
  clearLine(fid, ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) if (this.sightBlocked(fid, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  }
  /** The tile grid as the thing walks it: doors are no obstacle to it. */
  nav(fid) {
    const F = this.floors[fid];
    return {
      W: F.W,
      H: F.H,
      wall: (x, y) => {
        const c = this.ch(fid, x, y);
        if (c === ".") return false;
        if (c === "+") return false;
        if (c === "Q") return !!this.doorAt(fid, x, y)?.hidden;
        return true;
      },
    };
  }
  zoneAt(fid, wx, wz) {
    const tx = wx / T, tz = wz / T;
    let best = null;
    for (const z of this.floors[fid].zones) if (tx >= z.x0 && tx <= z.x1 && tz >= z.y0 && tz <= z.y1) if (!best || (z.x1 - z.x0) * (z.y1 - z.y0) < (best.x1 - best.x0) * (best.y1 - best.y0)) best = z;
    return best;
  }
  doorByLabel(label) {
    return this.doors.find((d) => d.label === label);
  }

  // ---------------------------------------------------------------- changes
  openDoor(door, v) {
    if (door.hidden) return;
    door.open = v;
  }
  reveal(label) {
    const d = this.doorByLabel(label);
    if (!d || !d.hidden) return;
    d.hidden = false;
    d.group.visible = true;
    d.block.visible = false;
  }
  setPower(on) {
    this.powered = on;
    for (const l of Object.values(this.lights)) {
      if (l.fixture) l.fixture.material = on ? M.fixtureOn : M.fixtureOff;
    }
    for (const f of this.fixtures ?? []) f.mesh.material = on ? f.on : f.off;
    if (this.liveScreen) this.liveScreen.visible = on;
  }
  setLight(id, v) {
    const l = this.lights[id];
    if (l) l.level = v === null ? l.base : v;
  }
  flicker(id, v) {
    const l = this.lights[id];
    if (l) l.flicker = v;
  }
  setClock(h, m) {
    if (!this.clockFace || (this.clockH === h && this.clockM === m)) return;
    this.clockH = h;
    this.clockM = m;
    this.clockFace.material.map?.dispose();
    this.clockFace.material.map = tex.clockTex(h, m);
    this.clockFace.material.needsUpdate = true;
  }
  curtain(label, on) {
    const c = this.curtains[label];
    if (c) c.on = on;
  }
  liftDoors(fid, open) {
    const l = this.lifts[fid];
    if (l) l.open = open;
  }

  // ---------------------------------------------------------------- pixelfx in the hotel
  sprite(mod, opts, scale, pos, list = this.sprites) {
    const s = new FxSprite(mod, opts, { scale, position: pos });
    this.root.add(s.sprite);
    list.push(s);
    return s;
  }
  candle(fid, x, y, h) {
    const pos = this.pos(fid, x, y, h);
    this.sprite(candleFx, { seed: Math.round(x * 7 + y) }, 1 / 60, pos);
    const light = this.candleLights.find((l) => l.intensity === 0);
    if (light) {
      light.position.copy(pos).add(new THREE.Vector3(0, 0.4, 0));
      light.intensity = 4;
      light.userData.phase = Math.random() * 10;
    }
  }
  eye(fid, x, y) {
    this.sprite(eyeballFx, { seed: Math.round(x * 3), iris: RED_IRIS, hover: 30 }, 1 / 55, this.pos(fid, x, y, 0));
  }
  hands(fid, x, y) {
    this.sprite(graspingHands, { seed: 3, palette: ["#050102", "#140305", "#2e060a", "#520a10", "#801420", "#b02626", "#e05a48", "#ffc8b8"] }, 1 / 70, this.pos(fid, x, y, 0.5), this.oneShots);
  }
  burst(pos, palette) {
    this.sprite(collectBurst, { seed: 2, palette }, 1 / 70, pos, this.oneShots);
  }
  keySprite(pos) {
    return this.sprite(keyGlint, { palette: BRASS, seed: 7 }, 1 / 110, pos);
  }
  glow(pos, color = [255, 240, 200], size = 0.35) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0.55 }));
    s.scale.set(size, size, 1);
    s.position.copy(pos);
    this.root.add(s);
    return s;
  }
  removeSprite(s) {
    s.dispose();
    const i = this.sprites.indexOf(s);
    if (i >= 0) this.sprites.splice(i, 1);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, camera, time) {
    for (const d of this.doors) {
      const target = d.open ? 1 : 0;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
      d.hinge.rotation.y = d.swing * d.t * (Math.PI / 2) * -1;
    }
    for (const l of Object.values(this.lifts)) {
      const target = l.open ? 1 : 0;
      l.t += Math.sign(target - l.t) * Math.min(Math.abs(target - l.t), dt * 1.1);
      for (const p of l.panels) p.mesh.position.x = p.s * (0.29 + l.t * 0.5);
    }
    for (const c of Object.values(this.curtains)) {
      if (!c.on && c.t <= 0) continue;
      c.t = Math.max(0, Math.min(1, c.t + (c.on ? dt * 0.6 : -dt)));
      const a = c.mesh.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = c.base[i * 3], y = c.base[i * 3 + 1];
        a.array[i * 3 + 2] = c.base[i * 3 + 2] - c.t * (0.18 * Math.exp(-((x * 3) ** 2)) * (1 - (y + 0.9) / 3)) * (1 + 0.3 * Math.sin(time * 2.3 + x * 4));
      }
      a.needsUpdate = true;
    }
    for (const l of Object.values(this.lights)) {
      const powered = this.powered || l.light.color.getHex() === 0xff6a20;
      let v = powered ? l.level : 0;
      if (l.flicker) v *= Math.random() < 0.25 ? 0.05 : Math.random() < 0.5 ? 0.6 : 1;
      l.light.intensity = v;
    }
    for (const c of this.candleLights) if (c.intensity > 0) c.intensity = 3.6 + 0.8 * Math.sin(time * 9 + c.userData.phase) * Math.sin(time * 3.3 + c.userData.phase);
    for (const s of this.sprites) s.update(dt, camera);
    for (let i = this.oneShots.length - 1; i >= 0; i--) {
      const s = this.oneShots[i];
      s.update(dt, camera);
      if (s.done) {
        s.dispose();
        this.oneShots.splice(i, 1);
      }
    }
    this.rainFx?.update(dt);
  }
}
