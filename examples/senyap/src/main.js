// SENYAP · Hotel Malam. Seven night shifts as the security guard of Hotel Seri Malam: patrol clocks,
// reports phoned in from rooms that should be empty, the CCTV in the post, and Bayang, which hunts by sound
// and sight. three.js draws the hotel at a low resolution; pixelfx draws the HUD, the effects in the world,
// the jumpscare and the transitions.
import * as THREE from "three";
import { createFrame, clearFrame, createFx, composite, painterFor, hex } from "../../../src/core/index.js";
import * as darkExplosion from "../../../src/fx/shadow/dark-explosion.js";
import * as necroSkulls from "../../../src/fx/shadow/necro-skulls.js";
import * as crtOff from "../../../src/fx/transitions/crt-off.js";
import * as glitchWipe from "../../../src/fx/transitions/glitch-wipe.js";
import * as questComplete from "../../../src/fx/ui/quest-complete.js";
import { T, LEVEL_GAP, FLOOR, FLOOR_ORDER, FLOOR_NAME, ARRIVE, START } from "./data/maps.js";
import { NIGHTS, NOTES } from "./data/story.js";
import { Hotel } from "./world.js";
import { Bayang, BLOOD } from "./bayang.js";
import { Sound } from "./audio.js";

const EYE = 1.6;
const R = 0.3;
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const touch = matchMedia("(pointer: coarse)").matches;
const SHIFT_START = 23 * 60, SHIFT_END = 30 * 60, MIN_PER_SEC = 0.6;

// ---------------------------------------------------------------- saved progress and settings
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("senyap-hotel:" + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("senyap-hotel:" + k, JSON.stringify(v));
    } catch {}
  },
};
const settings = { volume: 0.9, subs: true, sens: 1, ...store.get("settings", {}) };
let progress = { night: 1, done: false, ...store.get("progress", {}) };
let playerName = store.get("name", "") || "";

// ---------------------------------------------------------------- renderer: low resolution, then one pass
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$("game").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.075);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 60);
camera.rotation.order = "YXZ";
scene.add(camera);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const post = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fear: { value: 0 }, glitch: { value: 0 }, flash: { value: 0 }, dark: { value: 1 }, cctv: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, fear, glitch, flash, dark, cctv;
    uniform vec2 res;
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
      float band = floor(uv.y * 36.0), tick = floor(time * 18.0);
      float g = glitch * step(0.62, hash(vec2(band, tick))) + cctv * 0.15 * step(0.93, hash(vec2(band, tick)));
      uv.x += (hash(vec2(band, tick + 3.0)) - 0.5) * 0.12 * g;
      uv.y += sin(uv.x * 40.0 + time * 9.0) * 0.002 * fear;
      float ca = 0.0015 + fear * 0.004 + glitch * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      vec2 d = vUv - 0.5;
      col *= clamp(1.0 - dot(d, d) * (1.4 + fear * 1.6 + cctv * 1.2), 0.0, 1.0);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l * 1.25, l * 0.42, l * 0.38), fear * 0.5 * (1.0 - cctv));
      // the security camera: green, grainy, rolling scanlines
      float nl = clamp(l * 3.2, 0.0, 1.0);
      vec3 cam = vec3(nl * 0.55, nl * 1.3 + 0.04, nl * 0.6);
      cam *= 0.85 + 0.15 * sin(gl_FragCoord.y * 3.14159 + time * 30.0);
      cam *= 0.92 + 0.08 * step(0.5, fract(vUv.y * 3.0 - time * 0.2));
      col = mix(col, cam, cctv);
      col += (hash(gl_FragCoord.xy + fract(time) * 91.0) - 0.5) * (0.045 + fear * 0.05 + glitch * 0.2 + cctv * 0.12);
      col += flash * vec3(0.55, 0.0, 0.02);
      col *= dark;
      float levels = 18.0;
      col = floor(col * levels + bayer(gl_FragCoord.xy)) / levels;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const monitorRT = new THREE.WebGLRenderTarget(96, 72);

const hudCanvas = $("hud"), hudCtx = hudCanvas.getContext("2d");
let hudFrame, hudImg;
const fxCanvas = $("fxscreen"), fxCtx = fxCanvas.getContext("2d");
const fxFrame = createFrame(320, 180), fxImg = fxCtx.createImageData(320, 180);

function resize() {
  const w = innerWidth, h = innerHeight, k = Math.max(2, Math.round(Math.min(w, h * 1.6) / 380));
  const rw = Math.max(160, Math.round(w / k)), rh = Math.max(90, Math.round(h / k));
  renderer.setSize(rw, rh, false);
  rt.setSize(rw, rh);
  camera.aspect = rw / rh;
  camera.updateProjectionMatrix();
  const short = 180;
  const hw = w >= h ? Math.round((short * w) / h) : short, hh = w >= h ? short : Math.round((short * h) / w);
  hudCanvas.width = hw;
  hudCanvas.height = hh;
  hudFrame = createFrame(hw, hh);
  hudImg = hudCtx.createImageData(hw, hh);
}
addEventListener("resize", resize);
resize();

// flashlight and a faint fill, carried with the camera
const hemi = new THREE.HemisphereLight(0x3a4058, 0x140a06, 0.42);
scene.add(hemi);
const flashlight = new THREE.SpotLight(0xffe6c0, 50, 26, 0.44, 0.55, 1.6);
flashlight.position.set(0.18, -0.22, 0.05);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.3;
flashlight.shadow.camera.far = 26;
flashlight.shadow.bias = -0.0008;
camera.add(flashlight);
flashlight.target.position.set(0, -0.05, -1);
camera.add(flashlight.target);
const fill = new THREE.PointLight(0x8090b0, 0.6, 4, 2);
camera.add(fill);

// ---------------------------------------------------------------- the game's state
const sound = new Sound();
sound.volume = settings.volume;
let hotel = null, bayang = null, night = null, ctx = null;
let state = "title"; // title | day | play | paused | caught | dead | report | ending
const input = { f: 0, b: 0, l: 0, r: 0, run: false, mx: 0, my: 0 };
const P = {
  floor: "G", x: 0, z: 0, yaw: 0, pitch: 0, stamina: 100, battery: 100, light: true,
  mode: "walk", // walk | hide | cctv | travel | read | choose
  hidden: null, bob: 0, stepAcc: 0, moveT: 0, still: 0, keys: new Map(), zone: null,
};
let tasks = [], timers = [], handlers = {}, ringing = {}, loops = {}, log = [], time = 0, clockMin = SHIFT_START, clockStopped = null;
let heartT = 0, caughtT = 0, endFx = [], screenFx = null, bannerFx = null, nearLift = {}, dragCapT = 0, checkpointData = null;
let pending = 0;
let cctvIdx = 0, monitorT = 0, monitorCam = 0, humOn = true, focus = null;

const night_ = (n) => NIGHTS[n - 1];

// ---------------------------------------------------------------- HTML overlays
let subsQueue = [];
function sub(text, dur = 3, kind = "line") {
  if (kind === "caption" && !settings.subs) return;
  const el = document.createElement("div");
  el.className = "sub " + kind;
  el.textContent = text;
  $("subs").appendChild(el);
  subsQueue.push({ el, t: dur });
  while (subsQueue.length > 3) subsQueue.shift().el.remove();
}
function popup(title, sub2) {
  $("popTitle").textContent = title;
  $("popSub").textContent = sub2 ?? "";
  const el = $("popup");
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(popup.t);
  popup.t = setTimeout(() => (el.hidden = true), 3200);
}
function hint(text) {
  $("hintText").textContent = text;
  $("hint").hidden = false;
  clearTimeout(hint.t);
  hint.t = setTimeout(() => ($("hint").hidden = true), 7000);
}
function openNote(title, text) {
  $("noteTitle").textContent = title;
  $("noteText").textContent = text;
  $("note").hidden = false;
  P.prevMode = P.mode === "read" ? P.prevMode : P.mode;
  P.mode = "read";
  sound.play("click");
}
function closeNote() {
  $("note").hidden = true;
  P.mode = P.prevMode === "read" ? "walk" : P.prevMode ?? "walk";
  relock();
}
function showScreen(id) {
  for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== id;
  $("touch").hidden = !(touch && id === null && state === "play");
  if (id !== null) {
    $("chooser").hidden = true;
    $("note").hidden = true;
    $("hint").hidden = true;
    $("popup").hidden = true;
    for (const s of subsQueue) s.el.remove();
    subsQueue = [];
  }
}

// ---------------------------------------------------------------- where things are
function where(w) {
  if (typeof w === "string") {
    const p = hotel.props[w];
    return p ? { floor: p.floor, pos: p.pos.clone() } : null;
  }
  if (!w) return null;
  return { floor: w.floor, pos: hotel.pos(w.floor, w.x, w.y, w.h ?? 1.2) };
}
function muffleTo(w) {
  if (!w) return 0;
  if (w.floor !== P.floor) return 1;
  return hotel.clearLine(P.floor, P.x, P.z, w.pos.x, w.pos.z) ? 0 : 0.6;
}
function dirWord(w) {
  if (!w) return "";
  if (w.floor !== P.floor) return FLOOR[w.floor].level > FLOOR[P.floor].level ? "dari atas" : "dari bawah";
  const dx = w.pos.x - P.x, dz = w.pos.z - P.z, d = Math.hypot(dx, dz);
  if (d < 1.5) return "dekat kamu";
  const a = Math.atan2(-dx, -dz) - P.yaw, c = Math.cos(a), s = Math.sin(a);
  const side = Math.abs(c) > Math.abs(s) ? (c > 0 ? "di depan" : "di belakang") : s > 0 ? "di kiri" : "di kanan";
  return d > 14 ? side + ", jauh" : side;
}
const CAPTIONS = {
  bell: "loceng kaunter", knock: "ketukan", step: "langkah kaki", slam: "pintu terhempas", thump: "dentuman dari dobi", water: "air mengalir",
  drag: "seretan kain", liftding: "loceng lif", breaker: "suis berdetap", keys: "kunci bergemerincing", whisper: "bisikan", door: "pintu berkeriut", hands: "sesuatu bergerak di dalam tab",
};
function sfx(name, w, o) {
  const at = where(w);
  sound.play(name, at ? sound.at(at.pos, muffleTo(at)) : null, o);
  if (CAPTIONS[name] && at) sub(`[${CAPTIONS[name]} ${dirWord(at)}]`, 2.6, "caption");
  return at;
}
function noiseAt(at, radius) {
  if (at && bayang) bayang.noise(at.floor, at.pos.x, at.pos.z, radius);
}

// ---------------------------------------------------------------- the story's handle on the game
function emit(evt, ...a) {
  let handled = false;
  for (const fn of (handlers[evt] ?? []).slice()) if (fn(...a) === true) handled = true;
  return handled;
}
function makeCtx(n, flags, resume) {
  const c = {
    night: n,
    name: playerName || "Pengawal",
    flags,
    resume,
    get time() {
      return time;
    },
    player: {
      get floor() {
        return P.floor;
      },
      get x() {
        return P.x / T;
      },
      get y() {
        return P.z / T;
      },
    },
    on(evt, fn) {
      (handlers[evt] ??= []).push(fn);
    },
    once(evt, fn) {
      const w = (...a) => {
        handlers[evt] = handlers[evt].filter((f) => f !== w);
        return fn(...a);
      };
      c.on(evt, w);
    },
    task(id, text) {
      if (!tasks.find((t) => t.id === id)) tasks.push({ id, text, done: false, at: time });
    },
    done(id) {
      const t = tasks.find((t) => t.id === id);
      if (!t || t.done) return;
      t.done = true;
      t.at = time;
      sound.play("chime");
      emit("done:" + id);
      checkReady();
    },
    isDone: (id) => !!tasks.find((t) => t.id === id && t.done),
    has: (id) => !!tasks.find((t) => t.id === id),
    after(sec, fn, tag) {
      timers.push({ t: time + sec, fn, tag });
    },
    // a report that will phone in later: the shift can't be written up until it has
    expect() {
      pending++;
    },
    arrived() {
      pending = Math.max(0, pending - 1);
      checkReady();
    },
    say: (text, dur = 3) => sub(text, dur, "say"),
    caption: (text, w) => sub(w ? text.replace("]", " " + dirWord(where(w)) + "]") : text, 2.6, "caption"),
    hint,
    popup,
    read: (title, text) => openNote(title, text),
    note(id) {
      const nt = NOTES[id];
      openNote(nt.title, nt.text);
      const seen = new Set(store.get("notes", []));
      seen.add(id);
      store.set("notes", [...seen]);
    },
    sfx: (name, w, o) => sfx(name, w, o),
    loop(name, w) {
      const at = where(w);
      loops[name] = sound.loop(name, at ? sound.at(at.pos, muffleTo(at)) : null);
    },
    stopLoop(name) {
      loops[name]?.stop();
      delete loops[name];
    },
    noise(w, radius) {
      noiseAt(where(w), radius);
    },
    ring(phoneId, onAnswer, o = {}) {
      const at = where(phoneId);
      ringing[phoneId] = {
        onAnswer,
        attract: o.attract !== false,
        auto: o.autoAnswer ?? null,
        t: 0,
        handle: sound.ring(
          () => sound.at(at.pos, muffleTo(at)),
          () => {
            sub(`[telefon berdering ${dirWord(at)}]`, 2.4, "caption");
            if (o.attract !== false) noiseAt(at, 9);
          },
        ),
      };
    },
    lines(lines, w) {
      speak(lines, w ? where(w) : null);
    },
    item: (spec) => spawnItem(spec),
    key(id, name, place) {
      P.keys.set(id, name ?? id);
      if (name) {
        popup(name, place);
        sound.play("keys");
      }
    },
    hasKey: (id) => P.keys.has(id),
    door(label) {
      const d = hotel.doorByLabel(label);
      return d ?? { lock() {} };
    },
    reveal: (label) => hotel.reveal(label),
    light: (id, v) => hotel.setLight(id, v),
    flicker: (id, v) => hotel.flicker(id, v),
    power(on) {
      hotel.setPower(on);
      if (!on) sound.play("slam");
    },
    candles: (list) => list.forEach(([f, x, y, h]) => hotel.candle(f, x, y, h)),
    eyes: (list) => list.forEach(([f, x, y]) => hotel.eye(f, x, y)),
    hands(f, x, y) {
      hotel.hands(f, x, y);
      sfx("hands", { floor: f, x, y, h: 0.6 });
    },
    curtain: (label, on) => hotel.curtain(label, on),
    hum(on) {
      humOn = on;
    },
    liftArrive(f) {
      hotel.liftDoors(f, true);
      const at = sfx("liftding", `lift_${f}`);
      noiseAt(where({ floor: f, x: hotel.lifts[f].x + 0.5, y: hotel.lifts[f].y + 0.5 }), 30);
      c.after(7, () => hotel.liftDoors(f, false));
      return at;
    },
    liftDoors: (f, open) => {
      hotel.liftDoors(f, open);
      sfx("liftdoor", `lift_${f}`);
    },
    bayang: {
      wake: () => bayang.wake(),
      place: (f, x, y) => bayang.place(f, x, y),
      investigate: (f, x, y, o) => bayang.investigate(f, x, y, o),
      hunt: () => bayang.hunt(),
      glimpse: (o) => bayang.glimpse(o),
      staticFigure: (f, x, y) => bayang.staticFigure(f, x, y),
    },
    report: (e) => log.push(e),
    checkpoint() {
      checkpointData = { night: n, flags: { ...flags }, battery: P.battery, at: [P.floor, P.x / T, P.z / T, P.yaw] };
    },
    win: () => win(),
    behind(dist) {
      return { floor: P.floor, x: (P.x + Math.sin(P.yaw) * dist) / T, y: (P.z + Math.cos(P.yaw) * dist) / T, h: 0.1 };
    },
  };
  return c;
}

// the lines of a call or a voice, one after another, with subtitles
function speak(lines, at) {
  let t = 0;
  for (const [who, text, style] of lines) {
    ctx.after(t, () => {
      if (style === "caption") return sub(text, 2.4, "caption");
      const dest = style === "phone" || style === "self" || !at ? null : sound.at(at.pos, muffleTo(at), 0.4);
      const dur = sound.voice(text, style, dest) || 1;
      const name = who === "Kamu" ? "" : who === "?" ? "SUARA: " : `${who.toUpperCase()}${style === "phone" ? " (telefon)" : style === "speaker" ? " (pembesar suara lif)" : ""}: `;
      sub(name + text, Math.max(2.4, dur + 1.4), who === "Kamu" ? "self" : "line");
    });
    t += Math.max(2.2, text.length * 0.055 + 1.2);
  }
}

function checkReady() {
  if (night.n === 7 || tasks.find((t) => t.id === "write")) return;
  if (tasks.length && tasks.every((t) => t.done) && pending > 0) {
    // nothing left to do but wait: bring the next call forward
    for (const t of timers) if (t.tag === "report") t.t = Math.min(t.t, time + 6);
    return;
  }
  if (tasks.length && tasks.every((t) => t.done)) {
    tasks.push({ id: "write", text: "Kembali ke pos dan tulis laporan", done: false, at: time });
    sub("Semua tugas selesai. Kembali ke pos.", 3, "say");
  }
}

// ---------------------------------------------------------------- items
function spawnItem(s) {
  const pos = hotel.pos(s.floor, s.x, s.y, s.h ?? 0.1);
  let mesh = null, sprite = null;
  const g = new THREE.Group();
  g.position.copy(pos);
  if (s.kind === "battery") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x1f5a2a, metalness: 0.3, roughness: 0.5 }));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.05;
    g.add(body);
    sprite = hotel.glow(pos.clone().add(new THREE.Vector3(0, 0.08, 0)), [120, 255, 120], 0.35);
  } else if (s.kind === "key") {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 }));
    k.position.y = 0.01;
    g.add(k);
    sprite = hotel.keySprite(pos.clone().add(new THREE.Vector3(0, 0.05, 0)));
  } else {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 1, side: THREE.DoubleSide }));
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.4;
    paper.position.y = 0.005;
    g.add(paper);
    sprite = hotel.glow(pos.clone().add(new THREE.Vector3(0, 0.05, 0)), [255, 240, 200], 0.3);
  }
  hotel.root.add(g);
  mesh = g;
  const label = s.label ?? (s.kind === "battery" ? "Ambil bateri" : s.kind === "key" ? `Ambil ${s.key?.[1] ?? "kunci"}` : "Baca nota");
  hotel.addInteract({ id: s.id, kind: "item", floor: s.floor, pos: pos.clone().add(new THREE.Vector3(0, 0.2, 0)), label, radius: 1.7, item: { ...s, mesh, sprite } });
}

function takeItem(it) {
  const s = it.item;
  it.gone = true;
  s.mesh.removeFromParent();
  if (s.sprite?.isSprite) s.sprite.removeFromParent();
  else if (s.sprite) hotel.removeSprite(s.sprite);
  if (s.kind === "battery") {
    P.battery = Math.min(100, P.battery + 45);
    popup("Bateri", "+45% lampu suluh");
    sound.play("chime", null, { pitch: 1.5 });
  } else if (s.kind === "key") {
    ctx.key(...s.key);
    hotel.burst(s.mesh.position.clone().add(new THREE.Vector3(0, 0.2, 0)), ["#140c04", "#3a2408", "#6a4614", "#a87a2a", "#e0b450", "#fff4c8", "#ffffff"]);
  } else if (s.note) ctx.note(s.note);
  emit("pickup:" + s.id);
}

// ---------------------------------------------------------------- starting a night
function startNight(n, { fromCheckpoint = false } = {}) {
  night = night_(n);
  if (hotel) {
    hotel.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    scene.remove(hotel.root);
  }
  for (const r of Object.values(ringing)) r.handle.stop();
  for (const l of Object.values(loops)) l.stop();
  hotel = new Hotel(scene);
  hotel.buildRain();
  tasks = [];
  timers = [];
  handlers = {};
  ringing = {};
  loops = {};
  log = [];
  pending = 0;
  time = 0;
  humOn = true;
  nearLift = {};
  P.keys = new Map();
  for (const k of night.keys ?? []) P.keys.set(k, k === "maint" ? "Kunci Penyelenggaraan" : k);
  clockStopped = night.stopClock ?? null;
  clockMin = SHIFT_START;
  const cp = fromCheckpoint && checkpointData?.night === n ? checkpointData : null;
  bayang = new Bayang(hotel, {
    onSee() {
      sound.play("stinger");
      sub("Ia nampak kamu. LARI!", 2.2, "say");
    },
    onCatch: () => caught(),
    onBanish() {
      hotel.sprite(darkExplosion, { palette: BLOOD, seed: 5 }, 1 / 75, new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor), bayang.z), hotel.oneShots);
      sound.play("screech", sound.at(new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor) + 1.8, bayang.z)), { vol: 0.4 });
      sub("Ia hilang ke dalam gelap... buat sementara.", 3, "say");
    },
    onScreech: () => sound.play("screech", sound.at(new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor) + 1.8, bayang.z)), { vol: 0.2 }),
    onDoor: (d) => sfx("door", { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 }),
    onSlam: (d) => sfx("slam", { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 }),
    onListen: () => {},
  });
  bayang.reset(night.bayang);
  const flags = cp ? { ...cp.flags } : {};
  ctx = makeCtx(n, flags, !!cp);
  const [f, x, y, yaw] = cp ? cp.at : night.start === "sofa" ? START.sofa : START.post;
  Object.assign(P, { floor: f, x: x * T, z: y * T, yaw, pitch: 0, stamina: 100, battery: cp ? Math.max(cp.battery, 40) : 100, light: true, mode: "walk", hidden: null, zone: null, still: 0 });
  night.setup(ctx);
  // every door's default lock text; guest rooms are locked unless a report opens them
  for (const d of hotel.doors) if (d.locked && !d.lockMsg) d.lockMsg = d.key ? `Berkunci. Perlu ${d.key === "maint" ? "Kunci Penyelenggaraan" : "kunci"}.` : /^\d+$/.test(d.label ?? "") ? "Bilik tetamu berkunci. Tiada laporan dari bilik ini." : "Berkunci.";
  state = "play";
  showScreen(null);
  post.uniforms.dark.value = 0;
  screenFx = null;
  emit("start");
  if (cp) sub("Disambung dari titik sambung.", 2.5, "say");
  sub(`MALAM ${n} · ${night.title.toUpperCase()}`, 3, "say");
  relock();
}

// ---------------------------------------------------------------- interaction
function findFocus() {
  if (P.mode !== "walk") return null;
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  let best = null, score = -Infinity;
  for (const it of hotel.interactables) {
    if (it.gone || it.floor !== P.floor) continue;
    if (it.kind === "door" && it.door.hidden) continue;
    const dx = it.pos.x - camera.position.x, dy = it.pos.y - camera.position.y, dz = it.pos.z - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d > it.radius) continue;
    const to = new THREE.Vector3(dx, dy * 0.5, dz).normalize(), dot = to.dot(fwd);
    if (dot < (d < 0.9 ? -0.2 : 0.55)) continue;
    const s = dot * 2 - d * 0.6;
    if (s > score && (it.kind === "door" || hotel.clearLine(P.floor, P.x, P.z, it.pos.x + Math.sign(-dx) * 0.3, it.pos.z + Math.sign(-dz) * 0.3) || d < 1.3)) {
      score = s;
      best = it;
    }
  }
  return best;
}
function promptFor(it) {
  if (!it) return null;
  if (it.kind === "door") {
    const d = it.door;
    return d.open ? `Tutup pintu${d.label ? " " + d.label : ""}` : `Buka pintu${d.label ? " " + d.label : ""}`;
  }
  if (it.kind === "phone") return ringing[it.id] ? "Jawab telefon" : it.label;
  if (it.kind === "lift") return "Panggil lif";
  if (it.kind === "stairs") return "Guna tangga";
  return it.label ?? "Periksa";
}

function interact() {
  if (state !== "play") return;
  if (P.mode === "read") return closeNote();
  if (P.mode === "hide") return leaveHide();
  if (P.mode === "cctv") return leaveCctv();
  if (P.mode === "choose") return closeChooser();
  const it = focus;
  if (!it) return;
  if (it.kind === "door") return useDoor(it.door);
  if (it.kind === "item") return takeItem(it);
  if (it.kind === "phone" && ringing[it.id]) return answer(it.id);
  if (it.kind === "lift") return callLift(it.floor);
  if (it.kind === "stairs") return openChooser("stairs");
  if (emit("interact:" + it.id)) return;
  switch (it.kind) {
    case "punch":
      sfx("beep", it.id);
      noiseAt(where(it.id), 6);
      if (emit("punch:" + it.id)) return;
      return sub("Jam rondaan ditekan.", 2, "say");
    case "cctv":
      return enterCctv();
    case "hide":
    case "wardrobe":
      return it.hideAt ? enterHide(it) : null;
    case "logbook":
      return writeReport();
    case "phone":
      sound.play("click");
      return sub("Gagang diangkat. Hanya bunyi desis.", 2.5, "say");
    case "exitDoor":
      sound.play("locked");
      return sub("Pintu servis berkunci.", 2.5, "say");
    case "mainDoor":
      sound.play("locked");
      return sub("Pintu utama berkunci dari luar.", 2.5, "say");
    default:
      if (it.examine) sub(it.examine, 3, "say");
      else sub("Tiada apa-apa yang luar biasa.", 2, "say");
  }
}

function useDoor(d) {
  const at = { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 };
  if (!d.open && d.locked) {
    if (d.key && P.keys.has(d.key)) {
      d.locked = false;
      sound.play("keys");
      sub(`Dibuka dengan ${P.keys.get(d.key)}.`, 2, "say");
    } else {
      sfx("locked", at);
      return sub(d.lockMsg ?? "Berkunci.", 2.5, "say");
    }
  }
  if (d.open) {
    // don't shut it on yourself
    if (Math.floor(P.x / T) === d.x && Math.floor(P.z / T) === d.y) return;
  }
  d.open = !d.open;
  sfx("door", at);
  noiseAt(where(at), 4);
  if (d.open && d.label) emit("door:" + d.label);
}

function answer(id) {
  const r = ringing[id];
  r.handle.stop();
  delete ringing[id];
  sound.play("click");
  r.onAnswer?.();
  emit("answer:" + id);
}

// ---------------------------------------------------------------- hiding
function enterHide(it) {
  P.hidden = { x: it.hideAt.x, z: it.hideAt.z, face: it.hideAt.face, back: [P.x, P.z], light: P.light };
  P.mode = "hide";
  P.light = false;
  sound.play("door", sound.at(it.pos));
  noiseAt(where(it.id), 3);
  P.yaw = Math.atan2(-P.hidden.face[0], -P.hidden.face[1]);
  P.pitch = -0.05;
}
function leaveHide() {
  const h = P.hidden;
  P.x = h.x + h.face[0] * 0.75 * T * 0.5 + h.face[0] * 0.5;
  P.z = h.z + h.face[1] * 0.75 * T * 0.5 + h.face[1] * 0.5;
  if (hotel.blocked(P.floor, P.x, P.z, R)) [P.x, P.z] = h.back;
  P.light = h.light;
  P.hidden = null;
  P.mode = "walk";
  sound.play("door", null);
}

// ---------------------------------------------------------------- CCTV
function enterCctv() {
  if (!hotel.powered) return sub("Monitor gelap. Tiada kuasa.", 2.5, "say");
  P.mode = "cctv";
  cctvIdx = 0;
  $("cctvUI").hidden = !touch;
  sound.play("click");
  emit("cctv");
  emit("cctv:" + hotel.cameras[cctvIdx].id);
}
function switchCam(d) {
  cctvIdx = (cctvIdx + d + hotel.cameras.length) % hotel.cameras.length;
  sound.play("click");
  emit("cctv:" + hotel.cameras[cctvIdx].id);
}
function leaveCctv() {
  P.mode = "walk";
  $("cctvUI").hidden = true;
}

// ---------------------------------------------------------------- stairs and lift
let chooserVia = "stairs";
function openChooser(via) {
  chooserVia = via;
  const box = $("chooserBtns");
  box.innerHTML = "";
  const here = FLOOR_ORDER.indexOf(P.floor);
  const options = via === "stairs" ? FLOOR_ORDER.filter((f, i) => Math.abs(i - here) === 1) : FLOOR_ORDER.filter((f) => f !== P.floor && hotel.lifts[f]);
  let k = 1;
  for (const f of options.slice().reverse()) {
    const b = document.createElement("button");
    const open = night.floors.includes(f);
    const label = `${k} · ${FLOOR_NAME[f]}${open ? "" : " (ditutup)"}`;
    b.textContent = via === "stairs" ? `${FLOOR_ORDER.indexOf(f) > here ? "Naik" : "Turun"} ke ${label.slice(4)}` : label;
    b.disabled = !open;
    b.dataset.key = String(k);
    b.addEventListener("click", () => travel(f, via));
    box.appendChild(b);
    k++;
  }
  $("chooserTitle").textContent = via === "stairs" ? "Tangga" : "Lif";
  $("chooserHint").textContent = touch ? "" : "Tekan nombor, atau E untuk batal";
  $("chooser").hidden = false;
  P.mode = "choose";
}
function closeChooser() {
  $("chooser").hidden = true;
  if (P.mode === "choose") P.mode = "walk";
  if (chooserVia === "lift") hotel.liftDoors(P.floor, false);
  relock();
}
function callLift(f) {
  if (!hotel.powered) {
    sound.play("click");
    return sub("Butang lif tidak menyala. Tiada kuasa.", 2.5, "say");
  }
  hotel.liftDoors(f, true);
  const at = where(`lift_${f}`) ?? { floor: f, pos: hotel.pos(f, hotel.lifts[f].x + 0.5, hotel.lifts[f].y + 0.5, 1.5) };
  sound.play("liftding", sound.at(at.pos));
  sub("[loceng lif]", 2, "caption");
  noiseAt(at, 30);
  ctx.after(0.8, () => openChooser("lift"));
}
function travel(f, via) {
  $("chooser").hidden = true;
  P.mode = "travel";
  relock();
  const from = P.floor;
  if (via === "lift") hotel.liftDoors(from, false);
  const dur = via === "lift" ? 3.2 : 2.6;
  P.travel = { t: 0, dur, to: f, via, from };
  sound.play(via === "lift" ? "lift" : "stairs");
  if (bayang.hunting && bayang.floor === from) bayang.follow(f, via);
}
function arrive() {
  const { to, via } = P.travel;
  const a = ARRIVE[to][via];
  P.floor = to;
  P.x = a[0] * T;
  P.z = a[1] * T;
  P.yaw = a[2];
  P.pitch = 0;
  P.mode = "walk";
  P.travel = null;
  if (via === "lift") {
    hotel.liftDoors(to, true);
    const at = { floor: to, pos: hotel.pos(to, hotel.lifts[to].x + 0.5, hotel.lifts[to].y + 0.5, 1.5) };
    sound.play("liftding", sound.at(at.pos));
    noiseAt(at, 30);
    ctx.after(4, () => hotel.liftDoors(to, false));
  }
  sub(FLOOR_NAME[to], 1.8, "say");
  emit("floor:" + to);
  emit(`${via}:${to}`);
}

// ---------------------------------------------------------------- the end of a shift
function writeReport() {
  if (!tasks.find((t) => t.id === "write")) {
    const left = tasks.find((t) => !t.done);
    return sub(left ? `Belum boleh tulis laporan: ${left.text.toLowerCase()}.` : "Tiada apa untuk dilaporkan.", 3, "say");
  }
  tasks.find((t) => t.id === "write").done = true;
  sound.play("chime");
  if (emit("report")) return;
  endNight();
}
function endNight() {
  state = "report";
  document.exitPointerLock?.();
  for (const r of Object.values(ringing)) r.handle.stop();
  for (const l of Object.values(loops)) l.stop();
  bannerFx = createFx(questComplete, { text: "SYIF SELESAI", seed: 8, x: hudFrame.w / 2, y: hudFrame.h / 2 - 20, palette: ["#140a04", "#3a1e08", "#6a3a0e", "#9a5a14", "#c88a2a", "#e8b860", "#f8e8c0", "#ffffff"], ribbon: ["#080406", "#1a0a0c", "#3a1218", "#5a1a22", "#7a2430", "#9a3a3a", "#c06a5a"] });
  const name = (playerName || "Pengawal").toUpperCase();
  const punches = tasks.filter((t) => t.id.startsWith("punch_"));
  const rows = [
    ["Malam", `${night.n} · ${night.title}`],
    ["Pengawal", name],
    ["Masa laporan", clockText()],
    ["Jam rondaan", punches.length ? `${punches.filter((t) => t.done).length}/${punches.length}` : "-"],
  ];
  $("repTitle").textContent = `LAPORAN SYIF · MALAM ${night.n}`;
  $("repMeta").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("repLog").innerHTML =
    (log.length ? log : [{ room: "-", issue: "Tiada laporan dari bilik.", action: "" }])
      .map((e) => `<li><b>${e.room}</b><span>${e.issue}</span>${e.action ? `<em>Tindakan: ${e.action}</em>` : ""}</li>`)
      .join("") + night.report.map((r) => `<li class="obs"><span>${r}</span></li>`).join("");
  $("repTwist").hidden = !night.finale;
  if (night.finale) $("repTwist").textContent = `Malam 7: ${name} · DITANDA KELUAR · 03:17`;
  $("repNote").textContent = night.finale ? "Kamu tidak menulis baris terakhir itu. Pen masih bergerak apabila kamu melepaskannya." : "";
  progress.night = Math.max(progress.night, night.n + 1);
  store.set("progress", progress);
  checkpointData = null;
  // the banner plays over the frozen hotel, then the form
  setTimeout(() => state === "report" && showScreen("report"), 2600);
}
function showDay(n) {
  const nt = night_(n);
  state = "day";
  document.exitPointerLock?.();
  $("dayTitle").textContent = n === 7 ? "MALAM 7" : `HARI ${n}`;
  $("dayName").textContent = nt.title;
  $("dayFrom").textContent = nt.day.from ? `Mesej daripada ${nt.day.from}` : "";
  $("dayFrom").hidden = !nt.day.from;
  $("dayText").textContent = nt.day.text;
  $("dayHint").textContent = nt.day.hint ?? "";
  $("dayHint").hidden = !nt.day.hint;
  $("dayBtn").textContent = n === 7 ? "BANGUN" : "MULA SYIF";
  $("dayBtn").onclick = () => begin(n);
  showScreen("day");
}

function caught() {
  if (state !== "play") return;
  state = "caught";
  caughtT = 0;
  if (P.hidden) {
    P.mode = "walk";
    P.hidden = null;
  }
  $("note").hidden = true;
  $("chooser").hidden = true;
  sound.play("scream");
  document.exitPointerLock?.();
  const W = hudFrame.w, H = hudFrame.h;
  endFx = [
    { fx: createFx(darkExplosion, { palette: BLOOD, seed: 2, x: W / 2, y: H + 12 }), delay: 0.7 },
    { fx: createFx(necroSkulls, { palette: BLOOD, seed: 7, x: W / 2, y: H - 8 }), delay: 1.0 },
  ];
  screenFx = null;
}
function failShift(text) {
  state = "dead";
  document.exitPointerLock?.();
  $("deadTitle").textContent = "SYIF GAGAL";
  $("deadText").textContent = text;
  $("deadTag").textContent = "Encik Rahman tidak akan berpuas hati.";
  showScreen("dead");
}
function win() {
  state = "ending";
  caughtT = 0;
  document.exitPointerLock?.();
  screenFx = createFx(glitchWipe, { color: "#000000", seed: 3 });
  progress.done = true;
  store.set("progress", progress);
  checkpointData = null;
  sfx("slam", "exitDoor");
}

function clockText() {
  const m = clockStopped ? null : Math.floor(clockMin);
  if (clockStopped) return clockStopped;
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- per frame: the player
function updatePlayer(dt) {
  if (P.mode === "travel") {
    P.travel.t += dt;
    const k = P.travel.t / P.travel.dur;
    post.uniforms.dark.value = k < 0.25 ? 1 - k * 4 : k > 0.75 ? (k - 0.75) * 4 : 0;
    if (P.travel.t >= P.travel.dur * 0.5 && P.travel.to !== P.floor) arrive2();
    if (P.travel && P.travel.t >= P.travel.dur) {
      P.mode = "walk";
      P.travel = null;
      post.uniforms.dark.value = 1;
    }
    placeCamera(0);
    return;
  }
  const canMove = P.mode === "walk";
  const moving = canMove && (input.f || input.b || input.l || input.r || Math.hypot(input.mx, input.my) > 0.1);
  const running = moving && input.run && P.stamina > 0;
  const speed = running ? 4.2 : 2.3;
  P.stamina = clamp(P.stamina + (running ? -22 : 13) * dt, 0, 100);
  if (canMove) {
    let fx = input.r - input.l + input.mx, fz = input.b - input.f + input.my;
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
    const vx = (fx * c + fz * s) * speed * dt, vz = (-fx * s + fz * c) * speed * dt;
    if (!hotel.blocked(P.floor, P.x + vx, P.z, R)) P.x += vx;
    if (!hotel.blocked(P.floor, P.x, P.z + vz, R)) P.z += vz;
    const moved = Math.hypot(vx, vz);
    P.bob += moved * (running ? 2.4 : 2.9);
    P.stepAcc += moved;
    if (P.stepAcc > (running ? 1.9 : 1.5)) {
      P.stepAcc = 0;
      sound.play("step", null, { run: running });
      if (running) noiseAt({ floor: P.floor, pos: new THREE.Vector3(P.x, 0, P.z) }, 12);
    }
    if (moved > 0.001) {
      P.moveT += dt;
      P.still = 0;
    } else {
      P.still += dt;
      if (P.still > 0.4 && P.moveT > 1.2) {
        P.moveT = 0;
        emit("stop");
      }
      if (P.still > 1) P.moveT = 0;
    }
  }
  const on = P.light && P.battery > 0;
  if (on) P.battery = Math.max(0, P.battery - dt * (0.55 + (bayang.lit > 0 ? 2.6 : 0)));
  if (P.light && P.battery <= 0 && !P.flat) {
    P.flat = true;
    sub("Lampu suluh kehabisan bateri.", 3, "say");
  }
  if (P.battery > 0) P.flat = false;

  // zones and floors
  const z = hotel.zoneAt(P.floor, P.x, P.z);
  if ((z?.id ?? null) !== P.zone) {
    P.zone = z?.id ?? null;
    if (z) emit("enter:" + z.id);
  }
  for (const [f, l] of Object.entries(hotel.lifts)) {
    if (f !== P.floor) continue;
    const d = Math.hypot(P.x - (l.x + 0.5) * T, P.z - (l.y + 0.5) * T);
    if (d < 3.4 && !nearLift[f]) {
      nearLift[f] = true;
      emit("near:lift:" + f);
    } else if (d > 6) nearLift[f] = false;
  }
  placeCamera(running ? 1 : 0);
}
function arrive2() {
  const t = P.travel;
  arrive();
  P.mode = "travel";
  P.travel = t;
  P.travel.to = P.floor;
}
function placeCamera() {
  const y = hotel.levelY(P.floor);
  if (P.mode === "hide") {
    camera.position.set(P.hidden.x, y + EYE - 0.05, P.hidden.z);
    camera.rotation.set(P.pitch, P.yaw, 0);
    return;
  }
  camera.position.set(P.x, y + EYE + Math.sin(P.bob) * 0.04, P.z);
  camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob * 0.5) * 0.008);
}

// ---------------------------------------------------------------- the loop
const timer = new THREE.Timer();
timer.connect(document);
let fearV = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta()), now = timer.getElapsed();
  post.uniforms.time.value = now;
  for (let i = subsQueue.length - 1; i >= 0; i--) {
    const s = subsQueue[i];
    s.t -= dt;
    if (s.t <= 0) {
      s.el.remove();
      subsQueue.splice(i, 1);
    }
  }
  if (!hotel) return updateHud(dt);

  if (state === "play") {
    time += dt;
    if (!clockStopped) clockMin += dt * MIN_PER_SEC;
    const cm = clockStopped ? 3 * 60 + 17 : Math.floor(clockMin);
    hotel.setClock(Math.floor(cm / 60) % 24, cm % 60);
    if (!clockStopped && clockMin >= SHIFT_END && night.n < 7) return failShift("Pukul 6.00 pagi. Laporan syif tidak lengkap.");
    if (post.uniforms.dark.value < 1 && P.mode !== "travel") post.uniforms.dark.value = Math.min(1, post.uniforms.dark.value + dt * 1.5);
    for (const t of timers.filter((t) => t.t <= time)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    for (const [id, r] of Object.entries(ringing)) {
      r.t += dt;
      if (r.auto !== null && r.t >= r.auto) answer(id);
    }
    updatePlayer(dt);
    focus = findFocus();
    const pinfo = {
      floor: P.floor,
      x: P.x,
      z: P.z,
      light: P.light && P.battery > 0,
      beam: P.light && P.battery > 0 && P.mode === "walk",
      hidden: !!P.hidden,
      hideSpot: P.hidden,
      camera,
    };
    const b = state === "play" ? bayang.update(dt, pinfo) : { dist: Infinity };
    emit("tick", dt);

    // fear, flashlight, sound
    const vis = bayang.active && bayang.floor === P.floor;
    const fear = vis ? clamp(1 - b.dist / 16) * 0.8 + (bayang.hunting ? 0.2 : 0) : 0;
    fearV = lerp(fearV, fear, dt * 2);
    post.uniforms.fear.value = P.mode === "cctv" ? 0 : fearV;
    post.uniforms.glitch.value = vis && bayang.lit > 0 ? 0.25 + bayang.lit * 0.15 : Math.max(0, post.uniforms.glitch.value - dt * 2);
    post.uniforms.flash.value = Math.max(0, post.uniforms.flash.value - dt * 3);
    let flick = 1;
    if (P.battery < 15) flick *= Math.random() < 0.08 ? 0.1 : 1;
    if (vis && b.dist < 6) flick *= Math.random() < (6 - b.dist) * 0.05 ? 0.05 : 1;
    flashlight.intensity = P.light && P.battery > 0 && P.mode !== "hide" ? 50 * flick * (0.4 + 0.6 * clamp(P.battery / 30)) : 0;
    fill.intensity = P.mode === "hide" ? 0.15 : 0.6;
    heartT -= dt;
    if (fear > 0.2 && heartT <= 0) {
      sound.play("heart", null, { k: fear });
      heartT = lerp(1.3, 0.36, fear);
    }
    const zk = hotel.zoneAt(P.floor, P.x, P.z);
    const kind = zk?.kind;
    const powered = hotel.powered;
    sound.ambience(
      {
        rain: P.floor === "G" ? (zk?.id === "lobi" ? 1 : 0.4) : 0,
        hum: powered && humOn && (P.floor === "2" || P.floor === "3") ? (kind === "corridor" ? 1 : 0.35) : powered && P.floor === "G" ? 0.25 : 0,
        drip: kind === "bath" ? 1 : P.floor === "B" ? 0.5 : 0,
        machine: P.floor === "B" ? 1 : 0,
        fear,
      },
      dt,
    );
    const bpos = new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor) + 1.2, bayang.z);
    const bm = bayang.floor !== P.floor ? 1 : hotel.clearLine(P.floor, P.x, P.z, bayang.x, bayang.z) ? 0 : 0.6;
    const adjacent = Math.abs(FLOOR[bayang.floor].level - FLOOR[P.floor].level) <= 1;
    sound.bayang(bpos, { moving: bayang.moving, present: bayang.active && adjacent, muffle: bm, hunting: bayang.hunting });
    // the drag is its one honest cue: caption it when it's close and out of sight
    dragCapT -= dt;
    if (bayang.active && bayang.moving > 0 && bayang.floor === P.floor && b.dist < 13 && dragCapT <= 0 && !bayang.onScreen(pinfo)) {
      dragCapT = 7;
      sub(`[seretan kain ${dirWord({ floor: bayang.floor, pos: bpos })}]`, 2.5, "caption");
    }
    sound.listen(camera);
  } else if (state === "caught") {
    caughtT += dt;
    const g = bayang.g, fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    bayang.floor = P.floor;
    g.visible = true;
    const k = clamp(caughtT / 0.25);
    g.position.set(P.x + fwd.x * lerp(1.8, 0.8, k), hotel.levelY(P.floor) + lerp(-0.4, -0.85, k), P.z + fwd.z * lerp(1.8, 0.8, k));
    g.rotation.y = Math.atan2(P.x - g.position.x, P.z - g.position.z) + Math.PI;
    P.pitch = lerp(P.pitch, 0.04, dt * 10);
    camera.position.set(P.x + (Math.random() - 0.5) * 0.06, hotel.levelY(P.floor) + EYE + (Math.random() - 0.5) * 0.05, P.z);
    camera.rotation.set(P.pitch, P.yaw, (Math.random() - 0.5) * 0.08);
    bayang.parts.neck.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2);
    bayang.parts.arms[0].rotation.x = -1.6;
    bayang.parts.arms[1].rotation.x = -1.4;
    flashlight.intensity = Math.random() < 0.5 ? 70 : 0;
    post.uniforms.glitch.value = 1;
    post.uniforms.fear.value = 1;
    post.uniforms.flash.value = Math.random() < 0.2 ? 1 : post.uniforms.flash.value * 0.8;
    if (caughtT > 1.5 && !screenFx) screenFx = createFx(crtOff, { color: "#000000", seed: 2, palette: BLOOD });
    if (caughtT > 1.5) post.uniforms.dark.value = Math.max(0, post.uniforms.dark.value - dt * 2);
    if (caughtT > 3.2) {
      state = "dead";
      $("deadTitle").textContent = "KAMU DITANGKAP";
      $("deadText").textContent = `Malam ${night.n}, ${clockText()}. ${tasks.filter((t) => t.done).length} daripada ${tasks.length} tugas selesai.`;
      $("deadTag").textContent = "Bayang tidak pernah lapar lama.";
      $("retryBtn").textContent = checkpointData?.night === night.n ? "SAMBUNG DARI TITIK SAMBUNG" : "CUBA LAGI MALAM INI";
      showScreen("dead");
    }
  } else if (state === "ending") {
    caughtT += dt;
    post.uniforms.dark.value = Math.max(0, 1 - caughtT * 0.6);
    if (caughtT > 2.2) {
      state = "done";
      const e = night.ending;
      $("endTitle").textContent = e.title;
      $("endText").textContent = e.text;
      $("endTeaser").textContent = e.teaser;
      showScreen("ending");
    }
  }

  // only the floor you're looking at is drawn
  const viewFloor = P.mode === "cctv" ? hotel.cameras[cctvIdx].floor : P.floor;
  for (const [id, F] of Object.entries(hotel.floors)) F.group.visible = id === viewFloor;
  bayang.g.visible = state === "caught" || (bayang.active && bayang.floor === viewFloor);
  hotel.update(dt, camera, now);
  for (const l of Object.values(hotel.lights)) if (l.floor !== viewFloor) l.light.intensity = 0;
  post.uniforms.cctv.value = P.mode === "cctv" ? 1 : 0;

  // the little live monitor in the post
  monitorT -= dt;
  if (hotel.liveScreen && P.floor === "G" && P.zone === "pos" && hotel.powered && monitorT <= 0 && P.mode !== "cctv") {
    monitorT = 0.25;
    if (Math.floor(now / 3) !== monitorCam) monitorCam = Math.floor(now / 3);
    const cam = hotel.cameras[monitorCam % hotel.cameras.length];
    for (const [id, F] of Object.entries(hotel.floors)) F.group.visible = id === cam.floor;
    const bv = bayang.g.visible;
    bayang.g.visible = bayang.active && bayang.floor === cam.floor;
    hotel.liveScreen.visible = false;
    const fl = flashlight.intensity;
    flashlight.intensity = 0;
    renderer.setRenderTarget(monitorRT);
    renderer.render(scene, cam.cam);
    flashlight.intensity = fl;
    bayang.g.visible = bv;
    hotel.liveScreen.visible = true;
    hotel.liveScreen.material.map = monitorRT.texture;
    hotel.liveScreen.material.needsUpdate = !hotel.liveScreen.material.userData.set;
    hotel.liveScreen.material.userData.set = true;
    for (const [id, F] of Object.entries(hotel.floors)) F.group.visible = id === viewFloor;
  }

  renderer.setRenderTarget(rt);
  if (P.mode === "cctv") {
    const fl = flashlight.intensity;
    flashlight.intensity = 0;
    renderer.render(scene, hotel.cameras[cctvIdx].cam);
    flashlight.intensity = fl;
  } else renderer.render(scene, camera);
  post.uniforms.tDiffuse.value = rt.texture;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  updateHud(dt);
});

// ---------------------------------------------------------------- HUD, in pixelfx's pixel font
const C = { ink: hex("#d8d0c0"), dim: hex("#6a6258"), shadow: hex("#000000"), teal: hex("#7ef0dc"), red: hex("#ff3a2a"), amber: hex("#ffc23d"), green: hex("#9be05a"), cam: hex("#a8ffb0") };
let hudAcc = 0;
function wrap(p, text, width) {
  const lines = [];
  for (const word of text.toUpperCase().split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && p.measure(last + " " + word)[0] <= width) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}
function updateHud(dt) {
  hudAcc += dt;
  if (hudAcc < 1 / 30 && dt > 0) return;
  const step = hudAcc;
  hudAcc = 0;
  if (!hudFrame) return;
  clearFrame(hudFrame);
  const p = painterFor(hudFrame).place(0, 0), W = hudFrame.w, H = hudFrame.h;
  if (hotel && (state === "play" || state === "paused")) {
    if (P.mode === "cctv") {
      const cam = hotel.cameras[cctvIdx];
      p.text(cam.label, 8, 8, C.cam, { shadow: C.shadow });
      p.text(`${clockText()}  ${FLOOR_NAME[cam.floor].toUpperCase()}`, 8, 16, C.cam, { shadow: C.shadow });
      if (Math.floor(performance.now() / 600) % 2) {
        p.rect(W - 30, 9, 4, 4, C.red);
        p.text("REC", W - 24, 8, C.cam);
      }
      p.text(touch ? "TUKAR KAMERA DI BAWAH" : "A / D TUKAR KAMERA - E KELUAR", W / 2, H - 14, C.cam, { align: "center", shadow: C.shadow });
    } else {
      p.text(`MALAM ${night.n}`, 8, 7, C.ink, { shadow: C.shadow });
      p.text(clockText(), 8 + p.measure(`MALAM ${night.n}`)[0] + 6, 7, clockStopped ? C.red : C.dim, { shadow: C.shadow });
      // objectives: what's left, and what just got done
      let y = 18;
      const width = Math.min(150, W * 0.55);
      for (const t of tasks) {
        if (t.done && time - t.at > 4) continue;
        const lines = wrap(p, t.text, width - 8);
        p.rect(8, y + 1, 3, 3, t.done ? C.green : t.id === "write" ? C.amber : C.ink, t.done ? 1 : 0.9);
        lines.forEach((l, i) => p.text(l, 14, y + i * 7, t.done ? C.dim : t.id === "write" ? C.amber : C.ink, { shadow: C.shadow }));
        y += lines.length * 7 + 3;
        if (y > H * 0.5) break;
      }
      // keys held
      if (P.keys.size) {
        const k = [...P.keys.values()].map((v) => v.replace("Kunci ", "")).join(", ");
        p.text("KUNCI: " + k.toUpperCase(), W - 8, H - 12, C.amber, { align: "right", shadow: C.shadow });
      }
      // battery and stamina
      const bx = 8, by = H - 20, bw = 30, bh = 9, k = clamp(P.battery / 100);
      p.text(P.light ? "LAMPU" : touch ? "LAMPU (MATI)" : "LAMPU (F)", bx, by - 8, C.dim, { shadow: C.shadow });
      p.rect(bx, by, bw, bh, C.dim);
      p.rect(bx + 1, by + 1, bw - 2, bh - 2, C.shadow);
      p.rect(bx + bw, by + 3, 2, 3, C.dim);
      const col = k > 0.5 ? C.green : k > 0.2 ? C.amber : C.red;
      const fw = Math.round((bw - 4) * k);
      if (fw > 0 && (k > 0.15 || Math.floor(time * 4) % 2)) p.rect(bx + 2, by + 2, fw, bh - 4, col, P.light ? 1 : 0.5);
      if (P.stamina < 99) {
        p.rect(bx, by + bh + 3, bw, 2, C.dim, 0.4);
        p.rect(bx, by + bh + 3, Math.round((bw * P.stamina) / 100), 2, C.ink, 0.8);
      }
      if (P.mode === "hide") {
        // looking out through the slats
        for (let yy = 0; yy < H; yy += 9) p.rect(0, yy, W, 5, C.shadow, 0.92);
        p.text(touch ? "GUNA - KELUAR" : "E - KELUAR", W / 2, H - 30, C.ink, { align: "center", outline: C.shadow });
      } else if (P.mode === "walk" && focus) {
        const txt = (touch ? "GUNA - " : "E - ") + promptFor(focus).toUpperCase();
        p.text(txt, W / 2, Math.round(H * 0.62), C.ink, { align: "center", outline: C.shadow });
      }
      if (P.mode === "walk") p.rect(Math.floor(W / 2), Math.floor(H / 2), 1, 1, C.ink, 0.35);
    }
  }
  if (state === "caught")
    for (const e of endFx) {
      if (e.delay > 0) {
        e.delay -= 1 / 30;
        continue;
      }
      e.fx.update(1 / 30);
      e.fx.draw(hudFrame);
    }
  if (bannerFx && state === "report") {
    bannerFx.update(step || 1 / 30);
    bannerFx.draw(hudFrame);
    if (bannerFx.done()) bannerFx = null;
  }
  composite(hudFrame, hudImg.data, null);
  hudCtx.putImageData(hudImg, 0, 0);
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
  if (e.target.tagName === "INPUT") return;
  if (state === "play" && P.mode === "cctv" && (e.code === "KeyA" || e.code === "ArrowLeft" || e.code === "KeyD" || e.code === "ArrowRight")) {
    switchCam(e.code === "KeyA" || e.code === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (keys[e.code]) input[keys[e.code]] = 1;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.run = true;
  if (state !== "play") return;
  if (e.code === "KeyF" && P.mode === "walk") toggleLight();
  if (e.code === "KeyE" && !e.repeat) interact();
  if (P.mode === "choose" && /^Digit[1-4]$/.test(e.code)) $("chooserBtns").querySelector(`[data-key="${e.code.slice(5)}"]:not([disabled])`)?.click();
  if (e.code === "Escape" && P.mode === "choose") closeChooser();
  if (e.code === "Escape" && P.mode === "read") closeNote();
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
  P.light = !P.light;
  sound.play("click");
}
function look(dx, dy) {
  if (P.mode === "cctv" || P.mode === "travel") return;
  P.yaw -= dx * settings.sens;
  P.pitch = clamp(P.pitch - dy * settings.sens, -1.2, 1.2);
  if (P.mode === "hide") {
    const base = Math.atan2(-P.hidden.face[0], -P.hidden.face[1]);
    let d = Math.atan2(Math.sin(P.yaw - base), Math.cos(P.yaw - base));
    P.yaw = base + clamp(d, -0.5, 0.5);
    P.pitch = clamp(P.pitch, -0.3, 0.3);
  }
}
document.addEventListener("mousemove", (e) => {
  if (state === "play" && document.pointerLockElement) look(e.movementX * 0.0022, e.movementY * 0.0022);
});
renderer.domElement.addEventListener("mousedown", (e) => {
  if (state !== "play" || touch) return;
  if (!document.pointerLockElement) return relock();
  if (e.button === 0) interact();
});
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "play" && !touch && P.mode !== "choose" && P.mode !== "read") pause();
});
function relock() {
  if (!touch && state === "play" && !document.pointerLockElement) renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
}
function pause() {
  if (state !== "play") return;
  state = "paused";
  input.f = input.b = input.l = input.r = 0;
  showScreen("pause");
  sound.suspend();
}
function resume() {
  sound.start();
  state = "play";
  showScreen(null);
  relock();
}

// ---------------------------------------------------------------- menus
function begin(n, opts) {
  sound.start();
  sound.setVolume(settings.volume);
  startNight(n, opts);
}
function refreshTitle() {
  const n = Math.min(7, progress.night);
  $("startBtn").textContent = n > 1 ? `MASUK · MALAM ${n}` : "MASUK";
  const box = $("nightPick");
  box.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const b = document.createElement("button");
    b.textContent = String(i);
    b.disabled = i > n;
    b.title = NIGHTS[i - 1].title;
    b.setAttribute("aria-label", `Malam ${i}: ${NIGHTS[i - 1].title}`);
    b.addEventListener("click", () => showDay(i));
    box.appendChild(b);
  }
  $("nightRow").hidden = n <= 1;
  $("nameInput").value = playerName;
  const url = document.body.dataset.donate;
  $("donate").hidden = !url;
  if (url) $("donateLink").href = url;
}
$("nameInput").addEventListener("input", (e) => {
  playerName = e.target.value.slice(0, 18);
  store.set("name", playerName);
});
$("startBtn").addEventListener("click", () => showDay(Math.min(7, progress.night)));
$("resumeBtn").addEventListener("click", resume);
$("restartBtn").addEventListener("click", () => begin(night.n));
$("menuBtn").addEventListener("click", toTitle);
$("retryBtn").addEventListener("click", () => begin(night.n, { fromCheckpoint: checkpointData?.night === night.n }));
$("deadMenuBtn").addEventListener("click", toTitle);
$("repBtn").addEventListener("click", () => showDay(Math.min(7, night.n + 1)));
$("endBtn").addEventListener("click", toTitle);
$("noteClose").addEventListener("click", closeNote);
$("chooserCancel").addEventListener("click", closeChooser);
function toTitle() {
  state = "title";
  sound.suspend();
  Object.assign(P, { floor: "G", x: 12.5 * T, z: 6.2 * T, pitch: -0.05, mode: "walk", hidden: null });
  post.uniforms.dark.value = 1;
  screenFx = null;
  refreshTitle();
  showScreen("title");
}
// settings, in the pause menu
$("volume").value = settings.volume;
$("sens").value = settings.sens;
$("subsToggle").checked = settings.subs;
$("volume").addEventListener("input", (e) => {
  settings.volume = +e.target.value;
  sound.setVolume(settings.volume);
  store.set("settings", settings);
});
$("sens").addEventListener("input", (e) => {
  settings.sens = +e.target.value;
  store.set("settings", settings);
});
$("subsToggle").addEventListener("change", (e) => {
  settings.subs = e.target.checked;
  store.set("settings", settings);
});

// touch: a stick on the left, look by dragging on the right, buttons
if (touch) {
  const stick = $("stick"), knob = $("knob"), area = $("touch");
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
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
  const tap = (id, fn) => $(id).addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (state === "play") fn();
  });
  tap("lightBtn", () => P.mode === "walk" && toggleLight());
  tap("useBtn", interact);
  tap("pauseBtn", pause);
  tap("camPrev", () => switchCam(-1));
  tap("camNext", () => switchCam(1));
  tap("camExit", leaveCctv);
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
  for (const el of document.querySelectorAll(".desk")) el.hidden = true;
} else for (const el of document.querySelectorAll(".mob")) el.hidden = true;

// the title: the dark lobby, slowly turning
hotel = new Hotel(scene);
hotel.buildRain();
bayang = new Bayang(hotel, {});
bayang.reset({ active: false });
night = NIGHTS[0];
Object.assign(P, { floor: "G", x: 12.5 * T, z: 6.2 * T, yaw: 0, pitch: -0.05, mode: "walk" });
refreshTitle();
showScreen("title");
(function titleSpin() {
  if (state === "title") {
    P.yaw = Math.sin(performance.now() / 9000) * 0.6;
    placeCamera();
  }
  requestAnimationFrame(titleSpin);
})();

// for automated checks
window.__hotel = {
  get state() {
    return state;
  },
  get P() {
    return P;
  },
  get hotel() {
    return hotel;
  },
  get bayang() {
    return bayang;
  },
  get tasks() {
    return tasks;
  },
  get ctx() {
    return ctx;
  },
  begin,
  showDay,
  interact,
  answer,
  emit,
  travel,
  get focus() {
    return focus;
  },
  set clock(v) {
    clockMin = v;
  },
};
