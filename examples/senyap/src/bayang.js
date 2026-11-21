// Bayang: the tall thing that drags a burnt sheet through the hotel. It patrols, goes to the last loud
// sound it heard and stops there to listen, chases what it sees, searches where it last saw you, opens doors
// on its way, follows you up and down the stairs, and backs off from a flashlight held on its face.
import * as THREE from "three";
import { T, ARRIVE, FLOOR } from "./data/maps.js";
import { path } from "./maze.js";
import { FxSprite } from "./fxsprite.js";
import { glowTexture } from "./textures.js";
import * as shadowFlames from "../../../src/fx/shadow/shadow-flames.js";

export const BLOOD = ["#050102", "#1a0306", "#3a060c", "#660a12", "#9a1420", "#d02a2a", "#ff6a50", "#ffd0c0"];

// the face it shows when it catches you: drawn pixel by pixel, pale and stretched, with hollow eyes and a
// mouth that hangs open too far. It stays hidden until the end.
export const FACE = (() => {
  const W = 32, H = 48, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  };
  const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // a long pale head, narrowing to the chin
      const rx = 13 - Math.max(0, y - 30) * 0.35;
      if (!inEllipse(x, y, 15.5, 23, rx, 22)) continue;
      const shade = 150 - Math.abs(x - 15.5) * 4 - Math.max(0, y - 34) * 3 + rnd() * 14;
      put(x, y, shade * 0.92, shade * 0.88, shade * 0.8);
      // veins and cracks
      if (rnd() < 0.05) put(x, y, shade * 0.5, shade * 0.4, shade * 0.4);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // hollow eye sockets, long and black, with a pinprick of red
      for (const ex of [10, 21])
        if (inEllipse(x, y, ex, 17, 3.2, 5.5)) put(x, y, 6, 4, 4);
      if ((x === 10 || x === 21) && (y === 18 || y === 19)) put(x, y, 255, 40, 20);
      // the mouth, open far past where a jaw should stop
      if (inEllipse(x, y, 15.5, 34, 5.5, 9)) put(x, y, 4, 2, 2);
      // teeth along the top and bottom of it
      if (inEllipse(x, y, 15.5, 34, 5.5, 9) && (Math.abs(y - 26) < 2 || Math.abs(y - 42) < 2) && x % 2 === 0) put(x, y, 196, 188, 160);
      // black hair hanging over the sides
      const hair = (x < 6 || x > 25) && y < 40 && rnd() < 0.85;
      if (hair && inEllipse(x, y, 15.5, 23, 15, 24)) put(x, y, 8, 6, 6);
      if (y < 5 && inEllipse(x, y, 15.5, 23, 13, 22)) put(x, y, 10, 8, 8);
    }
  // dark streaks running from the eyes
  for (const ex of [10, 21]) for (let y = 23; y < 34; y++) if (rnd() < 0.8) put(ex + (y % 3 === 0 ? 1 : 0), y, 40, 6, 6);
  ctx.putImageData(img, 0, 0);
  return c;
})();

export function body() {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0x0c0a0b, roughness: 0.95 });
  const sheet = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1, side: THREE.DoubleSide });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.25, 7), skin);
  torso.position.y = 1.55;
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.08, 1.0, 6), skin);
  hips.position.y = 0.6;
  const neck = new THREE.Group();
  neck.position.y = 2.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), skin);
  head.scale.set(0.9, 1.35, 1);
  head.position.y = 0.2;
  neck.add(head);
  // the face, hidden until it has you
  const faceTex = new THREE.CanvasTexture(FACE);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.magFilter = faceTex.minFilter = THREE.NearestFilter;
  faceTex.generateMipmaps = false;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.63), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.5, fog: false }));
  face.position.set(0, 0.2, -0.2);
  face.rotation.y = Math.PI;
  face.visible = false;
  neck.add(face);
  const glow = glowTexture([255, 30, 20]);
  for (const s of [-1, 1]) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    e.scale.set(0.13, 0.13, 1);
    e.position.set(s * 0.07, 0.24, -0.16);
    neck.add(e);
  }
  // the burnt sheet over its shoulders, trailing on the floor behind it
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.4, 4, 8), sheet);
  cloth.position.set(0, 1.0, 0.22);
  cloth.rotation.x = -0.12;
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.28, 2.05, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 1.5, 5), skin);
    arm.position.y = -0.75;
    sh.add(arm);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.005, 0.3, 3), skin);
      finger.position.set((f - 1.5) * 0.024, -1.65, 0);
      finger.rotation.z = (f - 1.5) * 0.12;
      sh.add(finger);
    }
    sh.rotation.z = s * 0.08;
    g.add(sh);
    arms.push(sh);
  }
  g.add(torso, hips, neck, cloth);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const fire = new FxSprite(shadowFlames, { palette: BLOOD, seed: 3 }, { scale: 1 / 45 });
  g.add(fire.sprite);
  return { g, torso, neck, arms, cloth, fire, face };
}

const centre = (i) => (i + 0.5) * T;
const tile = (v) => Math.floor(v / T);

export class Bayang {
  constructor(hotel, events) {
    this.hotel = hotel;
    this.ev = events; // { onSee, onCatch, onBanish, onDoor, onStep }
    this.parts = body();
    this.g = this.parts.g;
    hotel.root.add(this.g);
    this.reset({ active: false });
  }

  reset(cfg) {
    this.cfg = { floors: ["G"], speed: 2.6, aggression: 0.4, ...cfg };
    this.level = 0;
    this.sightBonus = 0;
    this.parts.face.visible = false;
    this.mode = !cfg.active ? "off" : cfg.dormant ? "dormant" : "patrol";
    this.path = [];
    this.repath = 0;
    this.lit = 0;
    this.timer = 0;
    this.knows = 0;
    this.heading = 0;
    this.walk = 0;
    this.twitch = 0;
    this.moving = 0;
    this.sawHide = null;
    this.floorTimer = 80 + Math.random() * 40;
    this.screechT = 0;
    this.glimpseInfo = null;
    const s = cfg.start ?? ["G", 21, 3.5];
    this.place(s[0], s[1], s[2]);
    this.g.visible = this.mode !== "off" && this.mode !== "dormant";
  }

  get active() {
    return this.mode !== "off" && this.mode !== "dormant" && this.mode !== "gone" && this.mode !== "travel";
  }
  get hunting() {
    return this.mode === "chase" || this.mode === "search";
  }

  place(floor, x, y) {
    this.floor = floor;
    this.x = x * T;
    this.z = y * T;
    this.path = [];
    this.sync();
  }
  sync() {
    this.g.position.set(this.x, this.hotel.levelY(this.floor), this.z);
  }
  wake() {
    if (this.mode === "dormant" || this.mode === "off") {
      this.mode = "patrol";
      this.cfg.active = true;
    }
    this.g.visible = true;
  }
  goTo(tx, ty) {
    this.path = path(this.hotel.nav(this.floor), tile(this.x), tile(this.z), tx, ty);
  }
  investigate(floor, x, y, { listen = 3 } = {}) {
    this.wake();
    if (floor !== this.floor) {
      this.travel(floor, "stairs", 4, { investigate: [x, y], listen });
      return;
    }
    this.mode = "investigate";
    this.target = [Math.floor(x), Math.floor(y)];
    this.listenFor = listen;
    this.goTo(...this.target);
  }
  hunt() {
    this.wake();
    this.mode = "chase";
    this.knows = 10;
  }
  glimpse(o) {
    this.wake();
    this.place(o.floor, o.at[0], o.at[1]);
    this.mode = "glimpse";
    this.glimpseInfo = { ...o, seen: 0, t: 0, leaving: false };
    this.heading = Math.atan2(o.look[0] * T - this.x, o.look[1] * T - this.z);
    const d = this.hotel.doorAt(o.floor, Math.floor(o.at[0]), Math.floor(o.at[1]));
    if (d) d.open = true;
  }
  staticFigure(floor, x, y) {
    this.wake();
    this.place(floor, x, y);
    this.mode = "stand";
    this.timer = 25;
  }

  /** A loud sound at world (wx, wz) on a floor, heard within radius metres. */
  noise(floor, wx, wz, radius) {
    if (!this.cfg.active || this.mode === "off" || this.mode === "dormant" || this.mode === "gone" || this.mode === "glimpse" || this.mode === "stand") return;
    if (this.mode === "chase" && this.knows > 0) return;
    if (floor === this.floor) {
      if (Math.hypot(wx - this.x, wz - this.z) > radius) return;
      this.mode = "investigate";
      this.target = [tile(wx), tile(wz)];
      this.listenFor = 3;
      this.goTo(...this.target);
    } else if (radius >= 25 && this.cfg.floors.includes(floor) && this.mode !== "travel") {
      this.travel(floor, "stairs", 6, { investigate: [wx / T, wz / T], listen: 3 });
    }
  }

  /** Leave this floor and come out of the stairs or lift on another after a while. */
  travel(floor, via, delay, then = {}) {
    if (!this.cfg.floors.includes(floor)) return;
    this.mode = "travel";
    this.g.visible = false;
    this.timer = delay;
    this.travelTo = { floor, via, then };
  }

  /** You left the floor while it was after you: it follows. */
  follow(floor, via) {
    if (!this.hunting || this.floor === floor) return;
    this.travel(floor, via === "lift" ? "stairs" : via, via === "lift" ? 9 : 5.5, { search: true });
  }

  /**
   * An objective ran out of time: it gets faster, sees further, wanders less, and goes to where you are.
   * level 1..3. On a night when it isn't hunting yet, level 2 wakes it on your floor.
   */
  escalate(level, p, floors) {
    this.level = level;
    this.cfg.speed = (this.cfg.baseSpeed ??= this.cfg.speed ?? 2.4) * (1 + 0.14 * level);
    this.cfg.aggression = Math.min(0.95, (this.cfg.baseAggr ??= this.cfg.aggression ?? 0.4) + 0.2 * level);
    this.sightBonus = level * 3;
    this.floorTimer = Math.min(this.floorTimer, 40 - level * 8);
    if (!this.cfg.active || this.mode === "off" || this.mode === "dormant") {
      if (level < 2) return;
      this.cfg.active = true;
      this.cfg.floors = floors;
      const a = ARRIVE[p.floor].lift ?? ARRIVE[p.floor].stairs;
      this.place(p.floor, a[0], a[1]);
      this.mode = "patrol";
      this.g.visible = true;
    }
    // from level 2 no floor is safe
    if (level >= 2 && !this.cfg.floors.includes(p.floor)) this.cfg.floors = [...this.cfg.floors, p.floor];
    if (this.mode === "gone") this.timer = Math.min(this.timer, 4);
    if (level >= 2 && this.mode !== "chase") {
      if (this.floor === p.floor) this.investigate(p.floor, p.x / T, p.z / T, { listen: 2 });
      else if (this.cfg.floors.includes(p.floor) && this.mode !== "travel") this.travel(p.floor, "stairs", 6 - level, { investigate: [p.x / T, p.z / T], listen: 2 });
    }
  }

  banish(player) {
    this.mode = "gone";
    this.timer = 14;
    this.g.visible = false;
    this.lit = 0;
    this.respawnAwayFrom = player;
  }

  sees(p) {
    if (p.floor !== this.floor || p.hidden) return false;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    const range = (p.light ? 15 : 6.5) + (this.sightBonus ?? 0);
    if (d > range) return false;
    if (d > 2.5) {
      const a = Math.atan2(dx, dz) - this.heading;
      if (Math.cos(a) < Math.cos(1.25)) return false;
    }
    return this.hotel.clearLine(this.floor, this.x, this.z, p.x, p.z);
  }

  pickPatrol(p) {
    const nav = this.hotel.nav(this.floor), F = this.hotel.floors[this.floor];
    const tiles = [];
    for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) if (!nav.wall(x, y) && F.grid[y][x] === ".") tiles.push([x, y]);
    let pool = tiles;
    if (p.floor === this.floor && Math.random() < this.cfg.aggression) {
      const near = tiles.filter(([x, y]) => Math.abs(x - tile(p.x)) + Math.abs(y - tile(p.z)) < 7);
      if (near.length) pool = near;
    }
    const t = pool[Math.floor(Math.random() * pool.length)];
    this.goTo(t[0], t[1]);
  }

  /** Step along the path; true while still moving. Opens closed doors on the way. */
  stepPath(dt, speed) {
    if (this.doorWait > 0) {
      this.doorWait -= dt;
      return true;
    }
    if (!this.path.length) return false;
    const [ix, iy] = this.path[0];
    const door = this.hotel.doorAt(this.floor, ix, iy);
    if (door && !door.open && !door.hidden) {
      door.open = true;
      this.doorWait = 0.8;
      this.ev.onDoor?.(door);
      return true;
    }
    return this.steer(dt, centre(ix), centre(iy), speed, () => this.path.shift());
  }

  steer(dt, tx, tz, speed, arrived) {
    const mx = tx - this.x, mz = tz - this.z, ml = Math.hypot(mx, mz);
    if (ml < 0.12) {
      arrived?.();
      return true;
    }
    const st = Math.min(ml, speed * (this.slow ?? 1) * dt);
    this.x += (mx / ml) * st;
    this.z += (mz / ml) * st;
    this.walk += st * 2.3;
    this.moving = Math.min(1, speed / 2.5);
    let dh = Math.atan2(mx, mz) - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 6);
    return true;
  }

  /**
   * p: { floor, x, z, light, hidden, hideSpot, camera, beam }.
   * Returns { dist, sees, lit } for the game to react to.
   */
  update(dt, p) {
    this.moving = 0;
    const P = this.parts;
    P.fire.update(dt, p.camera);
    if (this.mode === "off" || this.mode === "dormant") {
      this.g.visible = false;
      return { dist: Infinity, sees: false, lit: false };
    }
    if (this.mode === "gone" || this.mode === "travel") {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.mode === "travel") {
          const { floor, via, then } = this.travelTo;
          const a = ARRIVE[floor][via in ARRIVE[floor] ? via : "stairs"];
          this.place(floor, a[0], a[1]);
          this.g.visible = true;
          if (then.investigate) this.investigate(floor, then.investigate[0], then.investigate[1], { listen: then.listen });
          else if (then.search) {
            this.mode = "search";
            this.target = [tile(p.x), tile(p.z)];
            this.goTo(...this.target);
            this.listenFor = 3;
          } else this.mode = "patrol";
        } else {
          // come back somewhere far from where it was driven off
          const floors = this.cfg.floors;
          const f = floors[Math.floor(Math.random() * floors.length)];
          const a = ARRIVE[f].stairs;
          this.place(f, a[0], a[1]);
          if (f === p.floor && Math.hypot(this.x - p.x, this.z - p.z) < 12) {
            const b = ARRIVE[f].lift ?? a;
            this.place(f, b[0], b[1]);
          }
          this.mode = "patrol";
          this.g.visible = true;
        }
      }
      return { dist: Infinity, sees: false, lit: false };
    }

    const sameFloor = p.floor === this.floor;
    const dx = p.x - this.x, dz = p.z - this.z, dist = sameFloor ? Math.hypot(dx, dz) : Infinity;
    const canSee = this.mode !== "glimpse" && this.mode !== "stand" && this.sees(p);

    // the beam: held on its face it slows, then flees
    const lit = sameFloor && p.beam && dist < 14 && this.hotel.clearLine(this.floor, p.x, p.z, this.x, this.z) && this.inBeam(p);
    if (lit && this.mode !== "glimpse") {
      this.lit += dt;
      this.screechT -= dt;
      if (this.screechT <= 0) {
        this.ev.onScreech?.();
        this.screechT = 1.1;
      }
      if (this.lit > 2.6) {
        this.ev.onBanish?.();
        this.banish(p);
        return { dist, sees: false, lit: true };
      }
    } else this.lit = Math.max(0, this.lit - dt * 0.6);

    if (canSee) {
      if (this.mode !== "chase") this.ev.onSee?.();
      this.mode = "chase";
      this.knows = 2.5;
      this.lastSeen = [p.x, p.z];
    }
    // you hid while it watched
    if (p.hidden && this.mode === "chase" && sameFloor && !this.sawHide && dist < 8 && this.hotel.clearLine(this.floor, this.x, this.z, p.hideSpot.x, p.hideSpot.z) && this.knows > 0)
      this.sawHide = { x: p.hideSpot.x, z: p.hideSpot.z };
    if (!p.hidden) this.sawHide = null;

    let speed = 1.1;
    this.slow = lit ? 0.15 : 1;
    this.repath -= dt;
    switch (this.mode) {
      case "glimpse": {
        const gi = this.glimpseInfo;
        gi.t += dt;
        if (!gi.leaving) {
          this.heading = Math.atan2(gi.look[0] * T - this.x, gi.look[1] * T - this.z);
          if (sameFloor && this.onScreen(p)) gi.seen += dt;
          if (gi.seen > 0.9 || gi.t > gi.hold + 8 || lit) {
            gi.leaving = true;
            this.goTo(Math.floor(gi.exit[0]), Math.floor(gi.exit[1]));
          }
        } else if (!this.stepPath(dt, 1.6)) {
          if (gi.then === "patrol") this.mode = "patrol";
          else {
            this.mode = "off";
            this.g.visible = false;
            const d = this.hotel.doorAt(gi.floor, Math.floor(gi.at[0]), Math.floor(gi.at[1]));
            if (d) {
              d.open = false;
              this.ev.onSlam?.(d);
            }
          }
        }
        break;
      }
      case "stand":
        this.timer -= dt;
        this.heading = sameFloor ? Math.atan2(dx, dz) : this.heading;
        if (this.timer <= 0 || (sameFloor && dist < 10)) this.mode = "patrol";
        break;
      case "patrol":
        speed = 1.1;
        if (!this.stepPath(dt, speed)) this.pickPatrol(p);
        this.floorTimer -= dt;
        if (this.floorTimer <= 0 && this.cfg.floors.length > 1) {
          this.floorTimer = 70 + Math.random() * 50;
          const other = this.cfg.floors.filter((f) => f !== this.floor);
          const go = Math.random() < this.cfg.aggression && other.includes(p.floor) ? p.floor : other[Math.floor(Math.random() * other.length)];
          this.travel(go, Math.random() < 0.5 ? "stairs" : "lift", 8);
        }
        break;
      case "investigate":
      case "search":
        speed = this.mode === "search" ? this.cfg.speed * 0.75 : 1.9;
        if (!this.stepPath(dt, speed)) {
          // there: stand still and listen
          this.mode = "listen";
          this.timer = this.listenFor ?? 3;
          this.ev.onListen?.();
        }
        break;
      case "listen":
        this.timer -= dt;
        this.heading += Math.sin(this.timer * 2) * dt * 0.8;
        if (this.timer <= 0) this.mode = "patrol";
        break;
      case "chase": {
        this.knows -= dt;
        speed = this.cfg.speed;
        if (this.sawHide) {
          this.steer(dt, this.sawHide.x, this.sawHide.z, speed);
          if (Math.hypot(this.sawHide.x - this.x, this.sawHide.z - this.z) < 1.3) this.ev.onCatch?.("hide");
          break;
        }
        const tx = this.knows > 0 && sameFloor ? p.x : this.lastSeen?.[0] ?? p.x, tz = this.knows > 0 && sameFloor ? p.z : this.lastSeen?.[1] ?? p.z;
        if (sameFloor && canSee && dist < 5) this.steer(dt, tx, tz, speed);
        else {
          if (this.repath <= 0) {
            this.goTo(tile(tx), tile(tz));
            this.repath = 0.4;
          }
          if (!this.stepPath(dt, speed) && this.knows <= 0) {
            this.mode = "search";
            this.target = [tile(tx), tile(tz)];
            this.listenFor = 4;
          }
        }
        if (this.knows <= 0 && !canSee) {
          this.mode = "search";
          this.goTo(tile(tx), tile(tz));
          this.listenFor = 4;
        }
        break;
      }
    }
    this.sync();

    // the body: a lurching walk, arms out of time, a head that twitches; it shields its face from the light
    this.g.rotation.y = this.heading + Math.PI;
    P.torso.rotation.z = Math.sin(this.walk) * 0.08;
    P.torso.rotation.x = 0.12 + (this.hunting ? 0.18 : 0);
    P.arms[0].rotation.x = Math.sin(this.walk * 0.9) * 0.35 + (lit ? -1.1 : 0);
    P.arms[1].rotation.x = Math.sin(this.walk * 0.9 + 2.4) * 0.35 + (lit ? -1.3 : 0);
    P.cloth.rotation.x = -0.12 - this.moving * 0.25 + Math.sin(this.walk * 1.3) * 0.04;
    this.twitch -= dt;
    if (this.twitch <= 0) {
      P.neck.rotation.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.9);
      this.twitch = 0.08 + Math.random() * (this.hunting ? 0.25 : 0.9);
    }
    this.g.position.y += Math.abs(Math.sin(this.walk)) * 0.04;

    if (sameFloor && dist < 0.85 && !p.hidden && this.mode !== "glimpse" && this.mode !== "stand") this.ev.onCatch?.("touch");
    return { dist, sees: canSee, lit };
  }

  inBeam(p) {
    const f = p.camera.getWorldDirection(new THREE.Vector3());
    const to = new THREE.Vector3(this.x - p.x, this.hotel.levelY(this.floor) + 1.7 - p.camera.position.y, this.z - p.z).normalize();
    return to.dot(f) > Math.cos(0.36);
  }
  onScreen(p) {
    const f = p.camera.getWorldDirection(new THREE.Vector3());
    const to = new THREE.Vector3(this.x - p.x, 0, this.z - p.z).normalize();
    return to.dot(f) > Math.cos(0.5) && this.hotel.clearLine(this.floor, p.x, p.z, this.x, this.z);
  }
}
