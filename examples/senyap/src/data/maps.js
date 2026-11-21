// Hotel Seri Malam, floor by floor. Tiles are 2 m: # wall, . floor, + door, S stairs, E lift, X service
// door, M main glass door, w window, Q a door that is a wall until the story needs it (room 317).
// Props, lights, zones and spawn points are in tile units: tile (i, j) spans [i, i + 1] x [j, j + 1].

export const T = 2;
export const WALL_H = 2.8;
export const LEVEL_GAP = 5;

const G = [
  "##########################",
  "#......#.........#########",
  "#......+.........#......##",
  "#......#.........+......E#",
  "#......#.........#......##",
  "########.........###S#####",
  "#......#.........#########",
  "#......+.........#########",
  "#......#.........#########",
  "########wwwMMwww##########",
];

const GUEST = (eastRoom) => [
  "##############################",
  "#....#....#....#....#....#...#",
  "#....#....#....#....#....#...#",
  "#....#....#....#....#....#...#",
  "###+####+####+####+####+###" + eastRoom + "##",
  "S............................E",
  "###+####+####+####+####+######",
  "#....#....#....#....#....#####",
  "#....#....#....#....#....#####",
  "#....#....#....#....#....#####",
  "##############################",
];

const B = [
  "##########################",
  "##......##################",
  "##......##################",
  "##......##################",
  "#####+##############E#####",
  "S.......................X#",
  "############+#############",
  "#########.......##########",
  "#########.......##########",
  "##########################",
];

// ---------------------------------------------------------------- props
// a guest room, 4 x 3 tiles, starting at column a; north rooms face the corridor with their south wall,
// south rooms are the same room mirrored
function guestRoom(a, north, label, extra = {}) {
  const Y = (y) => (north ? y : 11 - y);
  const F = (f) => (north ? f : { n: "s", s: "n", e: "e", w: "w" }[f]);
  const box = (x0, x1, y0, y1) => ({ x0, x1, y0: Math.min(Y(y0), Y(y1)), y1: Math.max(Y(y0), Y(y1)) });
  const p = [
    { kind: "bed", ...box(a + 0.15, a + 1.55, 1.05, 2.4), h: 0.55, face: F("s"), collide: true },
    { kind: "partition", ...box(a + 2.45, a + 2.55, 1, 2.7), h: WALL_H, collide: true, sight: true },
    { kind: "partition", ...box(a + 2.55, a + 3.35, 2.6, 2.7), h: WALL_H, collide: true, sight: true },
    { kind: "tub", ...box(a + 2.6, a + 3.97, 1.03, 1.68), h: 0.55, collide: true },
    { kind: "curtain", id: `curtain${label}`, ...box(a + 2.6, a + 3.95, 1.72, 1.76), h: 2.1, sight: true },
    { kind: "sink", id: `tap${label}`, ...box(a + 2.6, a + 2.95, 2.25, 2.55), h: 0.85, collide: true, examine: "ex.sink" },
    { kind: "hook", id: `uniform${label}`, x: a + 3.96, y: Y(2.2), face: "w", h: 1.6, examine: "ex.hook" },
    { kind: "wardrobe", id: `wardrobe${label}`, ...box(a + 0.05, a + 0.7, 3.05, 3.95), h: 2.0, face: "e", collide: true, sight: true, hide: true },
    { kind: "desk", ...box(a + 3.3, a + 3.95, 3.15, 3.9), h: 0.75, collide: true },
    { kind: "box", ...box(a + 1.6, a + 2.05, 1.05, 1.45), h: 0.5, collide: true, color: 0x4a3020 },
    { kind: "phone", id: `phone${label}`, x: a + 1.83, y: Y(1.25), h: 0.5, label: `p.roomPhone|${label}` },
    { kind: "tv", x: a + 3.62, y: Y(3.5), h: 0.75, face: "w" },
    { kind: "painting", id: `painting${label}`, x: a + 0.85, y: Y(1.02), face: F("s"), h: 1.55, examine: "ex.painting" },
  ];
  const zone = { id: `r${label}`, name: `Bilik ${label}`, kind: "room", x0: a, x1: a + 4, y0: north ? 1 : 7, y1: north ? 4 : 10 };
  const bath = { id: `bath${label}`, name: `Bilik air ${label}`, kind: "bath", x0: a + 2.5, x1: a + 4, ...(north ? { y0: 1, y1: 2.65 } : { y0: 8.35, y1: 10 }) };
  return { props: p.map((q) => ({ ...q, ...(extra[q.kind] ?? {}) })), zones: [zone, bath] };
}

function guestFloor(prefix, { stor }) {
  const props = [], zones = [], doors = {};
  const north = [1, 6, 11, 16, 21], south = [1, 6, 11, 16, 21];
  north.forEach((a, i) => {
    const label = `${prefix}0${2 * i + 1}`;
    doors[`${a + 2},4`] = { label, locked: true };
    if (prefix === "3" && i === 2) return; // 305 is the maintenance room on the third floor
    const r = guestRoom(a, true, label);
    props.push(...r.props);
    zones.push(...r.zones);
  });
  south.forEach((a, i) => {
    const label = i === 4 ? `${prefix}10` : `${prefix}0${2 * i + 2}`;
    doors[`${a + 2},6`] = { label, locked: true };
    if (prefix === "2" && i === 2) return; // the laundry
    const r = guestRoom(a, false, label);
    props.push(...r.props);
    zones.push(...r.zones);
  });
  zones.push({ id: `koridor${prefix}`, name: `Koridor Tingkat ${prefix}`, kind: "corridor", x0: 1, x1: 29, y0: 5, y1: 6 });
  props.push(
    { kind: "sign", text: `sign.floor|${prefix}`, x: 1.02, y: 4.6, face: "e", h: 2.25, w: 0.9 },
    { kind: "sign", text: "sign.stairs", x: 0.98, y: 5.5, face: "e", h: 2.4, w: 0.8, exit: true },
    { kind: "sign", text: "sign.lift", x: 29.02, y: 5.5, face: "w", h: 2.45, w: 0.5 },
    { kind: "carpet", x0: 1, x1: 29, y0: 5, y1: 6 },
    { kind: "plant", x: 28.6, y: 5.25 },
  );
  if (stor) {
    doors["27,4"] = { label: stor.label, locked: false };
    zones.push({ id: stor.zone, name: stor.name, kind: "room", x0: 26, x1: 29, y0: 1, y1: 4 });
  }
  return { props, zones, doors };
}

// ---------------------------------------------------------------- the floors
function floorG() {
  const props = [
    // the security post
    { kind: "desk", x0: 1.1, x1: 4.4, y0: 1.05, y1: 1.7, h: 0.78, collide: true },
    { kind: "monitor", id: "cctv", x: 2.1, y: 1.35, h: 0.78, face: "s", label: "p.cctv" },
    { kind: "monitor", x: 3.3, y: 1.35, h: 0.78, face: "s", live: true },
    { kind: "phone", id: "phone_pos", x: 1.45, y: 1.5, h: 0.78, label: "p.phonePos" },
    { kind: "logbook", id: "logbook", x: 4.0, y: 1.45, h: 0.78, label: "p.logbook" },
    { kind: "chair", x: 2.7, y: 2.3 },
    { kind: "wardrobe", id: "locker_pos", x0: 6.3, x1: 6.95, y0: 3.9, y1: 4.95, h: 2.0, face: "w", collide: true, sight: true, hide: true, metal: true },
    { kind: "board", id: "board", x: 1.02, y: 3.0, face: "e", h: 1.5, text: "sign.memo", label: "p.memo" },
    { kind: "lamp", x: 4.3, y: 1.3, h: 0.78, table: true },
    // the lobby
    { kind: "counter", x0: 9.3, x1: 14.2, y0: 2.05, y1: 2.65, h: 1.1, collide: true },
    { kind: "phone", id: "phone_lobby", x: 11.4, y: 1.25, h: 1.0, label: "p.phoneLobby" },
    { kind: "cubby", x: 13.4, y: 1.03, face: "s", h: 1.5 },
    { kind: "register", id: "register", x: 12.1, y: 2.35, h: 1.1, label: "p.register" },
    { kind: "bell", id: "bell", x: 10.2, y: 2.35, h: 1.1, label: "p.bell" },
    { kind: "clock", id: "clock", x: 12.0, y: 1.02, face: "s", h: 2.2, label: "p.clock" },
    { kind: "sofa", id: "sofa", x0: 9.7, x1: 11.5, y0: 6.55, y1: 7.05, h: 0.8, face: "n", collide: true },
    { kind: "sofa", x0: 13.3, x1: 15.1, y0: 6.55, y1: 7.05, h: 0.8, face: "n", collide: true },
    { kind: "table", x0: 11.8, x1: 12.8, y0: 6.55, y1: 7.05, h: 0.45, collide: true },
    { kind: "pillar", x0: 9.35, x1: 9.65, y0: 4.35, y1: 4.65, h: WALL_H, collide: true, sight: true },
    { kind: "pillar", x0: 15.35, x1: 15.65, y0: 4.35, y1: 4.65, h: WALL_H, collide: true, sight: true },
    { kind: "plant", x: 8.45, y: 8.5 },
    { kind: "plant", x: 16.55, y: 8.5 },
    { kind: "plant", x: 16.55, y: 1.45 },
    { kind: "lamp", x: 16.5, y: 6.9, h: 0 },
    { kind: "rug", x0: 9.5, x1: 15.5, y0: 5.2, y1: 8.4 },
    { kind: "sign", text: "sign.post", x: 7.98, y: 1.45, face: "e", h: 2.35, w: 1.1 },
    { kind: "sign", text: "sign.liftStairs", x: 16.98, y: 2.4, face: "w", h: 2.35, w: 1.0 },
    { kind: "sign", text: "sign.store", x: 7.98, y: 6.5, face: "e", h: 2.35, w: 0.5 },
    { kind: "sign", text: "sign.exit", x: 12, y: 8.97, face: "n", h: 2.55, w: 0.7, exit: true },
    // the lift hall
    { kind: "punch", id: "punch_G", x: 21.0, y: 2.03, face: "s", h: 1.3, label: "p.punch" },
    { kind: "sign", text: "sign.stairs", x: 20.5, y: 4.97, face: "n", h: 2.45, w: 0.7, exit: true },
    { kind: "plant", x: 18.45, y: 4.5 },
    // the store
    { kind: "shelf", x0: 1.05, x1: 1.5, y0: 6.1, y1: 8.9, h: 2.0, collide: true, sight: true },
    { kind: "shelf", x0: 2.0, x1: 5.0, y0: 8.5, y1: 8.95, h: 2.0, collide: true, sight: true },
    { kind: "box", x0: 4.6, x1: 5.4, y0: 6.2, y1: 6.9, h: 0.6, collide: true, color: 0x5a4632 },
  ];
  const zones = [
    { id: "pos", name: "Pos keselamatan", kind: "room", x0: 1, x1: 7, y0: 1, y1: 5 },
    { id: "lobi", name: "Lobi", kind: "lobby", x0: 8, x1: 17, y0: 1, y1: 9 },
    { id: "dewanlif", name: "Lorong lif", kind: "corridor", x0: 18, x1: 24, y0: 2, y1: 5 },
    { id: "stor", name: "Stor", kind: "room", x0: 1, x1: 7, y0: 6, y1: 9 },
  ];
  const doors = { "7,2": { label: "POS", locked: false }, "17,3": { locked: false }, "7,7": { label: "STOR", locked: false } };
  return { id: "G", name: "Lobi", level: 0, map: G, props, zones, doors, floorMat: "marble", wallMat: "panel" };
}

function floor2() {
  const g = guestFloor("2", { stor: { label: "LINEN", zone: "linen", name: "Stor linen" } });
  g.doors["13,6"] = { label: "DOBI", locked: false };
  g.props.push(
    // the laundry
    ...[11.1, 12.05, 13.0, 13.95].map((x, i) => ({ kind: "washer", id: i === 1 ? "washer" : undefined, x0: x, x1: x + 0.9, y0: 9.35, y1: 9.97, h: 0.95, collide: true, label: i === 1 ? "p.washer" : undefined })),
    { kind: "cart", x0: 11.6, x1: 12.5, y0: 7.9, y1: 8.5, h: 1.15, collide: true, sight: true },
    { kind: "cart", x0: 13.9, x1: 14.8, y0: 8.4, y1: 9.0, h: 1.15, collide: true, sight: true },
    { kind: "wardrobe", id: "linen_dobi", x0: 14.3, x1: 14.95, y0: 7.05, y1: 7.6, h: 2.0, face: "w", collide: true, sight: true, hide: true },
    { kind: "punch", id: "punch_2", x: 20.5, y: 5.03, face: "s", h: 1.3, label: "p.punch" },
    { kind: "sign", text: "sign.laundry", x: 12.6, y: 5.97, face: "n", h: 2.4, w: 0.5 },
    { kind: "shelf", x0: 26.1, x1: 28.9, y0: 1.05, y1: 1.5, h: 2.0, collide: true, sight: true },
    { kind: "box", x0: 26.2, x1: 27.0, y0: 3.2, y1: 3.9, h: 0.7, collide: true, color: 0xd8d4c8 },
  );
  g.zones.push({ id: "dobi", name: "Dobi", kind: "room", x0: 11, x1: 15, y0: 7, y1: 10 });
  return { id: "2", name: "Tingkat 2", level: 1, map: GUEST("+"), ...g, floorMat: "carpet", wallMat: "paper" };
}

function floor3() {
  const g = guestFloor("3", {});
  g.doors["13,4"] = { label: "PENYELENGGARAAN", key: "maint", locked: true };
  g.doors["27,4"] = { label: "317", locked: false, secret: true };
  g.props.push(
    // the maintenance room (where 305 was)
    { kind: "keyboard", id: "keyboard", x: 12.5, y: 1.03, face: "s", h: 1.5, label: "p.keyboard" },
    { kind: "breaker", id: "breaker", x: 11.03, y: 2.4, face: "e", h: 1.4, label: "p.breaker" },
    { kind: "desk", x0: 13.3, x1: 14.95, y0: 1.05, y1: 1.7, h: 0.85, collide: true },
    { kind: "shelf", x0: 14.5, x1: 14.95, y0: 2.2, y1: 3.9, h: 2.0, collide: true, sight: true },
    { kind: "wardrobe", id: "locker_maint", x0: 11.05, x1: 11.7, y0: 3.2, y1: 3.95, h: 2.0, face: "e", collide: true, sight: true, hide: true, metal: true },
    { kind: "punch", id: "punch_3", x: 17.0, y: 5.03, face: "s", h: 1.3, label: "p.punch" },
    { kind: "plastic", x0: 6.4, x1: 6.5, y0: 5, y1: 6, h: WALL_H, sight: true },
    { kind: "plastic", x0: 22.4, x1: 22.5, y0: 5, y1: 6, h: WALL_H, sight: true },
    { kind: "ladder", x: 9.6, y: 5.55 },
    { kind: "box", x0: 15.2, x1: 15.8, y0: 5.55, y1: 5.95, h: 0.5, collide: true, color: 0x8a8070 },
    // room 317: burnt
    { kind: "bed", x0: 26.2, x1: 27.6, y0: 1.05, y1: 2.4, h: 0.5, burnt: true, collide: true },
    { kind: "wardrobe", x0: 28.3, x1: 28.95, y0: 1.05, y1: 1.9, h: 2.0, face: "w", collide: true, sight: true, burnt: true },
    { kind: "phone", id: "phone_317", x: 28.6, y: 3.4, h: 0.6, label: "p.roomPhone|317" },
    { kind: "box", x0: 28.3, x1: 28.95, y0: 3.15, y1: 3.75, h: 0.6, collide: true, color: 0x1a1210 },
    { kind: "sign", text: "sign.maint", x: 12.4, y: 5.02, face: "s", h: 2.45, w: 1.2 },
  );
  g.zones.push(
    { id: "maint", name: "Bilik penyelenggaraan", kind: "room", x0: 11, x1: 15, y0: 1, y1: 4 },
    { id: "r317", name: "Bilik 317", kind: "room", x0: 26, x1: 29, y0: 1, y1: 4 },
  );
  return { id: "3", name: "Tingkat 3", level: 2, map: GUEST("Q"), ...g, floorMat: "carpet", wallMat: "paper" };
}

function floorB() {
  const props = [
    { kind: "boiler", x0: 2.4, x1: 4.2, y0: 1.3, y1: 3.0, h: 2.3, collide: true, sight: true },
    { kind: "pipe", x0: 1, x1: 24, y: 5.15, h: 2.55 },
    { kind: "pipe", x0: 1, x1: 24, y: 5.85, h: 2.4 },
    { kind: "shelf", x0: 6.5, x1: 7.95, y0: 1.05, y1: 1.5, h: 2.0, collide: true, sight: true },
    { kind: "wardrobe", id: "locker_b", x0: 9.05, x1: 9.7, y0: 7.05, y1: 7.9, h: 2.0, face: "e", collide: true, sight: true, hide: true, metal: true },
    { kind: "shelf", x0: 10.5, x1: 15.9, y0: 8.5, y1: 8.95, h: 2.0, collide: true, sight: true },
    { kind: "box", x0: 13.2, x1: 14.2, y0: 7.2, y1: 7.9, h: 0.8, collide: true, color: 0x4a3a2a },
    { kind: "punch", id: "punch_B", x: 10.5, y: 5.03, face: "s", h: 1.3, label: "p.punch" },
    { kind: "sign", text: "sign.service", x: 23.97, y: 5.5, face: "w", h: 2.45, w: 1.0, exit: true },
    { kind: "sign", text: "sign.basement", x: 1.02, y: 4.6, face: "e", h: 2.25, w: 0.9 },
    { kind: "sign", text: "sign.boiler", x: 5.5, y: 5.02, face: "s", h: 2.45, w: 1.0 },
  ];
  const zones = [
    { id: "servis", name: "Laluan servis", kind: "service", x0: 1, x1: 24, y0: 5, y1: 6 },
    { id: "dandang", name: "Bilik dandang", kind: "room", x0: 2, x1: 8, y0: 1, y1: 4 },
    { id: "storb", name: "Stor servis", kind: "room", x0: 9, x1: 16, y0: 7, y1: 9 },
  ];
  const doors = { "5,4": { label: "DANDANG", locked: false }, "12,6": { label: "GUDANG", locked: false } };
  return { id: "B", name: "Aras Bawah", level: -1, map: B, props, zones, doors, floorMat: "concrete", wallMat: "concrete" };
}

export const FLOORS = [floorB(), floorG(), floor2(), floor3()];
export const FLOOR = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const FLOOR_ORDER = ["B", "G", "2", "3"];
export const FLOOR_NAME = { B: "floor.B", G: "floor.G", 2: "floor.2", 3: "floor.3" };

// where you step out of the stairs and the lift, and which way you face (yaw)
export const ARRIVE = {
  G: { stairs: [20.5, 4.3, 0], lift: [23.3, 3.5, Math.PI / 2] },
  2: { stairs: [1.6, 5.5, -Math.PI / 2], lift: [28.4, 5.5, Math.PI / 2] },
  3: { stairs: [1.6, 5.5, -Math.PI / 2], lift: [28.4, 5.5, Math.PI / 2] },
  B: { stairs: [1.6, 5.5, -Math.PI / 2], lift: [20.5, 5.7, Math.PI] },
};

export const START = { post: ["G", 3.6, 3.4, 0], sofa: ["G", 10.6, 6.0, 0] };

// fixed lights: the count never changes (it would recompile every material); stories dim and flicker them
export const LIGHTS = [
  { id: "pos", floor: "G", x: 3.0, y: 2.6, h: 2.6, color: 0xffe2b0, intensity: 10.2, dist: 12 },
  { id: "lobi1", floor: "G", x: 12.5, y: 3.6, h: 2.6, color: 0xffcf90, intensity: 11.5, dist: 14 },
  { id: "lobi2", floor: "G", x: 16.3, y: 6.9, h: 1.5, color: 0xffb070, intensity: 6.4, dist: 10 },
  { id: "dewanlif", floor: "G", x: 21, y: 3.5, h: 2.6, color: 0xdfe8ff, intensity: 7.0, dist: 11 },
  { id: "k2a", floor: "2", x: 6, y: 5.5, h: 2.6, color: 0xfff0d0, intensity: 6.4, dist: 11 },
  { id: "k2b", floor: "2", x: 16, y: 5.5, h: 2.6, color: 0xfff0d0, intensity: 6.4, dist: 11 },
  { id: "k2c", floor: "2", x: 25, y: 5.5, h: 2.6, color: 0xfff0d0, intensity: 4.5, dist: 10 },
  { id: "bath207", floor: "2", x: 19.2, y: 1.8, h: 2.5, color: 0xd8f0ff, intensity: 0.0, dist: 8 },
  { id: "k3", floor: "3", x: 14, y: 5.5, h: 2.6, color: 0xfff0d0, intensity: 3.8, dist: 11 },
  { id: "maint", floor: "3", x: 13, y: 2.5, h: 2.6, color: 0xe0ffe0, intensity: 5.8, dist: 10 },
  { id: "r317", floor: "3", x: 27.5, y: 2.5, h: 1.0, color: 0xff6a20, intensity: 0.0, dist: 9 },
  { id: "b1", floor: "B", x: 6, y: 5.5, h: 2.5, color: 0xffd8a0, intensity: 5.1, dist: 11 },
  { id: "b2", floor: "B", x: 18, y: 5.5, h: 2.5, color: 0xffd8a0, intensity: 5.1, dist: 11 },
  { id: "dandang", floor: "B", x: 4.5, y: 3.4, h: 2.0, color: 0xff7a40, intensity: 3.8, dist: 9 },
];

// the security cameras, for the monitor in the post
export const CAMERAS = [
  { id: "lobi", label: "cam.lobi", floor: "G", at: [16.7, 8.7, 2.6], look: [11, 2.5, 0.8] },
  { id: "lif", label: "cam.lif", floor: "G", at: [18.3, 2.3, 2.6], look: [24, 4, 0.6] },
  { id: "k2w", label: "cam.k2w", floor: "2", at: [1.3, 5.25, 2.6], look: [14, 5.5, 0.6] },
  { id: "k2e", label: "cam.k2e", floor: "2", at: [28.7, 5.75, 2.6], look: [14, 5.5, 0.6] },
  { id: "dobi", label: "cam.dobi", floor: "2", at: [11.3, 7.25, 2.6], look: [14.5, 9.6, 0.4] },
  { id: "k3", label: "cam.k3", floor: "3", at: [28.7, 5.25, 2.6], look: [8, 5.5, 0.6] },
  { id: "b", label: "cam.b", floor: "B", at: [1.3, 5.25, 2.5], look: [20, 5.5, 0.6] },
];
