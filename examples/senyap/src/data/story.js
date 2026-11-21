// The seven night shifts at Hotel Seri Malam. Each night has a day screen (a message, what you know so
// far, and tonight's goal), a setup that sets tasks and wires scripted events to the engine through `ctx`,
// and lines for the report you write at the end. Every string here is a key into src/i18n.js.

export const NOTES = ["memo", "din1", "din2", "din3", "din4", "din5", "salmah"];

// what you know by the start of each night (the journal), as clue keys
export const KNOWN = {
  1: [],
  2: ["clue.1", "clue.2"],
  3: ["clue.1", "clue.2", "clue.3"],
  4: ["clue.1", "clue.2", "clue.3", "clue.4"],
  5: ["clue.1", "clue.2", "clue.3", "clue.4", "clue.5"],
  6: ["clue.1", "clue.2", "clue.3", "clue.4", "clue.5", "clue.6"],
  7: ["clue.1", "clue.2", "clue.3", "clue.4", "clue.5", "clue.6", "clue.7", "clue.8", "clue.9"],
};

// ---------------------------------------------------------------- shared pieces of a shift
function patrol(ctx, which) {
  for (const f of which) {
    ctx.task(`punch_${f}`, `t.punch|${ctx.t("t.punch." + f)}`);
    ctx.on(`punch:punch_${f}`, () => ctx.done(`punch_${f}`));
  }
}

// a report from a room: the post's phone rings, the caller describes the problem, the room is opened for
// you, and the object to check in it resolves the task and goes into the night's report
export function roomReport(ctx, o) {
  ctx.expect();
  ctx.after(
    o.delay ?? 0,
    () => {
      ctx.ring(o.phone ?? "phone_pos", () => {
        ctx.lines(o.lines);
        ctx.task(o.id, o.task);
        ctx.arrived();
        if (o.door) ctx.door(o.door).lock(false);
        o.onAnswer?.();
        ctx.on(`interact:${o.target}`, () => {
          if (ctx.isDone(o.id)) return false;
          o.resolve?.();
          ctx.done(o.id);
          ctx.report({ room: o.room, issue: o.issue, action: o.action });
          return true;
        });
      });
    },
    "report",
  );
}

function common(ctx) {
  ctx.on("interact:board", () => (ctx.note("memo"), true));
  ctx.on("interact:register", () => (ctx.read("reg.t", ctx.night < 6 ? "reg.1" : ctx.night === 6 ? "reg.6" : "reg.7"), true));
  ctx.on("interact:clock", () => (ctx.say(ctx.night === 7 ? "s.clock7" : "s.clock", 3), true));
  ctx.on("interact:bell", () => {
    ctx.sfx("bell", "bell");
    ctx.noise("bell", 18);
    return true;
  });
}

const call = (...keys) => keys.map(([who, k, style]) => [who, k, style ?? "phone"]);

// ---------------------------------------------------------------- the nights
export const NIGHTS = [
  {
    n: 1,
    title: "n1.title",
    day: { from: "name.rahman", text: "n1.day" },
    tonight: "n1.tonight",
    floors: ["B", "G", "2"],
    bayang: { active: false },
    setup(ctx) {
      common(ctx);
      ctx.task("memo", "t.memo");
      ctx.on("interact:board", () => ctx.done("memo"));
      patrol(ctx, ["G", "2", "B"]);
      ctx.after(2, () => ctx.hint("n1.hint1"));
      ctx.once("enter:lobi", () =>
        ctx.after(2.5, () => {
          ctx.sfx("bell", "bell");
          ctx.after(1.5, () => ctx.say("n1.nobody", 2.5));
        }),
      );
      ctx.once("enter:koridor2", () => ctx.after(4, () => ctx.sfx("drag", { floor: "2", x: 27, y: 5.5, h: 0.3 })));
      roomReport(ctx, {
        delay: 55,
        id: "r204",
        room: "n1.room",
        door: "204",
        target: "tap204",
        task: "n1.task",
        issue: "n1.issue",
        action: "n1.action",
        lines: call(["salmah", "n1.c1"], ["salmah", "n1.c2"], ["you", "n1.c3", "self"], ["", "cap.lineDead", "caption"]),
        resolve: () => {
          ctx.sfx("water", "tap204");
          ctx.say("n1.tap", 4);
        },
      });
      ctx.on("enter:r204", () => {
        if (!ctx.flags.tapOn) {
          ctx.flags.tapOn = true;
          ctx.sfx("water", "tap204");
        }
      });
    },
    report: ["n1.r1", "n1.r2"],
  },
  {
    n: 2,
    title: "n2.title",
    day: { from: "name.rahman", text: "n2.day" },
    tonight: "n2.tonight",
    floors: ["B", "G", "2"],
    bayang: { active: false },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2", "B"]);
      roomReport(ctx, {
        delay: 12,
        id: "r207",
        room: "n2.room",
        door: "207",
        target: "painting207",
        task: "n2.task",
        issue: "n2.issue",
        action: "n2.action",
        lines: call(["salmah", "n2.c1"], ["salmah", "n2.c2"], ["", "cap.lineDead", "caption"]),
        resolve: () => {
          ctx.say("n2.found", 2.5);
          ctx.after(0.6, () => ctx.note("din1"));
        },
      });
      ctx.on("enter:r207", () => {
        if (ctx.isDone("r207") || ctx.flags.knocked) return;
        ctx.flags.knocked = true;
        ctx.after(1.5, () => ctx.sfx("knock", "painting207"));
      });
      // the corridor goes quiet, and something stands in the doorway at the far end
      ctx.on("done:r207", () => {
        ctx.once("enter:koridor2", () => {
          ctx.hum(false);
          ctx.caption("cap.humStops");
          ctx.after(2.5, () => {
            ctx.bayang.glimpse({ floor: "2", at: [23.5, 4.55], look: [12, 5.5], exit: [23.5, 3.2], hold: 5 });
            ctx.after(7, () => ctx.hum(true));
          });
        });
      });
      ctx.on("stop", () => {
        if (ctx.player.floor !== "2" || (ctx.flags.stepT ?? 0) > ctx.time) return;
        ctx.flags.stepT = ctx.time + 25;
        ctx.after(0.45, () => ctx.sfx("step", ctx.behind(1.6)));
      });
    },
    report: ["n2.r1", "n2.r2"],
  },
  {
    n: 3,
    title: "n3.title",
    day: { from: "name.rahman", text: "n3.day", hint: "n3.hint" },
    tonight: "n3.tonight",
    floors: ["B", "G", "2"],
    bayang: { active: true, floors: ["2"], start: ["2", 23.5, 2.5], speed: 2.4, dormant: true },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2", "B"]);
      ctx.item({ id: "battery_dobi", kind: "battery", floor: "2", x: 14.55, y: 8.0, h: 0.1 });
      roomReport(ctx, {
        delay: 20,
        id: "rdobi",
        room: "n3.room",
        door: "DOBI",
        target: "washer",
        task: "n3.task",
        issue: "n3.issue",
        action: "n3.action",
        lines: call(["salmah", "n3.c1"], ["salmah", "n3.c2"], ["", "cap.lineDead", "caption"]),
        onAnswer: () => ctx.loop("washer", "washer"),
        resolve: () => {
          ctx.stopLoop("washer");
          ctx.say("n3.found", 3);
          ctx.after(0.6, () => ctx.note("din2"));
        },
      });
      // the first meeting: it comes out to investigate the noise where you can watch it
      ctx.once("enter:koridor2", () => {
        ctx.after(3, () => {
          ctx.sfx("thump", "washer");
          ctx.bayang.wake();
          ctx.bayang.investigate("2", 13.5, 8.6);
          ctx.after(2, () => ctx.hint("n3.watch"));
        });
      });
    },
    report: ["n3.r1", "n3.r2"],
  },
  {
    n: 4,
    title: "n4.title",
    day: { from: "name.rahman", text: "n4.day" },
    tonight: "n4.tonight",
    floors: ["B", "G", "2", "3"],
    bayang: { active: true, floors: ["2", "3"], start: ["3", 14, 5.5], speed: 2.7 },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["3"]);
      ctx.task("power", "n4.task");
      ctx.after(14, () => {
        ctx.power(false);
        ctx.say("n4.cut", 3);
        ctx.caption("cap.humStops");
        ctx.candles([["G", 12.9, 2.35, 1.1], ["G", 4.2, 1.6, 0.78], ["2", 2.5, 5.2, 0], ["2", 15.5, 5.85, 0], ["3", 4.0, 5.2, 0]]);
      });
      roomReport(ctx, {
        delay: 22,
        id: "r207",
        room: "n4.room",
        door: "207",
        target: "uniform207",
        task: "n4.rtask",
        issue: "n4.issue",
        action: "n4.action",
        lines: call(["salmah", "n4.c1"], ["salmah", "n4.c2"], ["", "cap.lineDead", "caption"]),
        onAnswer: () => ctx.flicker("bath207", true),
        resolve: () => {
          ctx.key("maint");
          ctx.hands("2", 19.25, 1.4);
          ctx.flicker("bath207", false);
          ctx.light("bath207", 0);
          ctx.say("n4.uniform", 4);
        },
      });
      ctx.on("enter:bath207", () => ctx.curtain("207", true));
      ctx.on("interact:breaker", () => {
        if (ctx.isDone("power")) return false;
        ctx.power(true);
        ctx.done("power");
        ctx.sfx("breaker", "breaker");
        ctx.noise("breaker", 25);
        ctx.report({ room: "n4.mroom", issue: "n4.missue", action: "n4.maction" });
        ctx.after(1, () => ctx.say("n4.lights", 3));
        ctx.item({ id: "note3", kind: "note", floor: "3", x: 14.1, y: 1.35, h: 0.85, note: "din3" });
        return true;
      });
    },
    report: ["n4.r1", "n4.r2"],
  },
  {
    n: 5,
    title: "n5.title",
    day: { from: "name.rahman", text: "n5.day" },
    tonight: "n5.tonight",
    floors: ["B", "G", "2", "3"],
    keys: ["maint"],
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["3", 20, 5.5], speed: 2.9 },
    setup(ctx) {
      common(ctx);
      ctx.task("cctv", "n5.cctv");
      patrol(ctx, ["3", "B"]);
      ctx.item({ id: "note4", kind: "note", floor: "3", x: 9.25, y: 5.3, h: 0.05, note: "din4" });
      ctx.item({ id: "battery5", kind: "battery", floor: "B", x: 14.6, y: 7.3, h: 0.8 });
      ctx.on("cctv:k3", () => {
        if (ctx.isDone("cctv")) return;
        ctx.done("cctv");
        ctx.bayang.staticFigure("3", 25, 5.5);
        ctx.after(1.2, () => ctx.say("n5.stare", 3.5));
        ctx.after(4, () => {
          ctx.task("lift", "n5.lift");
          ctx.liftArrive("G");
          ctx.caption("cap.liftLobby", { floor: "G", x: 24, y: 3.5 });
        });
      });
      ctx.on("cctv", () => {
        if (!ctx.isDone("cctv")) ctx.after(0.5, () => ctx.say("n5.switch", 3));
      });
      // the lift speaks: first from its speaker, then from inside the empty, lit cabin
      ctx.on("near:lift:G", () => {
        if (!ctx.has("lift") || ctx.isDone("lift")) return;
        ctx.done("lift");
        ctx.liftDoors("G", true);
        ctx.lines([["salmah", "n5.l1", "speaker"]], { floor: "G", x: 24.2, y: 3.5, h: 2.5 });
        ctx.after(3.5, () => {
          ctx.lines([["salmah", "n5.l2", "near"]], { floor: "G", x: 24.6, y: 3.5, h: 1.6 });
          ctx.report({ room: "n5.room", issue: "n5.issue", action: "n5.action" });
        });
        ctx.after(7, () => ctx.liftDoors("G", false));
      });
    },
    report: ["n5.r1", "n5.r2"],
  },
  {
    n: 6,
    title: "n6.title",
    day: { from: "n6.from", text: "n6.day" },
    tonight: "n6.tonight",
    floors: ["B", "G", "2", "3"],
    keys: ["maint"],
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["2", 4, 5.5], speed: 3.1, aggression: 0.6 },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2"]);
      roomReport(ctx, {
        delay: 25,
        id: "r317",
        room: "n6.room",
        target: "phone_317",
        task: "n6.task",
        issue: "n6.issue",
        action: "n6.action",
        lines: call(["salmah", "n6.c1"], ["salmah", "n6.c2"], ["salmah", "n6.c3"], ["you", "n6.c4", "self"]),
        onAnswer: () => {
          ctx.reveal("317");
          ctx.light("r317", 4.5);
          ctx.flicker("r317", true);
          ctx.eyes([["3", 26.6, 3.2], ["3", 28.4, 2.6]]);
          ctx.candles([["3", 27.0, 3.6, 0]]);
          ctx.item({ id: "note5", kind: "note", floor: "3", x: 26.8, y: 2.85, h: 0.02, note: "din5" });
          ctx.item({ id: "tag", kind: "note", floor: "3", x: 27.9, y: 3.7, h: 0.02, note: "salmah", label: "p.tag" });
        },
        resolve: () => {
          ctx.say("n6.phone", 3.5);
          ctx.after(2, () => {
            ctx.hum(false);
            ctx.bayang.place("3", 3, 5.5);
            ctx.bayang.hunt();
            ctx.caption("cap.stairsSlam", { floor: "3", x: 0.5, y: 5.5 });
            ctx.after(1.5, () => ctx.say("n6.run", 2));
          });
        },
      });
    },
    report: ["n6.r1", "n6.r2"],
    finale: true,
  },
  {
    n: 7,
    title: "n7.title",
    day: { from: "", text: "n7.day" },
    tonight: "n7.tonight",
    floors: ["B", "G", "2", "3"],
    start: "sofa",
    stopClock: "03:17",
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["G", 21, 3.5], speed: 2.9, dormant: true },
    setup(ctx) {
      common(ctx);
      ctx.door("POS").lock(true, "n7.posLocked");
      ctx.door("317").lock(true, "n7.317");
      const stage = ctx.flags.stage ?? 0;
      ctx.task("k207", "n7.k207");
      ctx.task("kmaint", "n7.kmaint");
      ctx.task("kexit", "n7.kexit");
      ctx.task("escape", "n7.escape");
      ctx.on("interact:mainDoor", () => (ctx.say("n7.mainDoor", 3.5), true));

      if (stage >= 2) {
        // back from the checkpoint at the maintenance door
        ctx.done("k207");
        ctx.done("kmaint");
        ctx.key("k207", true);
        ctx.key("maint", true);
        ctx.bayang.wake();
        ctx.bayang.place("G", 21, 3.5);
      } else {
        ctx.item({ id: "k207", kind: "key", floor: "G", x: 11.2, y: 2.3, h: 1.1, key: "k207" });
        ctx.on("pickup:k207", () => {
          ctx.done("k207");
          ctx.door("207").lock(true, "n7.207locked", "k207");
          // the bell rings by itself; it comes to see, where you can watch and back away
          ctx.after(1.2, () => {
            ctx.sfx("bell", "bell");
            ctx.bayang.wake();
            ctx.bayang.place("G", 22.5, 3.5);
            ctx.bayang.investigate("G", 11, 3.2, { listen: 4 });
          });
          ctx.after(3.5, () => ctx.ring("phone_lobby", () => ctx.lines(call(["salmah", "n5.l1"], ["you", "n7.hand", "self"])), { attract: false }));
          ctx.after(4, () => ctx.hint("n7.bellHint"));
        });
      }

      // the second floor: steps that keep your rhythm, and one more when you stop
      ctx.on("stop", () => {
        if (ctx.player.floor !== "2" || (ctx.flags.stepT ?? 0) > ctx.time) return;
        ctx.flags.stepT = ctx.time + 18;
        ctx.after(0.45, () => ctx.sfx("step", ctx.behind(1.6)));
      });
      ctx.once("enter:koridor2", () => {
        if (stage >= 1) return;
        ctx.after(2, () => ctx.bayang.glimpse({ floor: "2", at: [23.5, 4.55], look: [12, 5.5], exit: [23.5, 3.2], hold: 4, then: "patrol" }));
      });
      ctx.item({ id: "battery7", kind: "battery", floor: "2", x: 14.55, y: 8.0, h: 0.1 });

      // room 207: the bathroom light dies, the curtain moves toward the tub
      ctx.on("enter:r207", () => {
        if (ctx.flags.bathOff) return;
        ctx.flags.bathOff = true;
        ctx.light("bath207", 5);
        ctx.after(1.2, () => {
          ctx.light("bath207", 0);
          ctx.caption("cap.bathOff");
        });
      });
      ctx.on("enter:bath207", () => ctx.curtain("207", true));
      ctx.on("interact:uniform207", () => {
        if (ctx.isDone("kmaint")) return false;
        ctx.done("kmaint");
        ctx.key("maint");
        ctx.hands("2", 19.25, 1.4);
        ctx.flags.stage = 1;
        ctx.after(2, () => ctx.ring("phone207", () => ctx.lines([["voice", "n7.found", "whisper"]], "phone207"), { autoAnswer: 2.2 }));
        ctx.after(5, () => {
          ctx.say("n7.map", 4);
          ctx.bayang.hunt();
        });
        return true;
      });
      ctx.on("door:PENYELENGGARAAN", () => {
        if (ctx.flags.stage >= 2) return;
        ctx.flags.stage = 2;
        ctx.checkpoint();
        ctx.say("s.checkpoint", 2);
      });
      ctx.on("interact:keyboard", () => {
        if (ctx.isDone("kexit")) return false;
        ctx.done("kexit");
        ctx.key("exit");
        ctx.sfx("keys", "keyboard");
        // the lift calls itself to this floor and speaks
        ctx.after(3, () => {
          ctx.liftArrive("3");
          ctx.lines([["salmah", "n5.l1", "speaker"]], { floor: "3", x: 29.2, y: 5.5, h: 2.5 });
          ctx.after(3, () => ctx.lines([["salmah", "n5.l2", "near"]], { floor: "3", x: 29.6, y: 5.5, h: 1.6 }));
        });
        return true;
      });
      ctx.on("interact:exitDoor", () => {
        if (!ctx.hasKey("exit")) return ctx.say("n7.needExit", 3), true;
        ctx.done("escape");
        ctx.win();
        return true;
      });
    },
  },
];

// the cards before night 1, and the ending after night 7: [headline key, small print key]
export const PROLOGUE = [["pro.1", "pro.1s", "ad"], ["pro.2", "pro.2s"], ["pro.3", "pro.3s", "quote"], ["pro.4", "pro.4s", "quote"]];
export const EPILOGUE = [["ep.1", "ep.1s"], ["ep.2", "ep.2s", "sms"], ["ep.3", "ep.3s", "ad"], ["ep.4", "ep.4s"], ["ep.5", "ep.5s", "sms"]];
