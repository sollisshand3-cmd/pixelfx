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
import { NIGHTS, NOTES, KNOWN, PROLOGUE, EPILOGUE } from "./data/story.js";
import { t, lang, setLang, LANGS } from "./i18n.js";
import { Hotel } from "./world.js";
import { Bayang, BLOOD, FACE, body as bayangBody } from "./bayang.js";
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
// how far behind on objectives the guard is: 0 calm .. 3 it's coming
let threat = 0, dreadT = 20, phantom = null, gates = {}, subliminal = 0, caughtFrom = null, whispered = false;
const LIMITS = { memo: 60, write: 75, power: 150, cctv: 60, lift: 60, r317: 150, k207: 45, kmaint: 150, kexit: 150, escape: 120 };
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
  if (w.floor !== P.floor) return t(FLOOR[w.floor].level > FLOOR[P.floor].level ? "dir.above" : "dir.below");
  const dx = w.pos.x - P.x, dz = w.pos.z - P.z, d = Math.hypot(dx, dz);
  if (d < 1.5) return t("dir.near");
  const a = Math.atan2(-dx, -dz) - P.yaw, c = Math.cos(a), s = Math.sin(a);
  const side = t(Math.abs(c) > Math.abs(s) ? (c > 0 ? "dir.front" : "dir.back") : s > 0 ? "dir.left" : "dir.right");
  return d > 14 ? side + t("dir.far") : side;
}
const CAPTIONS = {
  bell: "loceng kaunter", knock: "ketukan", step: "langkah kaki", slam: "pintu terhempas", thump: "dentuman dari dobi", water: "air mengalir",
  drag: "seretan kain", liftding: "loceng lif", breaker: "suis berdetap", keys: "kunci bergemerincing", whisper: "bisikan", door: "pintu berkeriut", hands: "sesuatu bergerak di dalam tab",
};
function sfx(name, w, o) {
  const at = where(w);
  sound.play(name, at ? sound.at(at.pos, muffleTo(at)) : null, o);
  if (CAPTIONS[name] && at) sub(`[${t("cap." + name)} ${dirWord(at)}]`, 2.6, "caption");
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
    get name() {
      return playerName || t("ui.namePh");
    },
    t: (k, v) => t(k, v),
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
    task(id, text, o = {}) {
      if (tasks.find((q) => q.id === id)) return;
      const base = o.limit ?? LIMITS[id] ?? (id.startsWith("punch_") ? 90 : 100);
      tasks.push({ id, text, done: false, at: time, urgent: !!o.urgent, limit: base * (night.pace ?? 1), started: null, missed: 0 });
    },
    // an object that belongs to a task only works while that task is the current one
    gate(target, taskId) {
      gates[target] = taskId;
    },
    done(id) {
      const q = tasks.find((q) => q.id === id);
      if (!q || q.done) return;
      q.done = true;
      q.at = time;
      sound.play("chime");
      emit("done:" + id);
      checkReady();
    },
    isDone: (id) => !!tasks.find((q) => q.id === id && q.done),
    has: (id) => !!tasks.find((q) => q.id === id),
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
    say: (text, dur = 3) => sub(t(text), dur, "say"),
    caption: (text, w) => sub(`[${t(text)}${w ? " " + dirWord(where(w)) : ""}]`, 2.6, "caption"),
    hint: (k) => hint(t(k)),
    popup,
    read: (title, text) => openNote(t(title), t(text, { name: c.name.toUpperCase() })),
    note(id) {
      openNote(t(`note.${id}.t`), t(`note.${id}`));
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
            sub(`[${t("cap.ring")} ${dirWord(at)}]`, 2.4, "caption");
            if (o.attract !== false) noiseAt(at, 9);
          },
        ),
      };
    },
    lines(lines, w) {
      speak(lines, w ? where(w) : null);
    },
    item: (spec) => spawnItem(spec),
    key(id, silent) {
      P.keys.set(id, "key." + id);
      if (!silent) {
        popup(t("key." + id), t("where." + id));
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
  let t_ = 0;
  for (const [who, key, style] of lines) {
    ctx.after(t_, () => {
      if (style === "caption") return sub(`[${t(key)}]`, 2.4, "caption");
      const text = t(key);
      const dest = style === "phone" || style === "self" || !at ? null : sound.at(at.pos, muffleTo(at), 0.4);
      const dur = sound.voice(text, style, dest) || 1;
      const name = who === "you" ? "" : `${t("who." + who)}${style === "phone" ? t("who.phone") : style === "speaker" ? t("who.speaker") : ""}: `;
      sub(name + text, Math.max(2.4, dur + 1.4), who === "you" ? "self" : "line");
    });
    t_ += Math.max(2.2, t(key).length * 0.055 + 1.2);
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
    tasks.push({ id: "write", text: "task.write", done: false, at: time, limit: LIMITS.write, started: null, missed: 0 });
    sub(t("s.allDone"), 3, "say");
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
  const label = s.label ?? (s.kind === "battery" ? "pr.battery" : s.kind === "key" ? `pr.take|${t("key." + s.key)}` : "pr.read");
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
    popup(t("s.battery"), t("s.batterySub"));
    sound.play("chime", null, { pitch: 1.5 });
  } else if (s.kind === "key") {
    ctx.key(s.key);
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
  for (const q of subsQueue) q.el.remove();
  subsQueue = [];
  tasks = [];
  timers = [];
  handlers = {};
  ringing = {};
  loops = {};
  log = [];
  pending = 0;
  threat = 0;
  dreadT = 25;
  gates = {};
  whispered = false;
  sound.duck(1, 0.2);
  time = 0;
  humOn = true;
  nearLift = {};
  P.keys = new Map();
  for (const k of night.keys ?? []) P.keys.set(k, "key." + k);
  clockStopped = night.stopClock ?? null;
  clockMin = SHIFT_START;
  const cp = fromCheckpoint && checkpointData?.night === n ? checkpointData : null;
  bayang = new Bayang(hotel, {
    onSee() {
      sound.play("stinger");
      sub(t("s.seen"), 2.2, "say");
    },
    onCatch: () => caught(),
    onBanish() {
      hotel.sprite(darkExplosion, { palette: BLOOD, seed: 5 }, 1 / 75, new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor), bayang.z), hotel.oneShots);
      sound.play("screech", sound.at(new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor) + 1.8, bayang.z)), { vol: 0.4 });
      sub(t("s.banish"), 3, "say");
    },
    onScreech: () => sound.play("screech", sound.at(new THREE.Vector3(bayang.x, hotel.levelY(bayang.floor) + 1.8, bayang.z)), { vol: 0.2 }),
    onDoor: (d) => sfx("door", { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 }),
    onSlam: (d) => sfx("slam", { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 }),
    onListen: () => {},
  });
  bayang.reset(night.bayang);
  phantom = bayangBody();
  phantom.fire.sprite.visible = false;
  phantom.g.visible = false;
  phantom.t = 0;
  hotel.root.add(phantom.g);
  const flags = cp ? { ...cp.flags } : {};
  ctx = makeCtx(n, flags, !!cp);
  const [f, x, y, yaw] = cp ? cp.at : night.start === "sofa" ? START.sofa : START.post;
  Object.assign(P, { floor: f, x: x * T, z: y * T, yaw, pitch: 0, stamina: 100, battery: cp ? Math.max(cp.battery, 40) : 100, light: true, mode: "walk", hidden: null, zone: null, still: 0 });
  night.setup(ctx);
  // every door's default lock text; guest rooms are locked unless a report opens them
  for (const d of hotel.doors) if (d.locked && !d.lockMsg) d.lockMsg = d.key ? `s.lockedKey` : /^\d+$/.test(d.label ?? "") ? "s.lockedRoom" : "s.locked";
  state = "play";
  showScreen(null);
  post.uniforms.dark.value = 0;
  screenFx = null;
  emit("start");
  if (cp) sub(t("s.resumed"), 2.5, "say");
  sub(t("s.nightTitle", { n, title: t(night.title).toUpperCase() }), 3, "say");
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
    // a clear line to just in front of the thing (not its middle, which may be inside a wardrobe)
    const k = Math.min(0.85, Math.max(0, d - 0.25)) / (d || 1);
    if (s > score && (it.kind === "door" || d < 1.3 || hotel.clearLine(P.floor, P.x, P.z, it.pos.x - dx * k, it.pos.z - dz * k))) {
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
    const dn = /^\d+$/.test(d.label ?? "") ? t("dl.num", { n: d.label }) : t(d.label ? "dl." + d.label : "dl.door");
    return t(d.open ? "pr.close" : "pr.open", { d: dn.startsWith("dl.") ? t("dl.door") : dn });
  }
  if (it.kind === "phone") return ringing[it.id] ? t("pr.answer") : t(it.label);
  if (it.kind === "lift") return t("pr.lift");
  if (it.kind === "stairs") return t("pr.stairs");
  return t(it.label ?? "pr.look");
}

// ---------------------------------------------------------------- objectives in order, against the clock
// urgent ones (a call from a room, the lift) jump the queue; everything else goes in the order it was given
function activeTask() {
  return tasks.find((q) => !q.done && q.urgent) ?? tasks.find((q) => !q.done) ?? null;
}
/** The task that owns this object, if it isn't the current one yet. */
function outOfOrder(id) {
  const owner = gates[id] ?? (id.startsWith("punch_") ? id : id === "logbook" ? "write" : null);
  if (!owner) return null;
  const q = tasks.find((x) => x.id === owner);
  if (!q || q.done) return null;
  const a = activeTask();
  return a && a.id !== owner ? a : null;
}
function updateObjectives(dt) {
  const a = activeTask();
  if (!a) return;
  if (a.started === null) a.started = time;
  if (time - a.started < a.limit) return;
  // out of time: it still has to be done, but everything gets worse
  a.missed++;
  a.started = time;
  threat = Math.min(3, threat + 1);
  sound.play("stinger");
  sound.play("whisper", sound.at(camera.position.clone().add(new THREE.Vector3(Math.sin(P.yaw) * 1.2, 0, Math.cos(P.yaw) * 1.2))), { vol: 0.5 });
  sub(t(`s.missed${threat}`) + " " + t("s.stillDo"), 4, "say");
  post.uniforms.flash.value = 0.5;
  bayang.escalate(threat, { floor: P.floor, x: P.x, z: P.z }, night.floors.filter((f) => f !== "3" || night.floors.includes("3")));
  dreadT = Math.min(dreadT, 3);
}

// the hotel when you fall behind: lights stutter, doors slam, a phone rings twice, breath behind you,
// and something tall standing where the corridor ends
function dread(dt) {
  if (threat <= 0 || P.mode === "cctv") return;
  for (const l of Object.values(hotel.lights)) if (l.floor === P.floor) l.flicker = Math.random() < 0.002 * threat ? !l.flicker : l.flicker;
  dreadT -= dt;
  if (dreadT > 0) return;
  dreadT = Math.max(7, 26 - threat * 6) + Math.random() * 8;
  const roll = Math.random();
  const here = { floor: P.floor, x: P.x / T, y: P.z / T };
  if (roll < 0.25) {
    const open = hotel.doors.filter((d) => d.floor === P.floor && d.open && !d.hidden && Math.hypot((d.x + 0.5) * T - P.x, (d.y + 0.5) * T - P.z) < 14 && !(Math.floor(P.x / T) === d.x && Math.floor(P.z / T) === d.y));
    const d = open[Math.floor(Math.random() * open.length)];
    if (d) {
      d.open = false;
      sfx("slam", { floor: d.floor, x: d.x + 0.5, y: d.y + 0.5, h: 1.2 });
    } else sfx("knock", ctx.behind(2.5));
  } else if (roll < 0.45) {
    const b = ctx.behind(0.9);
    sound.play("whisper", sound.at(hotel.pos(b.floor, b.x, b.y, 1.6)), { vol: 0.45 });
    sub(`[${t("cap.breathBehind")}]`, 2.4, "caption");
  } else if (roll < 0.6) {
    const phones = hotel.interactables.filter((i) => i.kind === "phone" && i.floor === P.floor && !ringing[i.id]);
    const ph = phones[Math.floor(Math.random() * phones.length)];
    if (ph) {
      const h = sound.ring(sound.at(ph.pos, muffleTo(where(ph.id))));
      setTimeout(() => h.stop(), 3500);
      sub(`[${t("cap.ringOnce")} ${dirWord(where(ph.id))}]`, 3, "caption");
    }
  } else if (threat >= 2 || roll < 0.8) showPhantom();
  else for (const l of Object.values(hotel.lights)) if (l.floor === P.floor) l.flicker = true;
  void here;
}
function showPhantom() {
  if (!phantom || phantom.g.visible || (bayang.active && bayang.floor === P.floor)) return;
  // stand it far down the line of sight, where the light barely reaches
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  for (let d = 12; d >= 6; d -= 1) {
    const x = P.x + fx * d, z = P.z + fz * d;
    if (hotel.blocked(P.floor, x, z, 0.35) || !hotel.clearLine(P.floor, P.x, P.z, x, z)) continue;
    phantom.g.position.set(x, hotel.levelY(P.floor), z);
    phantom.g.rotation.y = Math.atan2(P.x - x, P.z - z) + Math.PI;
    phantom.g.visible = true;
    phantom.t = 0.5 + Math.random() * 0.6;
    phantom.floor = P.floor;
    return;
  }
}
function updatePhantom(dt) {
  if (!phantom?.g.visible) return;
  phantom.t -= dt;
  const lit = P.light && P.battery > 0 && (() => {
    const f = camera.getWorldDirection(new THREE.Vector3());
    const to = phantom.g.position.clone().setY(camera.position.y).sub(camera.position).normalize();
    return to.dot(f) > Math.cos(0.3);
  })();
  phantom.neck.rotation.z = Math.sin(time * 30) * 0.15;
  if (phantom.t <= 0 || lit || phantom.floor !== P.floor) {
    if (lit) {
      sub(`[${t("cap.figure")}]`, 2.2, "caption");
      sound.play("whisper", null, { vol: 0.3 });
    }
    phantom.g.visible = false;
  }
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
  // objects that belong to a later objective wait their turn
  const before = outOfOrder(it.id);
  if (before) {
    sound.play("click");
    return sub(t("s.notActive", { task: t(before.text).toLowerCase() }), 3, "say");
  }
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
      return sub(t("s.punched"), 2, "say");
    case "cctv":
      return enterCctv();
    case "hide":
    case "wardrobe":
      return it.hideAt ? enterHide(it) : null;
    case "logbook":
      return writeReport();
    case "phone":
      sound.play("click");
      return sub(t("s.hiss"), 2.5, "say");
    case "exitDoor":
      sound.play("locked");
      return sub(t("s.serviceLocked"), 2.5, "say");
    case "mainDoor":
      sound.play("locked");
      return sub(t("s.mainLocked"), 2.5, "say");
    default:
      if (it.examine) sub(t(it.examine), 3, "say");
      else sub(t("s.nothing"), 2, "say");
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
      return sub(t(d.lockMsg ?? "s.locked", { key: t("key." + d.key) }), 2.5, "say");
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
  if (!hotel.powered) return sub(t("s.noPowerCctv"), 2.5, "say");
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
    const fname = t(FLOOR_NAME[f]) + (open ? "" : t("ui.closed"));
    b.textContent = `${k} · ` + (via === "stairs" ? t(FLOOR_ORDER.indexOf(f) > here ? "ui.up" : "ui.down", { f: fname }) : fname);
    b.disabled = !open;
    b.dataset.key = String(k);
    b.addEventListener("click", () => travel(f, via));
    box.appendChild(b);
    k++;
  }
  $("chooserTitle").textContent = t(via === "stairs" ? "ui.stairs" : "ui.lift");
  $("chooserHint").textContent = touch ? "" : t("ui.chooserHint");
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
    return sub(t("s.noPowerLift"), 2.5, "say");
  }
  hotel.liftDoors(f, true);
  const at = where(`lift_${f}`) ?? { floor: f, pos: hotel.pos(f, hotel.lifts[f].x + 0.5, hotel.lifts[f].y + 0.5, 1.5) };
  sound.play("liftding", sound.at(at.pos));
  sub(`[${t("cap.lift")}]`, 2, "caption");
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
  sub(t(FLOOR_NAME[to]), 1.8, "say");
  emit("floor:" + to);
  emit(`${via}:${to}`);
}

// ---------------------------------------------------------------- the end of a shift
function writeReport() {
  if (!tasks.find((t) => t.id === "write")) {
    const left = tasks.find((t) => !t.done);
    return sub(left ? t("s.notYet", { task: t(left.text).toLowerCase() }) : t("s.nothingReport"), 3, "say");
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
  bannerFx = createFx(questComplete, { text: t("hud.shiftDone"), seed: 8, x: hudFrame.w / 2, y: hudFrame.h / 2 - 20, palette: ["#140a04", "#3a1e08", "#6a3a0e", "#9a5a14", "#c88a2a", "#e8b860", "#f8e8c0", "#ffffff"], ribbon: ["#080406", "#1a0a0c", "#3a1218", "#5a1a22", "#7a2430", "#9a3a3a", "#c06a5a"] });
  const name = (playerName || t("ui.namePh")).toUpperCase();
  const punches = tasks.filter((t) => t.id.startsWith("punch_"));
  const rows = [
    [t("rep.night"), `${night.n} · ${t(night.title)}`],
    [t("rep.guard"), name],
    [t("rep.time"), clockText()],
    [t("rep.clocks"), punches.length ? `${punches.filter((q) => q.done).length}/${punches.length}` : "-"],
  ];
  $("repTitle").textContent = t("rep.title", { n: night.n });
  $("repMeta").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("repLog").innerHTML =
    (log.length ? log : [{ room: "-", issue: "rep.none", action: "" }])
      .map((e) => `<li><b>${t(e.room)}</b><span>${t(e.issue)}</span>${e.action ? `<em>${t("rep.action")}${t(e.action)}</em>` : ""}</li>`)
      .join("") + night.report.map((r) => `<li class="obs"><span>${t(r)}</span></li>`).join("");
  $("repTwist").hidden = !night.finale;
  if (night.finale) $("repTwist").textContent = t("rep.twist", { name });
  $("repNote").textContent = night.finale ? t("rep.twistNote") : "";
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
  $("dayTitle").textContent = n === 7 ? t("ui.night", { n: 7 }) : t("ui.day", { n });
  $("dayName").textContent = t(nt.title);
  $("dayFrom").textContent = nt.day.from ? t("ui.msgFrom", { from: t(nt.day.from) }) : "";
  $("dayFrom").hidden = !nt.day.from;
  $("dayText").textContent = t(nt.day.text);
  $("dayHint").textContent = nt.day.hint ? t(nt.day.hint) : "";
  $("dayHint").hidden = !nt.day.hint;
  $("dayTonightText").textContent = t(nt.tonight);
  const known = KNOWN[n] ?? [];
  $("dayKnow").hidden = !known.length;
  $("dayKnowList").innerHTML = known.map((k) => `<li>${t(k)}</li>`).join("");
  $("dayBtn").textContent = t(n === 7 ? "ui.wake" : "ui.startShift");
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
  $("hint").hidden = true;
  for (const q of subsQueue) q.el.remove();
  subsQueue = [];
  for (const r of Object.values(ringing)) r.handle.stop();
  document.exitPointerLock?.();
  // first, nothing: the world goes silent and dark, and your head turns toward it by itself
  sound.duck(0, 0.04);
  caughtFrom = { yaw: P.yaw, to: Math.atan2(-(bayang.x - P.x), -(bayang.z - P.z)) };
  whispered = false;
  subliminal = 0;
  endFx = [];
  screenFx = null;
}
function failShift(text) {
  state = "dead";
  document.exitPointerLock?.();
  $("deadTitle").textContent = t("ui.fail");
  $("deadText").textContent = text;
  $("deadTag").textContent = t("ui.failTag");
  $("retryBtn").textContent = t("ui.retry");
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
  if (on) P.battery = Math.max(0, P.battery - dt * (0.55 * (1 + 0.15 * threat) + (bayang.lit > 0 ? 2.6 : 0)));
  if (P.light && P.battery <= 0 && !P.flat) {
    P.flat = true;
    sub(t("s.flat"), 3, "say");
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

// the security cameras see in infrared: less fog, a flat grey light over everything
function nightVision(on) {
  scene.fog.density = on ? 0.03 : 0.075;
  hemi.intensity = on ? 2.2 : 0.42;
}

// ---------------------------------------------------------------- the loop
const timer = new THREE.Timer();
timer.connect(document);
let fearV = 0, timeScale = 1;

// ?trailer: the game is stepped one fixed frame at a time by the trailer director, and sound renders offline
const TRAILER = new URLSearchParams(location.search).has("trailer");
let vclock = 0, noBeam = false;
function frame(fixed) {
  let dt, now;
  if (fixed) {
    dt = fixed;
    vclock += fixed;
    now = vclock;
    sound.advance(now);
  } else {
    timer.update();
    dt = Math.min(0.05, timer.getDelta()) * timeScale;
    now = timer.getElapsed();
  }
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
    if (!clockStopped && clockMin >= SHIFT_END && night.n < 7) return failShift(t("ui.failText"));
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
    updateObjectives(dt);
    dread(dt);
    updatePhantom(dt);
    focus = findFocus();
    const pinfo = {
      floor: P.floor,
      x: P.x,
      z: P.z,
      light: P.light && P.battery > 0,
      beam: P.light && P.battery > 0 && P.mode === "walk" && !noBeam,
      hidden: !!P.hidden,
      hideSpot: P.hidden,
      camera,
    };
    const b = state === "play" ? bayang.update(dt, pinfo) : { dist: Infinity };
    emit("tick", dt);

    // fear, flashlight, sound
    const vis = bayang.active && bayang.floor === P.floor;
    // falling behind keeps a floor of dread under everything
    const fear = Math.max(vis ? clamp(1 - b.dist / 16) * 0.8 + (bayang.hunting ? 0.2 : 0) : 0, threat * 0.14);
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
    if (state === "play" && bayang.active && bayang.moving > 0 && bayang.floor === P.floor && b.dist < 13 && dragCapT <= 0 && !bayang.onScreen(pinfo)) {
      dragCapT = 7;
      sub(`[${t("cap.drag")} ${dirWord({ floor: bayang.floor, pos: bpos })}]`, 2.5, "caption");
    }
    sound.listen(camera);
  } else if (state === "caught") {
    // the jumpscare, in beats: silence and the forced turn (0-0.55), the face and the scream (0.55-1.8),
    // a cut to black and dead silence, a flat tone, and your name, whispered
    const before = caughtT;
    caughtT += dt;
    const at = (x) => before < x && caughtT >= x;
    const g = bayang.g, y0 = hotel.levelY(P.floor);
    bayang.floor = P.floor;
    g.visible = true;
    const fwd = () => new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    if (caughtT < 0.55) {
      let d = caughtFrom.to - caughtFrom.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      P.yaw = caughtFrom.yaw + d * (1 - (1 - clamp(caughtT / 0.45)) ** 3);
      P.pitch = lerp(P.pitch, 0.05, dt * 6);
      flashlight.intensity = 0;
      post.uniforms.dark.value = lerp(post.uniforms.dark.value, 0.35, dt * 8);
      post.uniforms.glitch.value = 0;
      post.uniforms.fear.value = 0.6;
      const f = fwd();
      g.position.set(P.x + f.x * 2.6, y0 - 0.2, P.z + f.z * 2.6);
      bayang.parts.face.visible = false;
    } else {
      if (at(0.55)) {
        sound.duck(1, 0.005);
        sound.play("impact");
        sound.play("scream");
        post.uniforms.flash.value = 1;
        post.uniforms.dark.value = 1;
        bayang.parts.face.visible = true;
      }
      // it is in your face, then lunges closer still
      const f = fwd(), close = caughtT < 1.25 ? lerp(0.95, 0.62, clamp((caughtT - 0.55) / 0.15)) : lerp(0.62, 0.36, clamp((caughtT - 1.25) / 0.12));
      g.position.set(P.x + f.x * close, y0 - 0.78 + (Math.random() - 0.5) * 0.03, P.z + f.z * close);
      g.rotation.y = Math.atan2(P.x - g.position.x, P.z - g.position.z) + Math.PI;
      // the neck twists further than a neck should, in jerks
      const twist = Math.min(1.5, Math.floor((caughtT - 0.55) * 7) * 0.18);
      bayang.parts.neck.rotation.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2, twist + (Math.random() - 0.5) * 0.15);
      bayang.parts.arms[0].rotation.x = -1.7;
      bayang.parts.arms[1].rotation.x = -1.5;
      P.pitch = lerp(P.pitch, 0.02, dt * 10);
      flashlight.intensity = caughtT < 1.8 ? (Math.random() < 0.75 ? 90 : 4) : 0;
      post.uniforms.glitch.value = caughtT < 1.8 ? 0.7 + Math.random() * 0.3 : 0;
      post.uniforms.fear.value = 1;
      post.uniforms.flash.value = Math.random() < 0.15 ? 0.9 : post.uniforms.flash.value * 0.8;
      // single frames of the face, full screen: there and gone before you're sure you saw it
      subliminal = [[0.7, 0.76], [1.02, 1.07], [1.4, 1.46]].some(([a, b]) => caughtT >= a && caughtT < b) ? 1 : 0;
      if (at(1.8)) {
        // cut: black, and nothing at all
        sound.duck(0, 0.004);
        post.uniforms.dark.value = 0;
        bayang.parts.face.visible = false;
        g.visible = false;
        screenFx = createFx(crtOff, { color: "#000000", seed: 2, palette: BLOOD });
      }
      if (caughtT >= 1.8) {
        post.uniforms.dark.value = 0;
        g.visible = false;
      }
      if (at(2.5)) {
        sound.duck(1, 0.3);
        sound.play("tinnitus");
        sound.play("flatline");
      }
      if (at(3.4) && !whispered) {
        whispered = true;
        const nm = (playerName || t("ui.namePh")).toUpperCase();
        sound.voice(nm, "whisper", sound.at(camera.position.clone().add(new THREE.Vector3(Math.cos(P.yaw) * 0.4, 0, -Math.sin(P.yaw) * 0.4))));
        sub(`...${nm}...`, 2.6, "whisper");
      }
    }
    camera.position.set(P.x + (Math.random() - 0.5) * (caughtT > 0.55 && caughtT < 1.8 ? 0.08 : 0.004), y0 + EYE + (Math.random() - 0.5) * 0.04, P.z);
    camera.rotation.set(P.pitch, P.yaw, caughtT > 0.55 && caughtT < 1.8 ? (Math.random() - 0.5) * 0.1 : 0);
    if (caughtT > 5.4) {
      state = "dead";
      subliminal = 0;
      $("deadTitle").textContent = t("ui.caught");
      $("deadText").textContent = t("ui.caughtText", { n: night.n, time: clockText(), done: tasks.filter((q) => q.done).length, all: tasks.length });
      $("deadTag").textContent = t(night.n === 7 ? "ui.caughtTag7" : "ui.caughtTag");
      const now = new Date();
      $("deadReal").textContent = t("ui.realTime", { time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` });
      $("retryBtn").textContent = t(checkpointData?.night === night.n ? "ui.retryCp" : "ui.retry");
      showScreen("dead");
    }
  } else if (state === "ending") {
    caughtT += dt;
    post.uniforms.dark.value = Math.max(0, 1 - caughtT * 0.6);
    if (caughtT > 2.2) {
      state = "done";
      playCards(EPILOGUE, () => {
        $("endTitle").textContent = t("end.title");
        $("endText").textContent = t("end.text");
        $("endTeaser").textContent = t("end.teaser");
        showScreen("ending");
      });
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
    nightVision(true);
    renderer.setRenderTarget(monitorRT);
    renderer.render(scene, cam.cam);
    nightVision(false);
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
    nightVision(true);
    renderer.render(scene, hotel.cameras[cctvIdx].cam);
    nightVision(false);
    flashlight.intensity = fl;
  } else renderer.render(scene, camera);
  post.uniforms.tDiffuse.value = rt.texture;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  updateHud(dt);
}
if (!TRAILER) renderer.setAnimationLoop(() => frame());

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
      p.text(t(cam.label), 8, 8, C.cam, { shadow: C.shadow });
      p.text(`${clockText()}  ${t(FLOOR_NAME[cam.floor]).toUpperCase()}`, 8, 16, C.cam, { shadow: C.shadow });
      if (Math.floor(performance.now() / 600) % 2) {
        p.rect(W - 30, 9, 4, 4, C.red);
        p.text("REC", W - 24, 8, C.cam);
      }
      p.text(t(touch ? "hud.camTouch" : "hud.cam"), W / 2, H - 14, C.cam, { align: "center", shadow: C.shadow });
    } else {
      // looking out through the slats of a wardrobe
      if (P.mode === "hide") for (let yy = 0; yy < H; yy += 9) p.rect(0, yy, W, 5, C.shadow, 0.92);
      const nl = t("hud.night", { n: night.n });
      p.text(nl, 8, 7, C.ink, { shadow: C.shadow });
      p.text(clockText(), 8 + p.measure(nl)[0] + 6, 7, clockStopped ? C.red : C.dim, { shadow: C.shadow });
      // objectives: what's left, and what just got done
      let y = 18;
      const width = Math.min(150, W * 0.55);
      // the threat level, if any, next to the clock
      if (threat > 0) {
        const tx = 8 + p.measure(nl)[0] + 6 + p.measure(clockText())[0] + 8;
        const on = threat >= 3 ? Math.floor(time * 4) % 2 : 1;
        if (on) p.text(t("hud.threat", { 0: "" }).replace("{0}", "").trim(), tx, 7, C.red, { shadow: C.shadow });
        const tw = p.measure(t("hud.threat").replace("{0}", "").trim())[0];
        for (let i = 0; i < 3; i++) p.rect(tx + tw + 4 + i * 5, 8, 3, 4, i < threat ? C.red : C.dim, i < threat ? 1 : 0.5);
      }
      // the current objective, bright and against the clock; the rest queued and dim; just-done in green
      const act = activeTask();
      const order = [...tasks.filter((q) => q.done && time - q.at <= 4), ...(act ? [act] : []), ...tasks.filter((q) => !q.done && q !== act)];
      for (const q of order) {
        const isAct = q === act, queued = !q.done && !isAct;
        const lines = wrap(p, t(q.text), width - 8);
        const col = q.done ? C.dim : queued ? C.dim : q.id === "write" ? C.amber : C.ink;
        p.rect(8, y + 1, 3, 3, q.done ? C.green : queued ? C.dim : col, queued ? 0.5 : 1);
        lines.forEach((l, i) => p.text(l, 14, y + i * 7, col, { shadow: C.shadow }));
        if (isAct && q.started !== null) {
          const left = Math.max(0, q.limit - (time - q.started));
          const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
          const late = left < 15 || q.missed > 0;
          if (!late || Math.floor(time * 3) % 2 || left > 5) p.text(`${mm}:${String(ss).padStart(2, "0")}`, 14, y + lines.length * 7, late ? C.red : C.teal, { shadow: C.shadow });
          y += 7;
        }
        y += lines.length * 7 + 3;
        if (y > H * 0.55) break;
      }
      // keys held
      if (P.keys.size) {
        const k = [...P.keys.values()].map((v) => t(v).replace(/^(Key|Kunci) /, "")).join(", ");
        p.text(t("hud.keys") + k.toUpperCase(), W - 8, H - 12, C.amber, { align: "right", shadow: C.shadow });
      }
      // battery and stamina
      const bx = 8, by = H - 20, bw = 30, bh = 9, k = clamp(P.battery / 100);
      p.text(t(P.light ? "hud.light" : touch ? "hud.lightOff" : "hud.lightF"), bx, by - 8, C.dim, { shadow: C.shadow });
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
        p.text(t(touch ? "hud.outTouch" : "hud.out"), W / 2, H - 30, C.ink, { align: "center", outline: C.shadow });
      } else if (P.mode === "walk" && focus) {
        const txt = (touch ? t("hud.useTouch") : "E - ") + promptFor(focus).toUpperCase();
        p.text(txt, W / 2, Math.round(H * 0.62), C.ink, { align: "center", outline: C.shadow });
      }
      if (P.mode === "walk") p.rect(Math.floor(W / 2), Math.floor(H / 2), 1, 1, C.ink, 0.35);
    }
  }
  if (state === "caught" && false)
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
  if (state === "caught" && subliminal) {
    // the face, filling the screen for a frame
    hudCtx.imageSmoothingEnabled = false;
    const fh = H * 1.05, fw = (fh * FACE.width) / FACE.height;
    hudCtx.globalAlpha = 0.92;
    hudCtx.drawImage(FACE, (W - fw) / 2 + (Math.random() - 0.5) * 8, (H - fh) / 2, fw, fh);
    hudCtx.globalAlpha = 1;
  }
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
  if (TRAILER) return;
  if (!touch && state === "play" && !document.pointerLockElement) renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
}
function pause() {
  if (state !== "play") return;
  state = "paused";
  input.f = input.b = input.l = input.r = 0;
  renderJournal();
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
  $("startBtn").textContent = n > 1 ? t("ui.startN", { n }) : t("ui.start");
  const box = $("nightPick");
  box.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const b = document.createElement("button");
    b.textContent = String(i);
    b.disabled = i > n;
    b.title = t(NIGHTS[i - 1].title);
    b.setAttribute("aria-label", `${t("ui.night", { n: i })}: ${t(NIGHTS[i - 1].title)}`);
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
$("startBtn").addEventListener("click", () => {
  const n = Math.min(7, progress.night);
  if (n === 1 && !store.get("prologue", false)) return playPrologue();
  showDay(n);
});
$("prologueBtn").addEventListener("click", () => playPrologue());
function playPrologue() {
  sound.start();
  playCards(PROLOGUE, () => {
    store.set("prologue", true);
    showDay(1);
  });
}

// ---------------------------------------------------------------- story cards: the prologue and the ending
function playCards(cards, done) {
  let i = 0;
  state = "cards";
  document.exitPointerLock?.();
  const name = (playerName || t("ui.namePh")).toUpperCase();
  const show = () => {
    const [head, small, style] = cards[i];
    const box = $("cardBox");
    box.className = "cardbox " + (style ?? "");
    $("cardHead").textContent = t(head, { name });
    $("cardSmall").textContent = t(small, { name });
    $("cardStep").textContent = `${i + 1} / ${cards.length}`;
    $("cardNext").textContent = t(i === cards.length - 1 ? "ui.continue" : "ui.next");
    box.classList.remove("in");
    void box.offsetWidth;
    box.classList.add("in");
    sound.play("click");
  };
  $("cardNext").onclick = () => (++i >= cards.length ? done() : show());
  $("cardSkip").onclick = () => done();
  show();
  showScreen("cards");
}

// ---------------------------------------------------------------- the journal, in the pause menu
function renderJournal() {
  const n = night?.n ?? 1;
  const known = KNOWN[n] ?? [];
  $("jKnow").innerHTML = known.length ? known.map((k) => `<li>${t(k)}</li>`).join("") : `<li class="none">${t("ui.nothingKnown")}</li>`;
  const seen = store.get("notes", []);
  const box = $("jNotes");
  box.innerHTML = "";
  if (!seen.length) box.innerHTML = `<span class="none">${t("ui.noNotes")}</span>`;
  for (const id of NOTES.filter((x) => seen.includes(x))) {
    const b = document.createElement("button");
    b.className = "ghost";
    b.textContent = t(`note.${id}.t`);
    b.addEventListener("click", () => {
      $("noteTitle").textContent = t(`note.${id}.t`);
      $("noteText").textContent = t(`note.${id}`);
      $("note").hidden = false;
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------- languages
function applyStatic() {
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
  for (const b of document.querySelectorAll("#langRow button")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang()));
}
for (const l of LANGS) {
  const b = document.createElement("button");
  b.className = "ghost";
  b.dataset.lang = l.id;
  b.textContent = l.name;
  b.addEventListener("click", () => {
    setLang(l.id);
    applyStatic();
    refreshTitle();
    // signs and labels in the hotel are in the chosen language too
    buildTitleHotel();
  });
  $("langRow").appendChild(b);
}
document.documentElement.lang = lang();
applyStatic();
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
function buildTitleHotel() {
  if (hotel) {
    hotel.root.traverse((o) => o.geometry?.dispose());
    scene.remove(hotel.root);
  }
  hotel = new Hotel(scene);
  hotel.buildRain();
  bayang = new Bayang(hotel, {});
  bayang.reset({ active: false });
}
buildTitleHotel();
night = NIGHTS[0];
Object.assign(P, { floor: "G", x: 12.5 * T, z: 6.2 * T, yaw: 0, pitch: -0.05, mode: "walk" });
refreshTitle();
// first, the earphones card; its button is also the gesture that lets sound start
showScreen(TRAILER ? null : "ear");
$("earBtn").addEventListener("click", () => {
  sound.start();
  sound.setVolume(settings.volume);
  sound.play("heart", null, { k: 0.6 });
  showScreen("title");
});
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
  get threat() {
    return threat;
  },
  set speed(v) {
    timeScale = v;
  },
};


// ---------------------------------------------------------------- the trailer director (?trailer)
// Drives the real game, one fixed frame at a time, through a scripted cut: the shots below set the camera,
// the hotel and Bayang, and the game does the rest (lights, effects, AI, captions, the jumpscare).
if (TRAILER) {
  const FPS = 30, DUR = 58;
  const qs = new URLSearchParams(location.search);
  if (qs.get("lang")) setLang(qs.get("lang"));
  applyStatic();
  buildTitleHotel();
  const ov = document.createElement("div");
  ov.id = "trailer";
  ov.style.cssText = "position:fixed;inset:0;z-index:50;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:VT323,monospace;color:#d8d0c0;text-align:center;padding:24px";
  document.body.appendChild(ov);
  const PHONES = document.querySelector(".phones").outerHTML;
  sound.startOffline(DUR + 1);
  sound.setVolume(0.9);
  settings.subs = true;
  const lookYaw = (fx, fy, tx, ty) => Math.atan2(-(tx - fx), -(ty - fy));
  const cam = (f, x, y, yaw, pitch = 0) => Object.assign(P, { floor: f, x: x * T, z: y * T, yaw, pitch, mode: "walk", hidden: null });
  const fade = (T, a, b, edge = 0.5) => clamp(Math.min((T - a) / edge, (b - T) / edge));
  const card = (html, op, bg = "transparent", justify = "center") => {
    if (ov.dataset.html !== html) {
      ov.innerHTML = html;
      ov.dataset.html = html;
    }
    ov.style.opacity = op;
    ov.style.background = bg;
    ov.style.justifyContent = justify;
  };
  const lower = (text) => `<p style="font-size:44px;letter-spacing:0.06em;text-shadow:0 0 12px #000,2px 2px 0 #000;margin:0 0 70px">${text}</p>`;
  const hud = (on) => (hudCanvas.style.visibility = on ? "visible" : "hidden");
  const clearStory = () => {
    tasks = [];
    timers = [];
    handlers = {};
    pending = 0;
    for (const r of Object.values(ringing)) r.handle.stop();
    ringing = {};
    for (const q of subsQueue) q.el.remove();
    subsQueue = [];
  };
  const once = {};
  const at = (key, T, t0) => (T >= t0 && !once[key] ? (once[key] = true) : false);
  let caughtAt = null;

  const SHOTS = [
    // 0: black, earphones, a heartbeat
    { at: 0, enter() {
        startNight(5);
        clearStory();
        bayang.mode = "off";
        clockStopped = "03:17";
        hud(false);
        cam("G", 16.2, 8.5, lookYaw(16.2, 8.5, 11.5, 2), 0.02);
        P.light = false;
      }, tick(T) {
        card(`${PHONES}<h1 style="font-size:84px;margin:0;letter-spacing:0.16em">${t("tr.ear1")}</h1><p style="font-size:30px;color:#d8a850;margin:0">${t("tr.ear2")}</p>`, fade(T, 0.3, 4.3, 0.6), "#000");
        for (const b of [1.0, 2.0, 3.0, 3.5]) if (at("hb" + b, T, b)) sound.play("heart", null, { k: 0.9 });
      } },
    // 1: the lobby in the rain, a slow push in; the counter bell rings for nobody
    { at: 4.5, enter() {
        post.uniforms.dark.value = 1;
      }, tick(T) {
        const k = clamp(T / 6);
        cam("G", lerp(16.2, 13.4, k), lerp(8.5, 5.8, k), lookYaw(lerp(16.2, 13.4, k), lerp(8.5, 5.8, k), 11.5, 2), 0.02);
        card(T < 3 ? lower(t("tr.l1")) : lower(t("tr.l2")), T < 3 ? fade(T, 0.4, 2.9, 0.4) : fade(T, 3.0, 5.9, 0.4), "transparent", "flex-end");
        if (at("bell", T, 3.6)) sfx("bell", "bell");
      } },
    // 2: the CCTV, cutting between cameras to the thing on floor 3
    { at: 10.5, enter() {
        hud(true);
        cam("G", 2.7, 2.2, 0, -0.1);
        P.mode = "cctv";
        cctvIdx = 0;
        bayang.cfg.active = true;
        bayang.staticFigure("3", 24, 5.5);
        bayang.timer = 99;
      }, tick(T) {
        const idx = T < 1.4 ? 0 : T < 2.8 ? 2 : 5;
        if (idx !== cctvIdx) {
          cctvIdx = idx;
          sound.play("click");
        }
        const c = hotel.cameras[5].cam.position;
        bayang.heading = Math.atan2(c.x - bayang.x, c.z - bayang.z);
        card(lower(t("tr.l3")), fade(T, 0.5, 4.3, 0.4), "transparent", "flex-end");
      } },
    // 3: the post phone rings; a room that should be empty is calling
    { at: 15, enter() {
        bayang.mode = "off";
        cam("G", 2.9, 3.0, lookYaw(2.9, 3.0, 1.45, 1.5), -0.32);
        P.light = true;
        ctx.ring("phone_pos", () => {
          speak([["salmah", "n2.c1", "phone"], ["salmah", "n2.c2", "phone"]], null);
          ctx.task("r207", "n2.task", { urgent: true, limit: 999 });
        });
      }, tick(T) {
        if (at("answer", T, 2.2)) answer("phone_pos");
        P.yaw = lookYaw(2.9, 3.0, 1.45, 1.5) + Math.sin(T * 0.7) * 0.02;
        card(lower(t("tr.l4")), fade(T, 0.4, 2.1, 0.3), "transparent", "flex-end");
      } },
    // 4: floor 2 with the flashlight; the lights stop humming; something stands in the doorway of 209
    { at: 20.5, enter() {
        scene.fog.density = 0.05;
        for (const q of subsQueue) q.el.remove();
        subsQueue = [];
        cam("2", 15.2, 5.5, -Math.PI / 2, 0);
      }, tick(T, dt) {
        if (T < 3.2) {
          P.x += 1.5 * dt;
          P.bob += 1.5 * dt * 2.9;
          if (Math.floor(T / 0.55) !== Math.floor((T - dt) / 0.55)) sound.play("step", null, { run: false });
        }
        if (at("hum", T, 2.4)) {
          humOn = false;
          ctx.caption("cap.humStops");
        }
        if (at("glimpse", T, 3.0)) {
          bayang.glimpse({ floor: "2", at: [23.5, 4.55], look: [12, 5.5], exit: [23.5, 3.2], hold: 3 });
          sound.play("stinger");
        }
        card(lower(t("tr.l5")), T > 5.2 ? fade(T, 5.3, 7.0, 0.3) : 0, "transparent", "flex-end");
      } },
    // 5: the bathroom of 207: the light stutters, the curtain moves, hands come up out of the tub
    { at: 27.5, enter() {
        scene.fog.density = 0.075;
        humOn = true;
        bayang.mode = "off";
        cam("2", 19.7, 3.6, lookYaw(19.7, 3.6, 19.5, 1.4), -0.22);
        hotel.setLight("bath207", 3);
        hotel.flicker("bath207", true);
        hotel.curtain("207", true);
        hud(false);
      }, tick(T) {
        P.yaw = lookYaw(19.7, 3.6, 19.5, 1.4) + Math.sin(T * 0.5) * 0.03;
        if (at("hands", T, 1.6)) ctx.hands("2", 19.55, 2.25);
        card("", 0);
      } },
    // 6: room 317, which isn't on any plan
    { at: 32.5, enter() {
        hotel.reveal("317");
        hotel.setLight("r317", 4.5);
        hotel.flicker("r317", true);
        hotel.eye("3", 26.6, 3.2);
        hotel.eye("3", 28.4, 2.6);
        hotel.candle("3", 27.0, 3.6, 0);
        cam("3", 27.6, 3.9, lookYaw(27.6, 3.9, 27.0, 1.4), -0.12);
      }, tick(T) {
        const k = T / 4;
        cam("3", 27.6 - k * 0.2, 3.9 - k * 0.5, lookYaw(27.6, 3.9, 27.0, 1.4), -0.12);
        if (at("w317", T, 1.0)) sound.play("whisper", null, { vol: 0.5 });
        card(lower(t("tr.l6")), fade(T, 0.6, 3.8, 0.4), "transparent", "flex-end");
      } },
    // 7: the lift arrives by itself; the voice moves from the speaker into the empty cabin
    { at: 36.5, enter() {
        cam("G", 21.3, 3.5, Math.PI / 2 * -1 + 0, 0.06);
        P.yaw = lookYaw(21.3, 3.5, 24.5, 3.5);
      }, tick(T) {
        const k = T / 5;
        cam("G", 21.3 + k * 0.8, 3.5, lookYaw(21.3, 3.5, 24.5, 3.5), 0.06);
        if (at("lift", T, 0.3)) ctx.liftArrive("G");
        if (at("v1", T, 1.3)) speak([["salmah", "n5.l1", "speaker"]], where({ floor: "G", x: 24.2, y: 3.5, h: 2.5 }));
        if (at("v2", T, 3.2)) speak([["salmah", "n5.l2", "near"]], where({ floor: "G", x: 24.6, y: 3.5, h: 1.6 }));
        card("", 0);
      } },
    // 8: it sees you: backing down the corridor as it comes, faster than you
    { at: 41.5, enter() {
        scene.fog.density = 0.06;
        hud(true);
        clearStory();
        cam("2", 14, 5.5, -Math.PI / 2, 0.02);
        P.light = true;
        noBeam = true;
        bayang.cfg = { ...bayang.cfg, active: true, floors: ["2"], speed: 6.2 };
        bayang.place("2", 21, 5.5);
        bayang.mode = "chase";
        bayang.knows = 30;
        bayang.heading = -Math.PI / 2;
        threat = 3;
      }, tick(T, dt) {
        if (state === "play") {
          P.x -= 3.6 * dt;
          P.bob += 3.6 * dt * 2.4;
          if (Math.floor(T / 0.33) !== Math.floor((T - dt) / 0.33)) sound.play("step", null, { run: true });
          bayang.knows = 30;
        }
        if (state === "caught" && caughtAt === null) caughtAt = T;
        card("", 0);
      } },
    // 9: the title, over the silence after the scream
    { at: 99, enter() {
        hud(false);
      }, tick(T) {
        const flick = T < 1.2 ? (Math.random() < 0.3 ? 0.2 : 1) : 1;
        const html = `<h1 style="font-size:150px;margin:0;letter-spacing:0.18em;text-shadow:5px 0 #c8201c,-3px 0 #1b3a8a;opacity:${flick}">SENYAP</h1>
          <p style="font-size:38px;color:#d8a850;letter-spacing:0.4em;margin:0">${t("ui.tagline")}</p>
          <p style="font-size:30px;margin:18px 0 0;opacity:${clamp((T - 1.6) / 0.6)}">${t("tr.f1")}</p>
          <div style="display:flex;align-items:center;gap:16px;margin-top:22px;opacity:${clamp((T - 2.6) / 0.6)}"><span style="transform:scale(0.55);display:inline-block;margin:-30px">${PHONES}</span><span style="font-size:40px;letter-spacing:0.14em">${t("tr.ear1")}</span></div>
          <p style="font-size:30px;color:#7ef0dc;margin:6px 0 0;opacity:${clamp((T - 3.6) / 0.6)}">${t("tr.f2")}</p>`;
        ov.innerHTML = html;
        ov.dataset.html = "";
        ov.style.opacity = Math.min(1, T / 0.25, (DUR - S9 - T) / 0.8);
        ov.style.background = "#000";
        ov.style.justifyContent = "center";
        if (at("ring", T, 4.6)) {
          const h = sound.ring(null);
          sound.later(() => h.stop(), 2.2);
        }
      } },
  ];
  let S9 = 49;
  let cur = -1;
  window.__trailer = {
    FPS,
    DUR,
    frames: Math.round(DUR * FPS),
    step(i) {
      const Tg = i / FPS, dt = 1 / FPS;
      // the last shot starts when the jumpscare has cut to black (or at 50 s whatever happens)
      if (cur === 8 && ((caughtAt !== null && caughtT > 2.6) || Tg > 51)) {
        S9 = Tg;
        SHOTS[9].at = Tg;
      }
      let n = 0;
      for (let k = 0; k < SHOTS.length; k++) if (Tg >= SHOTS[k].at) n = k;
      if (n !== cur) {
        cur = n;
        SHOTS[n].enter();
      }
      SHOTS[n].tick(Tg - SHOTS[n].at, dt);
      frame(dt);
    },
    audio: () => sound.renderWav(),
  };
}
