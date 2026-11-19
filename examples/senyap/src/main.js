// SENYAP: a first-person pixel horror game. three.js draws the house at a low resolution, pixelfx effects
// live in it as billboards (candles, soul flames, watching eyes, the thing's red fire, hands from the floor),
// and the HUD, the jumpscare and the transitions are pixelfx frames over the top.
import * as THREE from "three";
import { createFrame, clearFrame, createFx, composite, painterFor, hex } from "../../../src/core/index.js";
import * as candleFx from "../../../src/fx/fire/candle.js";
import * as spiritFlame from "../../../src/fx/fire/spirit-flame.js";
import * as eyeballFx from "../../../src/fx/critters/eyeball.js";
import * as shadowFlames from "../../../src/fx/shadow/shadow-flames.js";
import * as graspingHands from "../../../src/fx/shadow/grasping-hands.js";
import * as darkExplosion from "../../../src/fx/shadow/dark-explosion.js";
import * as necroSkulls from "../../../src/fx/shadow/necro-skulls.js";
import * as collectBurst from "../../../src/fx/pickups/collect-burst.js";
import * as lootBeam from "../../../src/fx/pickups/loot-beam.js";
import * as crtOff from "../../../src/fx/transitions/crt-off.js";
import * as glitchWipe from "../../../src/fx/transitions/glitch-wipe.js";
import { makeMaze, path, distances, floorTiles, isDeadEnd, mulberry } from "./maze.js";
import { wallTexture, floorTexture, ceilingTexture, doorTexture, glowTexture } from "./textures.js";
import { FxSprite } from "./fxsprite.js";
import { Sound } from "./audio.js";

// ---------------------------------------------------------------- constants
const T = 2.5; // one tile, in metres
const WALL_H = 3;
const EYE = 1.55;
const CELLS = 9; // 19 x 19 tiles
const NEED = 5; // talismans to open the door
const R = 0.32; // player radius
const BLOOD = ["#050102", "#1a0306", "#3a060c", "#660a12", "#9a1420", "#d02a2a", "#ff6a50", "#ffd0c0"];
const PALE = ["#0b0b0a", "#2a2618", "#5a4e2c", "#9a8648", "#d8c27a", "#f4e6b0", "#fff8e0", "#ffffff"];
const RED_IRIS = ["#2a0606", "#6a0c0c", "#b01818", "#ff3a2a", "#ffd0a0"];

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const touch = matchMedia("(pointer: coarse)").matches;

// ---------------------------------------------------------------- renderer: low resolution, upscaled
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$("game").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.085);

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 80);
camera.rotation.order = "YXZ";
scene.add(camera);

// the picture goes through one pass: chromatic split, grain, vignette, a red cast with fear, glitch bands
// when it gets you, then a 4x4 Bayer posterize so the 3D sits with the pixel effects
let rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const post = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    fear: { value: 0 },
    glitch: { value: 0 },
    flash: { value: 0 },
    dark: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, fear, glitch, flash, dark;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int k = i.x + i.y * 4;
      int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
      return (float(m[k]) + 0.5) / 16.0;
    }
    void main() {
      vec2 uv = vUv;
      float band = floor(uv.y * 36.0);
      float tick = floor(time * 18.0);
      float g = glitch * step(0.62, hash(vec2(band, tick)));
      uv.x += (hash(vec2(band, tick + 3.0)) - 0.5) * 0.12 * g;
      uv.y += sin(uv.x * 40.0 + time * 9.0) * 0.002 * fear;
      float ca = 0.0015 + fear * 0.004 + glitch * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      vec2 d = vUv - 0.5;
      col *= clamp(1.0 - dot(d, d) * (1.5 + fear * 1.6), 0.0, 1.0);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l * 1.25, l * 0.42, l * 0.38), fear * 0.5);
      col += (hash(gl_FragCoord.xy + fract(time) * 91.0) - 0.5) * (0.045 + fear * 0.05 + glitch * 0.2);
      col += flash * vec3(0.55, 0.0, 0.02);
      col *= dark;
      float levels = 18.0;
      col = floor(col * levels + bayer(gl_FragCoord.xy)) / levels;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

// ---------------------------------------------------------------- HUD and screen effects (pixelfx frames)
const hudCanvas = $("hud"), hudCtx = hudCanvas.getContext("2d");
let hudFrame, hudImg;
const fxCanvas = $("fxscreen"), fxCtx = fxCanvas.getContext("2d");
const fxFrame = createFrame(320, 180), fxImg = fxCtx.createImageData(320, 180);

function resize() {
  const w = innerWidth, h = innerHeight, k = Math.max(2, Math.round(h / 230));
  const rw = Math.max(160, Math.round(w / k)), rh = Math.max(90, Math.round(h / k));
  renderer.setSize(rw, rh, false);
  rt.setSize(rw, rh);
  camera.aspect = rw / rh;
  camera.updateProjectionMatrix();
  // the HUD is 180 px on its short side, so it reads the same in landscape and portrait
  const short = 180, hw = w >= h ? Math.round((short * w) / h) : short, hh = w >= h ? short : Math.round((short * h) / w);
  hudCanvas.width = hw;
  hudCanvas.height = hh;
  hudFrame = createFrame(hw, hh);
  hudImg = hudCtx.createImageData(hw, hh);
}
addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- materials shared by every run
const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.92, metalness: 0 });
const floorTex = floorTexture(), ceilTex = ceilingTexture();
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });
const doorMat = new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.8, emissive: 0x330000, emissiveIntensity: 1 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 });
const glowRed = glowTexture([255, 30, 20]), glowGreen = glowTexture([120, 255, 120]);

// ---------------------------------------------------------------- lights that never change in number
// (adding or removing lights recompiles every material, so these live for the whole session)
const hemi = new THREE.HemisphereLight(0x3a4058, 0x140a06, 0.5);
scene.add(hemi);
const flashlight = new THREE.SpotLight(0xffe6c0, 55, 28, 0.44, 0.55, 1.6);
flashlight.position.set(0.18, -0.22, 0.05);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.3;
flashlight.shadow.camera.far = 28;
flashlight.shadow.bias = -0.0008;
camera.add(flashlight);
flashlight.target.position.set(0, -0.05, -1);
camera.add(flashlight.target);
const fill = new THREE.PointLight(0x8090b0, 0.5, 4, 2);
camera.add(fill);

const MAX_CANDLES = 7;
const candleLights = Array.from({ length: MAX_CANDLES }, () => {
  const l = new THREE.PointLight(0xff8a3a, 0, 9, 2);
  scene.add(l);
  return l;
});
const talismanLights = Array.from({ length: NEED }, () => {
  const l = new THREE.PointLight(0x40ffd8, 0, 6, 2);
  scene.add(l);
  return l;
});
const doorLight = new THREE.PointLight(0xff2010, 0, 7, 2);
scene.add(doorLight);

// ---------------------------------------------------------------- the thing
function makeBayang() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x0c0a0b, roughness: 0.95 });
  const parts = {};
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.25, 7), skin);
  torso.position.y = 1.55;
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 1.0, 6), skin);
  hips.position.y = 0.6;
  const neck = new THREE.Group();
  neck.position.y = 2.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skin);
  head.scale.set(0.9, 1.35, 1);
  head.position.y = 0.22;
  neck.add(head);
  // eyes that glow through the dark
  for (const s of [-1, 1]) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowRed, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    e.scale.set(0.14, 0.14, 1);
    e.position.set(s * 0.075, 0.26, -0.17);
    neck.add(e);
  }
  // a mouth that hangs open
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  mouth.position.set(0, 0.08, -0.185);
  mouth.rotation.y = Math.PI;
  neck.add(mouth);
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.3, 2.08, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 1.5, 5), skin);
    upper.position.y = -0.75;
    shoulder.add(upper);
    const hand = new THREE.Group();
    hand.position.y = -1.5;
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.32, 3), skin);
      finger.position.set((f - 1.5) * 0.025, -0.15, 0);
      finger.rotation.z = (f - 1.5) * 0.12;
      hand.add(finger);
    }
    shoulder.add(hand);
    shoulder.rotation.z = s * 0.08;
    g.add(shoulder);
    arms.push(shoulder);
  }
  g.add(torso, hips, neck);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const fire = new FxSprite(shadowFlames, { palette: BLOOD, seed: 3 }, { scale: 1 / 42 });
  fire.sprite.position.y = 0.02;
  g.add(fire.sprite);
  Object.assign(parts, { torso, neck, head, arms, fire, skin });
  g.userData.parts = parts;
  return g;
}

// ---------------------------------------------------------------- run state
const sound = new Sound();
let world = null; // everything built for one run
let state = "title"; // title | play | paused | caught | won | dead
let rand = Math.random;

const input = { f: 0, b: 0, l: 0, r: 0, run: false, mx: 0, my: 0 };
const player = { x: 0, z: 0, yaw: 0, pitch: 0, stamina: 100, battery: 100, light: true, got: 0, slow: 0, bob: 0, stepAcc: 0, time: 0 };
let msg = { text: "", t: 0 };
let heartT = 0, ambT = 8, caughtT = 0, endFx = [], screenFx = null, grace = 0;

const tileOf = (v) => Math.floor(v / T);
const centre = (i) => i * T + T / 2;

function say(text, dur = 3) {
  msg = { text, t: dur };
}

function build(seed) {
  if (world) teardown();
  rand = mulberry(seed);
  const m = makeMaze(CELLS, rand);
  const root = new THREE.Group();
  scene.add(root);
  const w = { m, root, sprites: [], items: [], eyes: [], traps: [], candles: [], talismans: [], batteries: [], oneShots: [] };

  // floor and ceiling, one texture repeat per tile
  const size = m.W * T;
  for (const [mat, tex, y, rot] of [[floorMat, floorTex, 0, -Math.PI / 2], [ceilMat, ceilTex, WALL_H, Math.PI / 2]]) {
    tex.repeat.set(m.W, m.H);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    plane.rotation.x = rot;
    plane.position.set(size / 2, y, size / 2);
    plane.receiveShadow = true;
    root.add(plane);
  }

  // walls: only the ones that face a corridor
  const walls = [];
  for (let y = 0; y < m.H; y++)
    for (let x = 0; x < m.W; x++) {
      if (!m.wall(x, y)) continue;
      let open = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.wall(x + dx, y + dy)) open = true;
      if (open) walls.push([x, y]);
    }
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T, WALL_H, T), wallMat, walls.length);
  const mtx = new THREE.Matrix4();
  walls.forEach(([x, y], i) => wallMesh.setMatrixAt(i, mtx.makeTranslation(centre(x), WALL_H / 2, centre(y))));
  wallMesh.receiveShadow = true;
  root.add(wallMesh);

  // where things go: the player in one corner, the door at the far end of the house
  const start = [1, 1];
  const dist = distances(m, ...start);
  const floors = floorTiles(m);
  const far = (a, b) => dist[b[0] + b[1] * m.W] - dist[a[0] + a[1] * m.W];
  const used = new Set([start.join()]);
  const take = (list, ok = () => true) => {
    for (const t of list) if (!used.has(t.join()) && ok(t)) {
      used.add(t.join());
      return t;
    }
    return null;
  };
  const shuffled = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const tileDist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

  // the door: the farthest tile, in its wall
  const doorTile = take(floors.slice().sort(far));
  let doorDir = [0, 1];
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.wall(doorTile[0] + d[0], doorTile[1] + d[1])) doorDir = d;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), doorMat);
  const dx = centre(doorTile[0]) + doorDir[0] * (T / 2 - 0.02), dz = centre(doorTile[1]) + doorDir[1] * (T / 2 - 0.02);
  door.position.set(dx, 1.2, dz);
  door.lookAt(centre(doorTile[0]), 1.2, centre(doorTile[1]));
  root.add(door);
  doorLight.position.set(dx - doorDir[0] * 0.7, 1.6, dz - doorDir[1] * 0.7);
  doorLight.color.set(0xff2010);
  doorLight.intensity = 1.2;
  doorMat.emissive.set(0x330000);
  w.door = { tile: doorTile, pos: new THREE.Vector3(dx, 0, dz), open: false, beam: null, dir: doorDir };

  // talismans: dead ends first, spread out, away from the start
  const deadEnds = shuffled(floors.filter(([x, y]) => isDeadEnd(m, x, y) && dist[x + y * m.W] > 4));
  for (let i = 0; i < NEED; i++) {
    const t = take(deadEnds, (c) => w.talismans.every((o) => tileDist(o.tile, c) > 5)) ?? take(shuffled(floors), (c) => dist[c[0] + c[1] * m.W] > 4);
    const pos = new THREE.Vector3(centre(t[0]), 0, centre(t[1]));
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), stoneMat);
    plinth.position.set(pos.x, 0.35, pos.z);
    plinth.castShadow = false;
    root.add(plinth);
    const flame = new FxSprite(spiritFlame, { seed: 3 + i }, { scale: 1 / 70, position: new THREE.Vector3(pos.x, 0.7, pos.z) });
    root.add(flame.sprite);
    w.sprites.push(flame);
    const light = talismanLights[i];
    light.position.set(pos.x, 1.2, pos.z);
    light.intensity = 1.6;
    w.talismans.push({ tile: t, pos, flame, plinth, light, taken: false });
  }

  // candles: warm islands of light along the way
  const cand = shuffled(floors).filter((c) => dist[c[0] + c[1] * m.W] > 1);
  candleLights.forEach((l) => (l.intensity = 0));
  for (let i = 0; i < MAX_CANDLES; i++) {
    const t = take(cand, (c) => w.candles.every((o) => tileDist(o.tile, c) > 4) && w.talismans.every((o) => tileDist(o.tile, c) > 2));
    if (!t) break;
    // push it against a wall
    let off = [0, 0];
    for (const d of shuffled([[1, 0], [-1, 0], [0, 1], [0, -1]])) if (m.wall(t[0] + d[0], t[1] + d[1])) off = d;
    const pos = new THREE.Vector3(centre(t[0]) + off[0] * 0.95, 0, centre(t[1]) + off[1] * 0.95);
    const s = new FxSprite(candleFx, { seed: i + 1 }, { scale: 1 / 46, position: pos });
    root.add(s.sprite);
    w.sprites.push(s);
    const light = candleLights[i];
    light.position.set(pos.x - off[0] * 0.2, 0.75, pos.z - off[1] * 0.2);
    light.intensity = 2.4;
    w.candles.push({ tile: t, pos, sprite: s, light, base: 2.4, out: 0, phase: rand() * 10 });
  }

  // batteries
  for (let i = 0; i < 6; i++) {
    const t = take(shuffled(floors), (c) => dist[c[0] + c[1] * m.W] > 3);
    if (!t) break;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0x1f5a2a, roughness: 0.5, metalness: 0.3 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), new THREE.MeshStandardMaterial({ color: 0xccccbb, metalness: 0.8, roughness: 0.3 }));
    cap.position.y = 0.16;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowGreen, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0.6 }));
    halo.scale.set(0.5, 0.5, 1);
    g.add(body, cap, halo);
    g.position.set(centre(t[0]) + (rand() - 0.5), 0.3, centre(t[1]) + (rand() - 0.5));
    root.add(g);
    w.batteries.push({ g, taken: false });
  }

  // eyes that watch, and tell
  for (let i = 0; i < 5; i++) {
    const t = take(shuffled(floors), (c) => dist[c[0] + c[1] * m.W] > 6 && w.eyes.every((o) => tileDist(o.tile, c) > 5));
    if (!t) break;
    const pos = new THREE.Vector3(centre(t[0]), 0, centre(t[1]));
    const s = new FxSprite(eyeballFx, { seed: i + 2, iris: RED_IRIS }, { scale: 1 / 40, position: pos });
    root.add(s.sprite);
    w.sprites.push(s);
    w.eyes.push({ tile: t, pos, sprite: s, cool: 0 });
  }

  // hands under the floorboards
  for (let i = 0; i < 7; i++) {
    const t = take(shuffled(floors), (c) => dist[c[0] + c[1] * m.W] > 5);
    if (!t) break;
    w.traps.push({ tile: t, sprung: false });
  }

  // the thing starts far away
  const bayang = makeBayang();
  const eStart = floors.filter((c) => dist[c[0] + c[1] * m.W] > 18).sort(() => rand() - 0.5)[0] ?? doorTile;
  bayang.position.set(centre(eStart[0]), 0, centre(eStart[1]));
  root.add(bayang);
  w.enemy = {
    g: bayang,
    parts: bayang.userData.parts,
    mode: "wander",
    path: [],
    goal: eStart,
    repath: 0,
    lost: 0,
    lit: 0,
    gone: 0,
    lastSeen: null,
    twitch: 0,
    walk: 0,
    heading: 0,
    screech: 0,
  };

  Object.assign(player, { x: centre(start[0]), z: centre(start[1]), yaw: 0, pitch: 0, stamina: 100, battery: 100, light: true, got: 0, slow: 0, bob: 0, stepAcc: 0, time: 0 });
  // face down the open corridor
  for (const [d, yaw] of [[[1, 0], -Math.PI / 2], [[0, 1], Math.PI]]) if (!m.wall(start[0] + d[0], start[1] + d[1])) player.yaw = yaw;
  world = w;
  heartT = 0;
  ambT = 10;
  grace = 6;
  endFx = [];
  screenFx = null;
  updateHud(0);
}

function teardown() {
  world.root.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) o.geometry.dispose();
  });
  for (const s of world.sprites) s.dispose();
  for (const s of world.oneShots) s.dispose();
  world.enemy.parts.fire.dispose();
  scene.remove(world.root);
  talismanLights.forEach((l) => (l.intensity = 0));
  candleLights.forEach((l) => (l.intensity = 0));
  world = null;
}

// ---------------------------------------------------------------- collision and sight lines
function solid(x, z) {
  return world.m.wall(tileOf(x), tileOf(z));
}
function blocked(x, z, r = R) {
  return solid(x - r, z - r) || solid(x + r, z - r) || solid(x - r, z + r) || solid(x + r, z + r);
}
function clearLine(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) if (solid(lerp(ax, bx, i / n), lerp(az, bz, i / n))) return false;
  return true;
}

function oneShot(mod, opts, scale, pos) {
  const s = new FxSprite(mod, opts, { scale, position: pos });
  world.root.add(s.sprite);
  world.oneShots.push(s);
  return s;
}

// ---------------------------------------------------------------- the player
function updatePlayer(dt) {
  const p = player;
  const running = input.run && p.stamina > 0 && (input.f || input.b || input.l || input.r || input.mx || input.my);
  let speed = running ? 4.6 : 2.5;
  if (p.slow > 0) {
    speed *= 0.25;
    p.slow -= dt;
  }
  p.stamina = clamp(p.stamina + (running ? -24 : 14) * dt, 0, 100);
  let fx = input.r - input.l + input.mx, fz = input.b - input.f + input.my;
  const len = Math.hypot(fx, fz);
  if (len > 1) {
    fx /= len;
    fz /= len;
  }
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  const vx = (fx * c + fz * s) * speed * dt, vz = (-fx * s + fz * c) * speed * dt;
  if (!blocked(p.x + vx, p.z)) p.x += vx;
  if (!blocked(p.x, p.z + vz)) p.z += vz;
  const moved = Math.hypot(vx, vz);
  p.bob += moved * (running ? 2.4 : 2.9);
  p.stepAcc += moved;
  if (p.stepAcc > (running ? 1.9 : 1.5)) {
    p.stepAcc = 0;
    sound.step(running);
    if (running) noise(13);
  }

  // the flashlight
  if (p.light && p.battery > 0) p.battery = Math.max(0, p.battery - dt * (0.95 + (world.enemy.lit > 0 ? 3.2 : 0)));
  if (p.light && p.battery <= 0 && !p.flat) {
    p.flat = true;
    say("LAMPU SULUH KEHABISAN BATERI...", 3.5);
    sound.click();
  }
  if (p.battery > 0) p.flat = false;

  camera.position.set(p.x, EYE + Math.sin(p.bob) * 0.045, p.z);
  camera.rotation.set(p.pitch, p.yaw, Math.sin(p.bob * 0.5) * 0.008);

  // pick things up
  for (const t of world.talismans) {
    if (t.taken || Math.hypot(t.pos.x - p.x, t.pos.z - p.z) > 1.1) continue;
    t.taken = true;
    t.flame.stop();
    t.light.intensity = 0;
    p.got++;
    sound.chime(1 + p.got * 0.06);
    oneShot(collectBurst, { seed: p.got, palette: ["#040a16", "#0b3a52", "#16908e", "#2cc4b4", "#7ef0dc", "#c8fff2", "#ffffff"] }, 1 / 55, new THREE.Vector3(t.pos.x, 0.6, t.pos.z));
    if (p.got >= NEED) openDoor();
    else {
      say(`AZIMAT ${p.got}/${NEED} - IA SEMAKIN MARAH`, 3.5);
      noise(40); // it always knows when you take one
    }
  }
  for (const b of world.batteries) {
    if (b.taken || Math.hypot(b.g.position.x - p.x, b.g.position.z - p.z) > 0.9) continue;
    b.taken = true;
    b.g.visible = false;
    p.battery = Math.min(100, p.battery + 45);
    sound.chime(1.5);
    say("BATERI +45%", 2);
    oneShot(collectBurst, { seed: 9, palette: ["#061206", "#0e3a12", "#1f6a2a", "#3fae3a", "#9be05a", "#e8ffb0", "#ffffff"] }, 1 / 70, b.g.position.clone());
  }
  for (const t of world.traps) {
    if (t.sprung || tileOf(p.x) !== t.tile[0] || tileOf(p.z) !== t.tile[1]) continue;
    t.sprung = true;
    p.slow = 1.8;
    sound.whisper(0.5, 0);
    sound.creak(0.3);
    say("SESUATU MENARIK KAKI KAMU!", 2.5);
    oneShot(graspingHands, { seed: t.tile[0] * 7 + t.tile[1] }, 1 / 55, new THREE.Vector3(p.x, 0.01, p.z));
    noise(30);
  }
  for (const e of world.eyes) {
    e.cool -= dt;
    if (e.cool > 0 || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 4.5 || !clearLine(e.pos.x, e.pos.z, p.x, p.z)) continue;
    e.cool = 14;
    sound.whisper(0.6, 0);
    say("MATA ITU MELIHAT KAMU...", 2.5);
    alertEnemy(true);
  }
  if (world.door.open && Math.hypot(world.door.pos.x - p.x, world.door.pos.z - p.z) < 1.6) win();
}

function openDoor() {
  const d = world.door;
  d.open = true;
  doorMat.emissive.set(0x2a2a10);
  doorLight.color.set(0xfff0b0);
  doorLight.intensity = 3;
  d.beam = oneShot(lootBeam, { palette: PALE, seed: 4 }, 1 / 40, new THREE.Vector3(d.pos.x - d.dir[0] * 0.5, 0, d.pos.z - d.dir[1] * 0.5));
  sound.stinger();
  say("SEMUA AZIMAT DIKUTIP. PINTU KELUAR TERBUKA - CARI CAHAYA ITU!", 5);
  alertEnemy(true);
}

// ---------------------------------------------------------------- the thing that hunts you
function noise(radius) {
  const e = world.enemy;
  if (e.mode === "gone") return;
  if (Math.hypot(e.g.position.x - player.x, e.g.position.z - player.z) < radius) alertEnemy(false);
}

function alertEnemy(loud) {
  const e = world.enemy;
  if (e.mode === "gone") return;
  if (e.mode !== "hunt" && loud) sound.creak(0.25);
  e.mode = "hunt";
  e.lastSeen = [tileOf(player.x), tileOf(player.z)];
  e.lost = 0;
  e.repath = 0;
}

function relocate(minTiles) {
  const e = world.enemy, m = world.m;
  const d = distances(m, tileOf(player.x), tileOf(player.z));
  const options = floorTiles(m).filter((t) => d[t[0] + t[1] * m.W] >= minTiles);
  const t = options[Math.floor(rand() * options.length)] ?? world.door.tile;
  e.g.position.set(centre(t[0]), 0, centre(t[1]));
  e.path = [];
  e.goal = t;
}

function updateEnemy(dt) {
  const e = world.enemy, g = e.g, m = world.m, p = player;
  const dx = p.x - g.position.x, dz = p.z - g.position.z, dist = Math.hypot(dx, dz);

  if (e.mode === "gone") {
    e.gone -= dt;
    g.visible = false;
    if (e.gone <= 0) {
      relocate(10);
      g.visible = true;
      e.mode = "wander";
      e.lit = 0;
    }
    return dist;
  }

  // can it see you?
  const sees = clearLine(g.position.x, g.position.z, p.x, p.z);
  const range = p.light && p.battery > 0 ? 15 : 6;
  if (sees && (dist < range || dist < 3)) {
    if (e.mode !== "hunt") {
      sound.stinger();
      say("IA NAMPAK KAMU. LARI!", 2.5);
    }
    alertEnemy(false);
  }

  // does your light burn it?
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const toE = new THREE.Vector3(g.position.x - p.x, 1.6 - EYE, g.position.z - p.z);
  const inBeam = p.light && p.battery > 0 && dist < 14 && sees && toE.normalize().dot(fwd) > Math.cos(0.36);
  if (inBeam) {
    e.lit += dt;
    e.screech -= dt;
    if (e.screech <= 0) {
      sound.screech(0.22);
      e.screech = 1.1;
    }
    if (e.lit > 2.4) {
      // it can't bear it: it bursts into smoke and is gone, for now
      oneShot(darkExplosion, { palette: BLOOD, seed: 5 }, 1 / 75, g.position.clone());
      sound.screech(0.4);
      say("IA HILANG KE DALAM GELAP... BUAT SEMENTARA.", 3);
      e.mode = "gone";
      e.gone = 7;
      e.lit = 0;
      return dist;
    }
  } else e.lit = Math.max(0, e.lit - dt * 0.6);

  // where to go
  e.repath -= dt;
  if (e.mode === "hunt") {
    if (sees && dist < 18) {
      e.lastSeen = [tileOf(p.x), tileOf(p.z)];
      e.lost = 0;
    } else e.lost += dt;
    if (e.lost > 7) {
      e.mode = "wander";
      e.path = [];
    }
    if (e.repath <= 0) {
      e.path = path(m, tileOf(g.position.x), tileOf(g.position.z), ...e.lastSeen);
      e.repath = 0.4;
    }
  } else if (!e.path.length) {
    // wander, drifting your way more often than not
    const floors = floorTiles(m);
    const near = floors.filter((t) => Math.abs(t[0] - tileOf(p.x)) + Math.abs(t[1] - tileOf(p.z)) < 9);
    const pick = rand() < 0.55 && near.length ? near : floors;
    e.goal = pick[Math.floor(rand() * pick.length)];
    e.path = path(m, tileOf(g.position.x), tileOf(g.position.z), ...e.goal);
  }

  // move along the path; when hunting and close with a clear line, come straight at you
  let speed = e.mode === "hunt" ? 2.75 + p.got * 0.22 : 1.3;
  if (inBeam) speed *= 0.12;
  if (grace > 0) speed *= 0.3;
  let tx, tz;
  if (e.mode === "hunt" && sees && dist < 5) {
    tx = p.x;
    tz = p.z;
  } else if (e.path.length) {
    const [ix, iz] = e.path[0];
    tx = centre(ix);
    tz = centre(iz);
    if (Math.hypot(tx - g.position.x, tz - g.position.z) < 0.15) e.path.shift();
  }
  if (tx !== undefined) {
    const mx = tx - g.position.x, mz = tz - g.position.z, ml = Math.hypot(mx, mz);
    if (ml > 0.001) {
      const st = Math.min(ml, speed * dt);
      g.position.x += (mx / ml) * st;
      g.position.z += (mz / ml) * st;
      e.walk += st * 2.2;
      const want = Math.atan2(mx, mz);
      let dh = want - e.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      e.heading += dh * Math.min(1, dt * 6);
    }
  }
  // face you when it hunts and sees you
  g.rotation.y = e.mode === "hunt" && sees ? Math.atan2(dx, dz) + Math.PI : e.heading + Math.PI;

  // its body: a lurching walk, arms swinging out of time, a head that twitches
  const P = e.parts;
  P.torso.rotation.z = Math.sin(e.walk) * 0.08;
  P.torso.rotation.x = 0.12 + (e.mode === "hunt" ? 0.18 : 0);
  P.arms[0].rotation.x = Math.sin(e.walk * 0.9) * 0.35 + (inBeam ? -1.1 : 0);
  P.arms[1].rotation.x = Math.sin(e.walk * 0.9 + 2.4) * 0.35 + (inBeam ? -1.3 : 0);
  e.twitch -= dt;
  if (e.twitch <= 0) {
    P.neck.rotation.set((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.9);
    e.twitch = 0.08 + rand() * (e.mode === "hunt" ? 0.25 : 0.9);
  }
  g.position.y = Math.abs(Math.sin(e.walk)) * 0.05;
  P.fire.update(dt, camera);

  if (dist < 0.85 && grace <= 0) caught();
  return dist;
}

// ---------------------------------------------------------------- endings
function caught() {
  state = "caught";
  caughtT = 0;
  sound.scream();
  document.exitPointerLock?.();
  // pixelfx places an effect's origin at its x, y options: centre them low on the HUD
  const W = hudFrame.w, H = hudFrame.h;
  endFx = [
    { fx: createFx(darkExplosion, { palette: BLOOD, seed: 2, x: W / 2, y: H + 12 }), delay: 0.7 },
    { fx: createFx(necroSkulls, { palette: BLOOD, seed: 7, x: W / 2, y: H - 8 }), delay: 1.0 },
  ];
  screenFx = null;
}

function win() {
  state = "won";
  caughtT = 0;
  sound.chime(0.75);
  document.exitPointerLock?.();
  screenFx = createFx(glitchWipe, { color: "#000000", seed: 3 });
}

function formatTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function showScreen(id) {
  for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== id;
  $("touch").hidden = !(touch && id === null && state === "play");
}

// ---------------------------------------------------------------- per frame
function updateWorld(dt) {
  const w = world, p = player;
  for (const s of w.sprites) s.update(dt, camera);
  for (let i = w.oneShots.length - 1; i >= 0; i--) {
    const s = w.oneShots[i];
    s.update(dt, camera);
    if (s.done) {
      if (s === w.door.beam) {
        // keep the beam going: it's a loop, this only happens after a stop
        continue;
      }
      s.dispose();
      w.oneShots.splice(i, 1);
    }
  }
  const time = p.time;
  // candles flicker, and sometimes gutter out when the thing is near
  const ed = Math.hypot(w.enemy.g.position.x - p.x, w.enemy.g.position.z - p.z);
  for (const c of w.candles) {
    const near = Math.hypot(w.enemy.g.position.x - c.pos.x, w.enemy.g.position.z - c.pos.z) < 3.5 && w.enemy.mode !== "gone";
    c.light.intensity = near ? c.base * (Math.random() < 0.5 ? 0.15 : 0.6) : c.base * (0.8 + 0.2 * Math.sin(time * 9 + c.phase) * Math.sin(time * 3.7 + c.phase * 2));
    c.sprite.opacity = near ? 0.4 + Math.random() * 0.6 : 1;
  }
  for (const b of w.batteries) if (!b.taken) {
    b.g.rotation.y += dt * 1.5;
    b.g.position.y = 0.3 + Math.sin(time * 2 + b.g.position.x) * 0.05;
  }
  // the flashlight: steady when you're fine, failing when it's close or the battery is low
  let flick = 1;
  if (p.battery < 15) flick *= Math.random() < 0.08 ? 0.1 : 1;
  if (ed < 6 && w.enemy.mode !== "gone") flick *= Math.random() < (6 - ed) * 0.05 ? 0.05 : 1;
  const on = p.light && p.battery > 0;
  flashlight.intensity = on ? 55 * flick * (0.4 + 0.6 * clamp(p.battery / 30)) : 0;
  doorLight.intensity = w.door.open ? 3 + Math.sin(time * 3) : 0.8 + 0.4 * Math.sin(time * 1.3);
  return ed;
}

const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  const now = timer.getElapsed();
  post.uniforms.time.value = now;

  if (state === "play" && world) {
    player.time += dt;
    grace = Math.max(0, grace - dt);
    updatePlayer(dt);
    if (state === "play") updateEnemy(dt);
    const dist = updateWorld(dt);
    const e = world.enemy;
    const vis = e.mode !== "gone";
    const fear = vis ? clamp(1 - dist / 16) * 0.8 + (e.mode === "hunt" ? 0.2 : 0) : 0;
    post.uniforms.fear.value = lerp(post.uniforms.fear.value, fear, dt * 2);
    post.uniforms.glitch.value = vis && e.lit > 0 ? 0.25 + e.lit * 0.15 : Math.max(0, post.uniforms.glitch.value - dt * 2);
    post.uniforms.flash.value = Math.max(0, post.uniforms.flash.value - dt * 3);
    post.uniforms.dark.value = 1;
    sound.update(camera, e.g.position.clone().setY(1.8), fear, e.mode === "hunt", vis);
    heartT -= dt;
    if (fear > 0.2 && heartT <= 0) {
      sound.heartbeat(fear);
      heartT = lerp(1.3, 0.36, fear);
    }
    ambT -= dt;
    if (ambT <= 0) {
      ambT = 10 + Math.random() * 16;
      if (Math.random() < 0.5) sound.creak(0.1 + Math.random() * 0.15);
      else sound.whisper(0.15, Math.random() * 2 - 1);
    }
    msg.t -= dt;
  } else if (state === "caught" && world) {
    caughtT += dt;
    // it is in your face
    const e = world.enemy, g = e.g, fwd = new THREE.Vector3(Math.sin(player.yaw) * -1, 0, -Math.cos(player.yaw));
    g.visible = true;
    const k = clamp(caughtT / 0.25);
    g.position.set(player.x + fwd.x * lerp(1.8, 0.8, k), lerp(-0.4, -0.95, k), player.z + fwd.z * lerp(1.8, 0.8, k));
    g.rotation.y = Math.atan2(player.x - g.position.x, player.z - g.position.z) + Math.PI;
    player.pitch = lerp(player.pitch, 0.04, dt * 10);
    camera.position.set(player.x + (Math.random() - 0.5) * 0.06, EYE + (Math.random() - 0.5) * 0.05, player.z);
    camera.rotation.set(player.pitch, player.yaw, (Math.random() - 0.5) * 0.08);
    e.parts.neck.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2);
    e.parts.arms[0].rotation.x = -1.6;
    e.parts.arms[1].rotation.x = -1.4;
    updateWorld(dt);
    flashlight.intensity = Math.random() < 0.5 ? 70 : 0;
    post.uniforms.glitch.value = 1;
    post.uniforms.fear.value = 1;
    post.uniforms.flash.value = Math.random() < 0.2 ? 1 : post.uniforms.flash.value * 0.8;
    if (caughtT > 1.5 && !screenFx) screenFx = createFx(crtOff, { color: "#000000", seed: 2, palette: BLOOD });
    if (caughtT > 1.5) post.uniforms.dark.value = Math.max(0, post.uniforms.dark.value - dt * 2);
    if (caughtT > 3.2 && state === "caught") {
      state = "dead";
      $("deadTime").textContent = `Kamu bertahan ${formatTime(player.time)} dan mengutip ${player.got}/${NEED} azimat.`;
      showScreen("dead");
    }
  } else if (state === "won") {
    caughtT += dt;
    post.uniforms.dark.value = Math.max(0, 1 - caughtT * 0.6);
    if (caughtT > 2 && state === "won") {
      state = "done";
      $("winTime").textContent = `Masa: ${formatTime(player.time)}`;
      showScreen("win");
    }
  }

  if (world) {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    post.uniforms.tDiffuse.value = rt.texture;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }
  updateHud(dt);
});

// ---------------------------------------------------------------- HUD, drawn with pixelfx
const C = {
  ink: hex("#d8d0c0"),
  dim: hex("#6a6258"),
  shadow: hex("#000000"),
  teal: hex("#7ef0dc"),
  red: hex("#ff3a2a"),
  amber: hex("#ffc23d"),
  green: hex("#9be05a"),
};
let hudAcc = 0;
function updateHud(dt) {
  hudAcc += dt;
  if (hudAcc < 1 / 30 && dt > 0) return;
  hudAcc = 0;
  if (!hudFrame) return;
  clearFrame(hudFrame);
  const p = painterFor(hudFrame).place(0, 0);
  const W = hudFrame.w, H = hudFrame.h;
  if (world && (state === "play" || state === "paused")) {
    // talismans
    p.text("AZIMAT", 8, 8, C.dim, { font: "mini", shadow: C.shadow });
    for (let i = 0; i < NEED; i++) {
      const got = i < player.got;
      const x = 10 + i * 9, y = 18;
      p.rect(x, y, 5, 7, got ? C.teal : C.dim, got ? 1 : 0.5);
      if (got) p.glow(x + 2.5, y + 3.5, 6, C.teal, 0.25);
    }
    if (world.door.open) p.text("PINTU TERBUKA", 8, 30, C.amber, { font: "mini", shadow: C.shadow });
    // battery
    const bx = 8, by = H - 20, bw = 30, bh = 9, k = clamp(player.battery / 100);
    p.text(player.light ? "LAMPU" : "LAMPU (F)", bx, by - 8, C.dim, { font: "mini", shadow: C.shadow });
    p.rect(bx, by, bw, bh, C.dim);
    p.rect(bx + 1, by + 1, bw - 2, bh - 2, C.shadow);
    p.rect(bx + bw, by + 3, 2, 3, C.dim);
    const col = k > 0.5 ? C.green : k > 0.2 ? C.amber : C.red;
    const fillW = Math.round((bw - 4) * k);
    if (fillW > 0 && (k > 0.15 || Math.floor(player.time * 4) % 2)) p.rect(bx + 2, by + 2, fillW, bh - 4, col, player.light ? 1 : 0.5);
    // stamina, only when it's being used
    if (player.stamina < 99) {
      p.rect(bx, by + bh + 3, bw, 2, C.dim, 0.4);
      p.rect(bx, by + bh + 3, Math.round(bw * player.stamina / 100), 2, C.ink, 0.8);
    }
    // the message
    if (msg.t > 0) {
      // wrap to the HUD's width
      const lines = [];
      for (const word of msg.text.split(" ")) {
        const lastLine = lines[lines.length - 1];
        if (lastLine !== undefined && p.measure(lastLine + " " + word)[0] < W - 16) lines[lines.length - 1] = lastLine + " " + word;
        else lines.push(word);
      }
      const my = W >= H ? H - 44 : Math.round(H * 0.62);
      lines.forEach((l, i) => p.text(l, W / 2, my - (lines.length - 1 - i) * 9, C.ink, { font: "mini", align: "center", outline: C.shadow }));
    }
    // a dot to aim the light
    p.rect(Math.floor(W / 2), Math.floor(H / 2), 1, 1, C.ink, 0.35);
  }
  if (state === "caught") {
    for (const e of endFx) {
      if (e.delay > 0) {
        e.delay -= 1 / 30;
        continue;
      }
      e.fx.update(1 / 30);
      e.fx.draw(hudFrame);
    }
  }
  composite(hudFrame, hudImg.data, null);
  hudCtx.putImageData(hudImg, 0, 0);

  // full-screen transitions
  clearFrame(fxFrame);
  if (screenFx) {
    screenFx.update(1 / 30);
    screenFx.draw(fxFrame);
  }
  composite(fxFrame, fxImg.data, null);
  fxCtx.putImageData(fxImg, 0, 0);
}

// ---------------------------------------------------------------- input
const keys = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
addEventListener("keydown", (e) => {
  if (keys[e.code]) input[keys[e.code]] = 1;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.run = true;
  if (e.code === "KeyF" && state === "play") toggleLight();
  if (e.code === "Escape" && state === "play" && touch) pause();
});
addEventListener("keyup", (e) => {
  if (keys[e.code]) input[keys[e.code]] = 0;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.run = false;
});
addEventListener("blur", () => {
  input.f = input.b = input.l = input.r = 0;
  input.run = false;
});

function toggleLight() {
  player.light = !player.light;
  sound.click();
}

function look(dx, dy) {
  player.yaw -= dx;
  player.pitch = clamp(player.pitch - dy, -1.2, 1.2);
}
document.addEventListener("mousemove", (e) => {
  if (state === "play" && document.pointerLockElement) look(e.movementX * 0.0022, e.movementY * 0.0022);
});
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "play" && !touch) pause();
});

function pause() {
  state = "paused";
  input.f = input.b = input.l = input.r = 0;
  showScreen("pause");
  sound.stopAll();
}

function begin(fresh) {
  sound.start();
  if (fresh) build((Math.random() * 1e9) | 0);
  state = "play";
  showScreen(null);
  post.uniforms.dark.value = 1;
  if (!touch) renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
  if (fresh) say("KUTIP 5 AZIMAT. JANGAN BISING.", 4);
}

$("startBtn").addEventListener("click", () => begin(true));
$("resumeBtn").addEventListener("click", () => begin(false));
$("retryBtn").addEventListener("click", () => begin(true));
$("againBtn").addEventListener("click", () => begin(true));
renderer.domElement.addEventListener("click", () => {
  if (state === "play" && !touch && !document.pointerLockElement) renderer.domElement.requestPointerLock?.();
});

// touch: a stick on the left, look by dragging on the right, two buttons
if (touch) {
  const stick = $("stick"), knob = $("knob");
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
  const area = $("touch");
  area.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest("button")) continue;
      if (t.clientX < innerWidth * 0.45 && stickId === null) {
        stickId = t.identifier;
        sx = t.clientX;
        sy = t.clientY;
        stick.style.left = sx - 50 + "px";
        stick.style.top = sy - 50 + "px";
        stick.hidden = false;
      } else if (lookId === null) {
        lookId = t.identifier;
        lx = t.clientX;
        ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  area.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy;
        const l = Math.hypot(dx, dy);
        if (l > 45) {
          dx *= 45 / l;
          dy *= 45 / l;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.mx = dx / 45;
        input.my = dy / 45;
      } else if (t.identifier === lookId) {
        look((t.clientX - lx) * 0.006, (t.clientY - ly) * 0.006);
        lx = t.clientX;
        ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null;
        input.mx = input.my = 0;
        knob.style.transform = "";
        stick.hidden = true;
      }
      if (t.identifier === lookId) lookId = null;
    }
  };
  area.addEventListener("touchend", end);
  area.addEventListener("touchcancel", end);
  $("lightBtn").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (state === "play") toggleLight();
  });
  const runBtn = $("runBtn");
  runBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    input.run = true;
    runBtn.classList.add("on");
  });
  runBtn.addEventListener("touchend", () => {
    input.run = false;
    runBtn.classList.remove("on");
  });
  $("pauseBtn").addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (state === "play") pause();
  });
  for (const el of document.querySelectorAll(".desk")) el.hidden = true;
} else for (const el of document.querySelectorAll(".mob")) el.hidden = true;

// a dim, slowly drifting view of the house behind the title
build(1234);
state = "title";
showScreen("title");
const titleSpin = () => {
  if (state !== "title") return;
  player.yaw += 0.0015;
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(-0.05, player.yaw, 0);
  for (const s of world.sprites) s.update(1 / 60, camera);
  world.enemy.parts.fire.update(1 / 60, camera);
  requestAnimationFrame(titleSpin);
};
titleSpin();

// for automated checks
window.__senyap = { get state() { return state; }, set grace(v) { grace = v; }, player, get world() { return world; }, input, begin, look };
