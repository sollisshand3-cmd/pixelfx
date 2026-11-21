// The seven night shifts at Hotel Seri Malam. Each night has a day screen (a message before the shift),
// a setup that sets tasks and wires scripted events to the engine through `ctx`, and lines for the report
// you write at the end. Text is in Malay.

export const HOTEL = "Hotel Seri Malam";

export const NOTES = {
  din1: {
    title: "Catatan Pak Din · Malam 2",
    text: "Ada orang ketuk dinding 207 dari dalam. Bilik tu kosong, katil pun tak berusik.\n\nSaya ketuk balik tiga kali. Dia berhenti.\n\nLepas tu dia ketuk dari belakang saya.",
  },
  din2: {
    title: "Catatan Pak Din · Malam 3",
    text: "Benda tu ikut bunyi. Kalau saya lari, dia datang. Kalau saya jalan perlahan, dia berhenti dan dengar.\n\nBila dia dekat, ada bunyi kain diseret. Cadar. Bau hangit.\n\nLampu suluh buat dia undur, tapi bateri cepat habis. Saya simpan bateri ganti dalam dobi.",
  },
  din3: {
    title: "Catatan Pak Din · Malam 4",
    text: "Elektrik putus tepat 3.17. Salmah telefon lagi.\n\nSalmah kerja kaunter malam masa kebakaran Ogos 1989. Dia jawab telefon dari 317 sampai talian putus. Tujuh orang tak sempat turun.\n\nDia masih jawab telefon. Dia masih ambil laporan.",
  },
  din4: {
    title: "Catatan Pak Din · Malam 5",
    text: "Tingkat 3 dibina semula lepas kebakaran. Nombor 317 dibuang dari semua pelan.\n\nTapi lif tetap berhenti di sini pukul 3.17.\n\nKalau dengar suara dari pembesar suara lif, jangan masuk. Kabin tu nampak kosong. Ia tak kosong.",
  },
  din5: {
    title: "Catatan Pak Din · Malam 6",
    text: "Setiap pengawal kerja tujuh malam. Nama kami semua ada dalam buku daftar, ditanda keluar.\n\nSaya dah faham. Hotel ni tak simpan tetamu. Ia simpan orang yang menjaganya.\n\nKalau awak baca ni: keluar ikut pintu servis di Aras Bawah. Kunci pintu keluar ada di papan kunci penyelenggaraan. Jangan tunggu pagi di lobi.\n\nDin",
  },
  salmah: {
    title: "Tanda nama",
    text: "SALMAH · PENYAMBUT TETAMU MALAM\n\nPlastiknya cair separuh. Di belakangnya ditulis dengan pen biru: 'Syif 11 malam - 7 pagi. Jangan letak telefon.'",
  },
  memo: {
    title: "Memo pengurus",
    text: "Kepada pengawal malam:\n\n1. Tekan semua jam rondaan setiap malam.\n2. Jawab telefon pos. Rekod setiap laporan dari bilik.\n3. Tulis laporan syif sebelum 6.00 pagi.\n4. Tingkat 3 DITUTUP untuk pengubahsuaian.\n\nEncik Rahman, Pengurus",
  },
};

const REGISTER = (night, name) =>
  night < 6
    ? "Buku daftar tetamu. Entri terakhir bertarikh 14 Ogos 1989.\n\nDi halaman belakang ada senarai bertajuk PENGAWAL MALAM. Enam nama, setiap satu ditanda keluar selepas tujuh malam. Nama terakhir: DIN."
    : night === 6
      ? "Buku daftar tetamu. Bilik di Tingkat 3: 301 hingga 310.\n\nTiada 317.\n\nTapi ada kesan dakwat basah di ruang antara 310 dan halaman seterusnya."
      : `Baris terakhir ditulis dengan dakwat baharu:\n\n${name.toUpperCase()} · BILIK 317 · DITANDA KELUAR · 03:17\n\nTulisan itu tulisan tangan kamu.`;

// ---------------------------------------------------------------- shared pieces of a shift
function patrol(ctx, which) {
  const names = { G: "Lobi (lorong lif)", 2: "Tingkat 2", 3: "Tingkat 3", B: "Aras Bawah" };
  for (const f of which) {
    ctx.task(`punch_${f}`, `Tekan jam rondaan: ${names[f]}`);
    ctx.on(`punch:punch_${f}`, () => ctx.done(`punch_${f}`));
  }
}

// a report from a room: the post's phone rings, the caller describes the problem, the room is opened for
// you, and the object to check in it resolves the task and goes into the night's report
export function roomReport(ctx, o) {
  ctx.expect();
  ctx.after(o.delay ?? 0, () => {
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
  }, "report");
}

function common(ctx) {
  ctx.on("interact:board", () => ctx.read(NOTES.memo.title, NOTES.memo.text));
  ctx.on("interact:register", () => ctx.read("Buku daftar", REGISTER(ctx.night, ctx.name)));
  ctx.on("interact:clock", () => ctx.say(ctx.night === 7 ? "Jam berhenti pada 3.17." : "Jam dinding. Lambat lima minit, seperti biasa.", 3));
  ctx.on("interact:bell", () => {
    ctx.sfx("bell", "bell");
    ctx.noise("bell", 18);
    return true;
  });
}

// ---------------------------------------------------------------- the nights
export const NIGHTS = [
  {
    n: 1,
    title: "Syif Pertama",
    day: {
      from: "Encik Rahman, Pengurus",
      text: "Selamat datang ke Hotel Seri Malam. Hotel ditutup untuk pengubahsuaian, jadi tiada tetamu.\n\nTugas awak mudah: tekan jam rondaan di Lobi, Tingkat 2 dan Aras Bawah. Jawab telefon pos kalau berbunyi. Tulis laporan sebelum 6 pagi.\n\nTangga lebih senyap daripada lif. Tingkat 3 ditutup.",
    },
    floors: ["B", "G", "2"],
    bayang: { active: false },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2", "B"]);
      ctx.once("enter:lobi", () =>
        ctx.after(2.5, () => {
          ctx.sfx("bell", "bell");
          ctx.after(1.5, () => ctx.say("Tiada sesiapa di kaunter.", 2.5));
        }),
      );
      ctx.once("enter:koridor2", () => ctx.after(4, () => ctx.sfx("drag", { floor: "2", x: 27, y: 5.5, h: 0.3 })));
      roomReport(ctx, {
        delay: 55,
        id: "r204",
        room: "Bilik 204",
        door: "204",
        target: "tap204",
        task: "Periksa bilik 204: paip berbunyi",
        issue: "Penghuni melaporkan paip air berbunyi sepanjang malam.",
        action: "Paip bilik air ditutup. Airnya berwarna karat.",
        lines: [
          ["Salmah", "Pos keselamatan? Ini bilik dua-kosong-empat.", "phone"],
          ["Salmah", "Paip di bilik air tak berhenti berbunyi. Saya tak boleh tidur.", "phone"],
          ["Kamu", "Bilik 204? Hotel ni tak ada tetamu, puan...", "self"],
          ["", "[talian diputuskan]", "caption"],
        ],
        resolve: () => {
          ctx.sfx("water", "tap204");
          ctx.say("Kamu menutup paip. Air yang keluar berwarna karat... dan suam.", 4);
        },
      });
      ctx.on("enter:r204", () => {
        if (!ctx.flags.tapOn) {
          ctx.flags.tapOn = true;
          ctx.sfx("water", "tap204");
        }
      });
    },
    report: ["Loceng kaunter berbunyi sekali. Tiada orang di kaunter.", "Bunyi seretan kain di hujung Tingkat 2. Tiada apa-apa ditemui."],
  },
  {
    n: 2,
    title: "Ketukan",
    day: {
      from: "Encik Rahman, Pengurus",
      text: "Saya baca laporan awak. Bilik 204? Tiada sesiapa menginap di situ sejak 1989. Mungkin paip lama.\n\nTelefon di pos itu talian dalaman. Kalau ada panggilan dari bilik, catat saja dan periksa.",
    },
    floors: ["B", "G", "2"],
    bayang: { active: false },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2", "B"]);
      roomReport(ctx, {
        delay: 12,
        id: "r207",
        room: "Bilik 207",
        door: "207",
        target: "painting207",
        task: "Periksa bilik 207: ketukan di dinding",
        issue: "Penghuni melaporkan ketukan dari dalam dinding, tiga kali setiap kali lampu dipadam.",
        action: "Di belakang lukisan ditemui kertas tulisan tangan.",
        lines: [
          ["Salmah", "Pos keselamatan... bilik dua-kosong-tujuh.", "phone"],
          ["Salmah", "Ada orang mengetuk dari dalam dinding. Tiga kali. Setiap kali saya padam lampu.", "phone"],
          ["", "[talian diputuskan]", "caption"],
        ],
        resolve: () => {
          ctx.say("Di belakang lukisan ada kertas terlipat.", 2.5);
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
          ctx.after(2.5, () => {
            ctx.bayang.glimpse({ floor: "2", at: [23.5, 4.55], look: [12, 5.5], exit: [23.5, 3.2], hold: 5 });
            ctx.after(7, () => ctx.hum(true));
          });
        });
      });
      ctx.on("stop", () => {
        if (ctx.player.floor !== "2" || ctx.flags.stepT > ctx.time) return;
        ctx.flags.stepT = ctx.time + 25;
        ctx.after(0.45, () => ctx.sfx("step", ctx.behind(1.6)));
      });
    },
    report: ["Ketukan di dinding 207 disahkan. Tiada orang di bilik sebelah.", "Sesuatu berdiri di pintu 209. Ia hilang apabila disuluh."],
  },
  {
    n: 3,
    title: "Langkah",
    day: {
      from: "Encik Rahman, Pengurus",
      text: "Pak Din? Dia pengawal sebelum awak. Dia berhenti tanpa notis selepas seminggu. Kalau jumpa barang dia, simpan saja.\n\nAda laporan bunyi dari dobi di Tingkat 2.",
      hint: "Bayang mengikut bunyi. Berjalan perlahan, putuskan pandangannya di pintu dan selekoh, atau suluh mukanya untuk melambatkannya. Bersembunyi dalam almari dengan E.",
    },
    floors: ["B", "G", "2"],
    bayang: { active: true, floors: ["2"], start: ["2", 23.5, 2.5], speed: 2.4, dormant: true },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2", "B"]);
      ctx.item({ id: "battery_dobi", kind: "battery", floor: "2", x: 14.55, y: 8.9, h: 0.1 });
      roomReport(ctx, {
        delay: 20,
        id: "rdobi",
        room: "Dobi, Tingkat 2",
        door: "DOBI",
        target: "washer",
        task: "Periksa dobi: mesin basuh berjalan sendiri",
        issue: "Mesin basuh di dobi dilaporkan berpusing sendiri.",
        action: "Mesin dimatikan. Di dalam dram ada cadar hangus dan sehelai kertas.",
        lines: [
          ["Salmah", "Pos keselamatan. Mesin di dobi berpusing sendiri.", "phone"],
          ["Salmah", "Bunyinya macam ada sesuatu di dalam.", "phone"],
          ["", "[talian diputuskan]", "caption"],
        ],
        onAnswer: () => ctx.loop("washer", "washer"),
        resolve: () => {
          ctx.stopLoop("washer");
          ctx.say("Di dalam dram ada cadar hangus, dan sehelai kertas.", 3);
          ctx.after(0.6, () => ctx.note("din2"));
        },
      });
      // the first meeting: it comes out to investigate the noise where you can watch it
      ctx.once("enter:koridor2", () => {
        ctx.after(3, () => {
          ctx.sfx("thump", "washer");
          ctx.bayang.wake();
          ctx.bayang.investigate("2", 13.5, 8.6);
          ctx.after(2, () => ctx.hint("Ia mengikut bunyi. Jangan lari. Berjalan perlahan dan perhatikan."));
        });
      });
    },
    report: ["Sesuatu yang tinggi meronda Tingkat 2. Ia berhenti untuk mendengar.", "Bateri ganti ditemui di dobi, seperti yang ditulis Pak Din."],
  },
  {
    n: 4,
    title: "Gelap",
    day: {
      from: "Encik Rahman, Pengurus",
      text: "TNB beri amaran gangguan bekalan malam ni. Kalau elektrik putus, suis utama ada di bilik penyelenggaraan, Tingkat 3. Tingkat 3 dibuka untuk awak malam ni sahaja.\n\nKunci bilik penyelenggaraan... Pak Din yang pegang. Saya tak tahu dia simpan di mana.",
    },
    floors: ["B", "G", "2", "3"],
    bayang: { active: true, floors: ["2", "3"], start: ["3", 14, 5.5], speed: 2.7 },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["3"]);
      ctx.task("power", "Hidupkan semula suis utama (Tingkat 3)");
      ctx.after(14, () => {
        ctx.power(false);
        ctx.say("Elektrik terputus.", 3);
        ctx.caption("[dengung lampu berhenti]");
        ctx.candles([["G", 12.9, 2.35, 1.1], ["G", 4.2, 1.6, 0.78], ["2", 2.5, 5.2, 0], ["2", 15.5, 5.85, 0], ["3", 4.0, 5.2, 0]]);
      });
      roomReport(ctx, {
        delay: 22,
        id: "r207",
        room: "Bilik 207",
        door: "207",
        target: "uniform207",
        task: "Periksa bilik 207: lampu bilik air",
        issue: "Lampu bilik air berkelip walaupun elektrik terputus. Penghuni kata ada orang dalam tab mandi.",
        action: "Ditemui uniform pengawal dengan kunci penyelenggaraan di poket. Tanda nama: DIN.",
        lines: [
          ["Salmah", "Lampu bilik air saya berkelip-kelip.", "phone"],
          ["Salmah", "Ada orang dalam tab mandi. Dia tak bergerak.", "phone"],
          ["", "[talian diputuskan]", "caption"],
        ],
        onAnswer: () => ctx.flicker("bath207", true),
        resolve: () => {
          ctx.key("maint", "Kunci Penyelenggaraan", "Tingkat 3");
          ctx.hands("2", 19.25, 1.4);
          ctx.flicker("bath207", false);
          ctx.light("bath207", 0);
          ctx.say("Uniform pengawal. Tanda nama: DIN. Ada kunci dalam poketnya.", 4);
        },
      });
      ctx.on("enter:bath207", () => ctx.curtain("207", true));
      ctx.on("interact:breaker", () => {
        if (ctx.isDone("power")) return false;
        ctx.power(true);
        ctx.done("power");
        ctx.sfx("breaker", "breaker");
        ctx.noise("breaker", 25);
        ctx.report({ room: "Bilik penyelenggaraan", issue: "Bekalan elektrik terputus pada 3.17 pagi.", action: "Suis utama dihidupkan semula." });
        ctx.after(1, () => ctx.say("Lampu menyala semula. Ada sesuatu di atas meja kerja.", 3));
        ctx.item({ id: "note3", kind: "note", floor: "3", x: 14.1, y: 1.35, h: 0.85, note: "din3" });
        return true;
      });
    },
    report: ["Elektrik terputus tepat pada 3.17 pagi.", "Uniform Pak Din ditemui di bilik air 207. Pemiliknya tidak ditemui."],
  },
  {
    n: 5,
    title: "Lif",
    day: {
      from: "Encik Rahman, Pengurus",
      text: "CCTV merakam lif bergerak sendiri pukul 3.17 pagi. Lif tak sepatutnya bergerak tanpa kunci operator.\n\nSemak rakaman di pos, kemudian periksa lif. Jam rondaan baharu dipasang di Tingkat 3.",
    },
    floors: ["B", "G", "2", "3"],
    keys: ["maint"],
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["3", 20, 5.5], speed: 2.9 },
    setup(ctx) {
      common(ctx);
      ctx.task("cctv", "Semak rakaman CCTV di pos");
      patrol(ctx, ["3", "B"]);
      ctx.item({ id: "note4", kind: "note", floor: "3", x: 9.25, y: 5.3, h: 0.05, note: "din4" });
      ctx.item({ id: "battery5", kind: "battery", floor: "B", x: 14.6, y: 7.3, h: 0.8 });
      ctx.on("cctv:k3", () => {
        if (ctx.isDone("cctv")) return;
        ctx.done("cctv");
        ctx.bayang.staticFigure("3", 20, 5.5);
        ctx.after(1.2, () => ctx.say("Di hujung Tingkat 3, sesuatu memandang tepat ke kamera.", 3.5));
        ctx.after(4, () => {
          ctx.task("lift", "Periksa lif di Lobi");
          ctx.liftArrive("G");
          ctx.caption("[lif tiba di Lobi]", { floor: "G", x: 24, y: 3.5 });
        });
      });
      ctx.on("cctv", () => {
        if (!ctx.isDone("cctv")) ctx.after(0.5, () => ctx.say("Tukar kamera hingga ke Tingkat 3.", 3));
      });
      // the lift speaks: first from its speaker, then from inside the empty, lit cabin
      ctx.on("near:lift:G", () => {
        if (!ctx.has("lift") || ctx.isDone("lift")) return;
        ctx.done("lift");
        ctx.liftDoors("G", true);
        ctx.lines([["Salmah", "Kunci bilik awak dah diambil.", "speaker"]], { floor: "G", x: 24.2, y: 3.5, h: 2.5 });
        ctx.after(3.5, () => {
          ctx.lines([["Salmah", "Kunci bilik awak... dah diambil.", "near"]], { floor: "G", x: 24.6, y: 3.5, h: 1.6 });
          ctx.report({ room: "Lif", issue: "Lif bergerak sendiri dan berhenti di Lobi.", action: "Kabin diperiksa. Kosong. Suara wanita dari pembesar suara." });
        });
        ctx.after(7, () => ctx.liftDoors("G", false));
      });
    },
    report: ["Lif tiba di Lobi tanpa dipanggil.", "Rakaman CCTV Tingkat 3 menunjukkan satu sosok di hujung koridor."],
  },
  {
    n: 6,
    title: "317",
    day: {
      from: "Sistem",
      text: "[Tiada mesej daripada Encik Rahman. Nombornya tidak dapat dihubungi.]\n\nDi atas meja pos ada kotak kecil berlabel PAK DIN. Di dalamnya: lampu suluh lama dan tujuh kad rondaan yang kosong.",
    },
    floors: ["B", "G", "2", "3"],
    keys: ["maint"],
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["2", 4, 5.5], speed: 3.1, aggression: 0.6 },
    setup(ctx) {
      common(ctx);
      patrol(ctx, ["G", "2"]);
      roomReport(ctx, {
        delay: 25,
        id: "r317",
        room: "Bilik 317",
        target: "phone_317",
        task: "Periksa bilik 317 (Tingkat 3)",
        issue: "Panggilan dari bilik 317. Bilik itu tidak wujud dalam pelan hotel.",
        action: "Pintu 317 ditemui di hujung Tingkat 3. Bilik hangus. Catatan terakhir Pak Din dan tanda nama Salmah ditemui.",
        lines: [
          ["Salmah", "Pos keselamatan? Bilik tiga-satu-tujuh.", "phone"],
          ["Salmah", "Pukul tiga tujuh belas. Asap masuk bawah pintu.", "phone"],
          ["Salmah", "Tolong... jangan letak telefon.", "phone"],
          ["Kamu", "Tingkat 3 cuma ada 301 sampai 310.", "self"],
        ],
        onAnswer: () => {
          ctx.reveal("317");
          ctx.light("r317", 4.5);
          ctx.flicker("r317", true);
          ctx.eyes([["3", 26.6, 3.2], ["3", 28.4, 2.6]]);
          ctx.candles([["3", 27.0, 3.6, 0]]);
          ctx.item({ id: "note5", kind: "note", floor: "3", x: 26.9, y: 1.7, h: 0.5, note: "din5" });
          ctx.item({ id: "tag", kind: "note", floor: "3", x: 28.55, y: 3.35, h: 0.62, note: "salmah", label: "Tanda nama" });
        },
        resolve: () => {
          ctx.say("Telefon di 317 hangus. Gagangnya masih suam.", 3.5);
          ctx.after(2, () => {
            ctx.hum(false);
            ctx.bayang.place("3", 3, 5.5);
            ctx.bayang.hunt();
            ctx.caption("[pintu tangga terhempas]", { floor: "3", x: 0.5, y: 5.5 });
            ctx.after(1.5, () => ctx.say("LARI.", 2));
          });
        },
      });
    },
    report: ["Bilik 317 wujud. Pintu ditemui di hujung Tingkat 3.", "Catatan terakhir Pak Din ditemui di bilik 317."],
    finale: true,
  },
  {
    n: 7,
    title: "Hotel Malam",
    day: {
      from: "",
      text: "Kamu tidak ingat bila kamu tertidur.\n\nKamu tersedar di sofa lobi. Jam dinding berhenti pada 3.17 pagi. Pintu utama berkunci.\n\nKunci induk kamu sudah tiada.",
      hint: "Cari tiga kunci: 207, Penyelenggaraan, Pintu Keluar. Keluar ikut pintu servis di Aras Bawah. Lif lebih cepat, tetapi locengnya menarik Bayang.",
    },
    floors: ["B", "G", "2", "3"],
    start: "sofa",
    stopClock: "03:17",
    bayang: { active: true, floors: ["G", "2", "3", "B"], start: ["G", 21, 3.5], speed: 2.9, dormant: true },
    setup(ctx) {
      common(ctx);
      ctx.door("POS").lock(true, "Pintu pos berkunci. Tag nama kamu tiada pada papan.");
      ctx.door("317").lock(true, "Pintu 317 hangus dan tersekat.");
      const stage = ctx.flags.stage ?? 0;
      ctx.task("k207", "Ambil Kunci 207 di kaunter lobi");
      ctx.task("kmaint", "Cari kunci penyelenggaraan di bilik 207");
      ctx.task("kexit", "Ambil Kunci Pintu Keluar (bilik penyelenggaraan, Tingkat 3)");
      ctx.task("escape", "Keluar melalui pintu servis, Aras Bawah");
      ctx.on("interact:mainDoor", () => ctx.say("Pintu utama berkunci dari luar. Di luar, hujan turun tanpa bunyi.", 3.5));

      if (stage >= 2) {
        // back from the checkpoint at the maintenance door
        ctx.done("k207");
        ctx.done("kmaint");
        ctx.key("k207", null);
        ctx.key("maint", null);
        ctx.bayang.wake();
        ctx.bayang.place("G", 21, 3.5);
      } else {
        ctx.item({ id: "k207", kind: "key", floor: "G", x: 11.2, y: 2.3, h: 1.1, key: ["k207", "Kunci 207", "Tingkat 2"] });
        ctx.on("pickup:k207", () => {
          ctx.done("k207");
          ctx.door("207").lock(true, "Berkunci. Perlu Kunci 207.", "k207");
          // the bell rings by itself; it comes to see, where you can watch and back away
          ctx.after(1.2, () => {
            ctx.sfx("bell", "bell");
            ctx.bayang.wake();
            ctx.bayang.place("G", 22.5, 3.5);
            ctx.bayang.investigate("G", 11, 3.2, { listen: 4 });
          });
          ctx.after(3.5, () =>
            ctx.ring("phone_lobby", () => ctx.lines([["Salmah", "Kunci bilik awak dah diambil.", "phone"], ["Kamu", "Kunci itu ada di tangan aku...", "self"]]), { attract: false }),
          );
          ctx.after(4, () => ctx.hint("Ia menyiasat bunyi loceng. Berundur perlahan-lahan, atau sembunyi."));
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
      ctx.item({ id: "battery7", kind: "battery", floor: "2", x: 14.55, y: 8.9, h: 0.1 });

      // room 207: the bathroom light dies, the curtain moves toward the tub
      ctx.on("enter:r207", () => {
        if (ctx.flags.bathOff) return;
        ctx.flags.bathOff = true;
        ctx.light("bath207", 5);
        ctx.after(1.2, () => {
          ctx.light("bath207", 0);
          ctx.caption("[lampu bilik air terpadam]");
        });
      });
      ctx.on("enter:bath207", () => ctx.curtain("207", true));
      ctx.on("interact:uniform207", () => {
        if (ctx.isDone("kmaint")) return false;
        ctx.done("kmaint");
        ctx.key("maint", "Kunci Penyelenggaraan", "Tingkat 3");
        ctx.hands("2", 19.25, 1.4);
        ctx.flags.stage = 1;
        ctx.after(2, () =>
          ctx.ring("phone207", () => ctx.lines([["?", "Kami dah jumpa awak.", "whisper"]], "phone207"), { autoAnswer: 2.2 }),
        );
        ctx.after(5, () => {
          ctx.say("Pada pintu ada peta kecemasan: bilik penyelenggaraan di Tingkat 3.", 4);
          ctx.bayang.hunt();
        });
        return true;
      });
      ctx.on("door:PENYELENGGARAAN", () => {
        if (ctx.flags.stage >= 2) return;
        ctx.flags.stage = 2;
        ctx.checkpoint();
        ctx.say("Titik sambung disimpan.", 2);
      });
      ctx.on("interact:keyboard", () => {
        if (ctx.isDone("kexit")) return false;
        ctx.done("kexit");
        ctx.key("exit", "Kunci Pintu Keluar", "Pintu servis, Aras Bawah");
        ctx.sfx("keys", "keyboard");
        // the lift calls itself to this floor and speaks
        ctx.after(3, () => {
          ctx.liftArrive("3");
          ctx.lines([["Salmah", "Kunci bilik awak dah diambil.", "speaker"]], { floor: "3", x: 29.2, y: 5.5, h: 2.5 });
          ctx.after(3, () => ctx.lines([["Salmah", "Kunci bilik awak... dah diambil.", "near"]], { floor: "3", x: 29.6, y: 5.5, h: 1.6 }));
        });
        return true;
      });
      ctx.on("interact:exitDoor", () => {
        if (!ctx.hasKey("exit")) return ctx.say("Pintu servis berkunci. Perlu Kunci Pintu Keluar.", 3), true;
        ctx.done("escape");
        ctx.win();
        return true;
      });
    },
    ending: {
      title: "KAMU TERLEPAS",
      text: "Pintu servis terkunci semula di belakang kamu. Udara subuh sejuk dan berbau hujan.\n\nDari lobi, telefon berdering sekali lagi.\n\nBunyi deringan itu datang dari sebalik pintu servis.",
      teaser: "Dalam buku daftar, satu nombor muncul untuk kali pertama: 317.\n\nBab seterusnya: Bilik 317.",
    },
  },
];
