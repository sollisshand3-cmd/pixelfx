// Every sound is synthesized with WebAudio. Sounds in the world are placed with an HRTF panner and
// muffled by a low-pass filter when a wall, a closed door or a floor is in the way. Each part of the hotel
// has its own bed: rain on the lobby glass, the hum of corridor lights, drips, the boiler.

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.9;
    this.loops = new Map();
    // offline mode (for recording the trailer): time is the game's, not the clock's
    this.offline = false;
    this.offset = 0;
    this.queue = [];
  }

  start() {
    if (this.ctx) {
      if (!this.offline) this.ctx.resume();
      return;
    }
    this.init(new (window.AudioContext || window.webkitAudioContext)());
  }

  /** Render `seconds` of sound offline instead of playing it: the game steps time with advance(). */
  startOffline(seconds, rate = 44100) {
    this.offline = true;
    this.init(new OfflineAudioContext(2, Math.ceil(seconds * rate), rate));
  }
  advance(t) {
    this.offset = t;
    const due = this.queue.filter((q) => q.at <= t);
    this.queue = this.queue.filter((q) => q.at > t);
    for (const q of due) q.fn();
  }
  /** setTimeout, on the game's clock when offline. */
  later(fn, sec) {
    if (!this.offline) return setTimeout(fn, sec * 1000);
    const q = { at: this.offset + sec, fn };
    this.queue.push(q);
    return q;
  }
  cancel(h) {
    if (!this.offline) clearTimeout(h);
    else this.queue = this.queue.filter((q) => q !== h);
  }
  /** The finished offline render as a 16-bit stereo WAV, base64. */
  async renderWav() {
    const buf = await this.ctx.startRendering();
    const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF");
    out.setUint32(4, 36 + n * 4, true);
    w(8, "WAVEfmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    w(36, "data");
    out.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < 2; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
    const bytes = new Uint8Array(out.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  init(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.45;
    this.verbIn.connect(this.verb).connect(this.master);
    this.beds();
    this.bayangVoice();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.t, 0.05);
  }
  /** Pull everything down to k of the volume (0 is dead silence), over about tc seconds. */
  duck(k, tc = 0.03) {
    if (!this.master) return;
    this.master.gain.cancelScheduledValues(this.t);
    this.master.gain.setTargetAtTime(this.volume * k, this.t, tc);
  }
  suspend() {
    if (!this.offline) this.ctx?.suspend();
  }
  get t() {
    return this.offline ? this.offset : this.ctx.currentTime;
  }

  out(node, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.verbIn);
    }
  }
  noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }
  filter(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + a + dec);
  }

  /** A destination in the world: panner, then a muffle filter. muffle 0 = clear, 1 = through a wall. */
  at(pos, muffle = 0, wet = 0.3) {
    const ctx = this.ctx, pn = ctx.createPanner();
    Object.assign(pn, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1.5, rolloffFactor: 1.2, maxDistance: 80 });
    if (pn.positionX) {
      pn.positionX.value = pos.x;
      pn.positionY.value = pos.y;
      pn.positionZ.value = pos.z;
    } else pn.setPosition(pos.x, pos.y, pos.z);
    const lp = this.filter("lowpass", 18000 - muffle * 17300, 0.7), g = ctx.createGain();
    g.gain.value = 1 - muffle * 0.55;
    pn.connect(lp).connect(g);
    this.out(g, wet + muffle * 0.2);
    return pn;
  }

  listen(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = camera.position, f = camera.getWorldDirection(this._f ?? (this._f = p.clone())), t = this.t + 0.03;
    if (L.positionX) {
      L.positionX.linearRampToValueAtTime(p.x, t);
      L.positionY.linearRampToValueAtTime(p.y, t);
      L.positionZ.linearRampToValueAtTime(p.z, t);
      L.forwardX.linearRampToValueAtTime(f.x, t);
      L.forwardY.linearRampToValueAtTime(f.y, t);
      L.forwardZ.linearRampToValueAtTime(f.z, t);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- room beds
  beds() {
    const ctx = this.ctx, mk = (node, wet) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      node.connect(g);
      this.out(g, wet);
      return g;
    };
    // a low drone that rises with fear
    const lp = this.filter("lowpass", 140);
    for (const f of [41.2, 41.6, 61.8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    this.drone = mk(lp, 0.3);
    // rain on glass: hiss plus scattered drops
    const rn = this.noise(true), rb = this.filter("highpass", 1800), rl = this.filter("lowpass", 7000);
    rn.connect(rb).connect(rl);
    rn.start();
    this.rain = mk(rl, 0.4);
    // corridor light hum: mains and its harmonics through a buzz
    const hum = ctx.createGain();
    for (const [f, k] of [[50, 0.5], [100, 0.35], [150, 0.18], [250, 0.08]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = k;
      o.connect(g).connect(hum);
      o.start();
    }
    const hb = this.noise(true), hbf = this.filter("bandpass", 3200, 4), hbg = ctx.createGain();
    hbg.gain.value = 0.05;
    hb.connect(hbf).connect(hbg).connect(hum);
    hb.start();
    this.hum = mk(hum, 0.1);
    // the boiler and pipes
    const mn = this.noise(true), mf = this.filter("lowpass", 90, 3), mo = ctx.createOscillator(), mog = ctx.createGain();
    mo.type = "triangle";
    mo.frequency.value = 33;
    mog.gain.value = 0.4;
    mo.connect(mog);
    mn.connect(mf);
    const mix = ctx.createGain();
    mf.connect(mix);
    mog.connect(mix);
    mn.start();
    mo.start();
    this.machine = mk(mix, 0.2);
    // a thin tone for dread
    const tone = ctx.createOscillator();
    tone.frequency.value = 3100;
    tone.start();
    this.fearTone = mk(tone, 0.3);
    this.dripT = 0;
    this.rainDropT = 0;
  }

  /** Per frame: target levels for each bed, 0..1. */
  ambience({ rain = 0, hum = 0, drip = 0, machine = 0, fear = 0 }, dt) {
    if (!this.ctx) return;
    const t = this.t, k = 0.4;
    this.rain.gain.setTargetAtTime(rain * 0.05, t, k);
    this.hum.gain.setTargetAtTime(hum * 0.02, t, 0.08);
    this.machine.gain.setTargetAtTime(machine * 0.18, t, k);
    this.drone.gain.setTargetAtTime(0.06 + fear * 0.12, t, 0.6);
    this.fearTone.gain.setTargetAtTime(fear > 0.5 ? (fear - 0.5) * 0.025 : 0, t, 0.5);
    this.dripT -= dt;
    if (drip > 0 && this.dripT <= 0) {
      this.dripT = 0.7 + Math.random() * 2.2;
      this.drop(drip * 0.25);
    }
    this.rainDropT -= dt;
    if (rain > 0.3 && this.rainDropT <= 0) {
      this.rainDropT = 0.05 + Math.random() * 0.15;
      this.drop(rain * 0.04, 2500 + Math.random() * 2000);
    }
  }

  drop(vol, f = 1400 + Math.random() * 900) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    this.env(g, t, 0.003, vol, 0.12);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(p);
    this.out(p, 0.6);
    o.start(t);
    o.stop(t + 0.2);
  }

  // ---------------------------------------------------------------- the thing: cloth dragged, breathing
  bayangVoice() {
    const ctx = this.ctx;
    this.bPan = ctx.createPanner();
    Object.assign(this.bPan, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1.5, rolloffFactor: 1.4, maxDistance: 60 });
    this.bMuffle = this.filter("lowpass", 18000, 0.7);
    this.bPan.connect(this.bMuffle);
    this.out(this.bMuffle, 0.35);
    // the drag: a long brushed hiss whose band and level sway with each pull
    const n = this.noise(true), bp = this.filter("bandpass", 900, 0.9), am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.8;
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(am.gain);
    const sweep = ctx.createGain();
    sweep.gain.value = 500;
    lfo.connect(sweep).connect(bp.frequency);
    lfo.start();
    this.drag = ctx.createGain();
    this.drag.gain.value = 0;
    n.connect(bp).connect(am).connect(this.drag).connect(this.bPan);
    n.start();
    this.dragLfo = lfo;
    // breathing underneath
    const b = this.noise(true), bb = this.filter("bandpass", 600, 5), bam = ctx.createGain(), bl = ctx.createOscillator(), blg = ctx.createGain();
    bl.frequency.value = 0.35;
    blg.gain.value = 0.5;
    bam.gain.value = 0.5;
    bl.connect(blg).connect(bam.gain);
    bl.start();
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    b.connect(bb).connect(bam).connect(this.breath).connect(this.bPan);
    b.start();
  }

  bayang(pos, { moving = 0, present = true, muffle = 0, hunting = false }) {
    if (!this.ctx) return;
    const t = this.t + 0.03, p = this.bPan;
    if (p.positionX) {
      p.positionX.linearRampToValueAtTime(pos.x, t);
      p.positionY.linearRampToValueAtTime(pos.y, t);
      p.positionZ.linearRampToValueAtTime(pos.z, t);
    } else p.setPosition(pos.x, pos.y, pos.z);
    this.bMuffle.frequency.setTargetAtTime(18000 - muffle * 17500, this.t, 0.1);
    this.drag.gain.setTargetAtTime(present ? moving * (hunting ? 1.1 : 0.75) * (1 - muffle * 0.5) : 0, this.t, 0.15);
    this.breath.gain.setTargetAtTime(present ? (hunting ? 0.5 : 0.25) * (1 - muffle * 0.6) : 0, this.t, 0.3);
    this.dragLfo.frequency.setTargetAtTime(hunting ? 1.6 : 0.8, this.t, 0.3);
  }

  // ---------------------------------------------------------------- one-shots (dest: a node from at(), or none)
  play(name, dest, o = {}) {
    if (!this.ctx) return;
    const fn = this["s_" + name];
    if (fn) fn.call(this, dest ?? null, o);
  }
  to(dest, node, wet = 0.2) {
    if (dest) node.connect(dest);
    else this.out(node, wet);
  }

  s_bell(dest) {
    const t = this.t, g = this.ctx.createGain();
    g.gain.value = 1;
    for (const [f, k, d] of [[2093, 0.25, 2.2], [2637, 0.12, 1.6], [4186, 0.06, 0.9], [5274, 0.04, 0.6]]) {
      const o = this.ctx.createOscillator(), og = this.ctx.createGain();
      o.frequency.value = f;
      this.env(og, t, 0.002, k, d);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + d + 0.1);
    }
    this.to(dest, g, 0.6);
  }
  s_knock(dest, { n = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      const t = this.t + i * 0.42 + Math.random() * 0.05, s = this.noise(), lp = this.filter("lowpass", 380, 2), g = this.ctx.createGain();
      this.env(g, t, 0.002, 1.2, 0.16);
      s.connect(lp).connect(g);
      const o = this.ctx.createOscillator(), og = this.ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
      this.env(og, t, 0.002, 0.8, 0.12);
      o.connect(og);
      this.to(dest, g, 0.4);
      this.to(dest, og, 0.4);
      s.start(t, Math.random(), 0.2);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
  s_step(dest, { run = false, vol = 1 } = {}) {
    const s = this.noise(), bp = this.filter("bandpass", 240 + Math.random() * 140, 1.3), g = this.ctx.createGain(), t = this.t;
    this.env(g, t, 0.004, (run ? 0.6 : 0.3) * vol, 0.12);
    s.connect(bp).connect(g);
    this.to(dest, g, 0.25);
    s.start(t, Math.random() * 1.5, 0.16);
  }
  s_slam(dest) {
    const s = this.noise(), lp = this.filter("lowpass", 600), g = this.ctx.createGain(), t = this.t;
    this.env(g, t, 0.003, 1.4, 0.5);
    s.connect(lp).connect(g);
    this.to(dest, g, 0.7);
    s.start(t, 0, 0.6);
  }
  s_thump(dest) {
    for (let i = 0; i < 3; i++) {
      const t = this.t + i * 0.55, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
      this.env(g, t, 0.005, 1.0, 0.3);
      o.connect(g);
      this.to(dest, g, 0.5);
      o.start(t);
      o.stop(t + 0.4);
    }
  }
  s_creak(dest, { vol = 0.18 } = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), bp = this.filter("bandpass", 900, 8), t = this.t, f = 90 + Math.random() * 70;
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const am = this.ctx.createOscillator(), ag = this.ctx.createGain();
    am.frequency.value = 24 + Math.random() * 20;
    ag.gain.value = vol * 0.6;
    am.connect(ag).connect(g.gain);
    o.connect(bp).connect(g);
    this.to(dest, g, 0.5);
    o.start(t);
    am.start(t);
    o.stop(t + 0.75);
    am.stop(t + 0.75);
  }
  s_door(dest) {
    this.s_creak(dest, { vol: 0.22 });
    const s = this.noise(), lp = this.filter("lowpass", 1200), g = this.ctx.createGain(), t = this.t;
    this.env(g, t, 0.002, 0.25, 0.08);
    s.connect(lp).connect(g);
    this.to(dest, g, 0.3);
    s.start(t, 0, 0.1);
  }
  s_locked(dest) {
    for (let i = 0; i < 3; i++) {
      const t = this.t + i * 0.09, s = this.noise(), bp = this.filter("bandpass", 1800, 3), g = this.ctx.createGain();
      this.env(g, t, 0.001, 0.35, 0.05);
      s.connect(bp).connect(g);
      this.to(dest, g, 0.2);
      s.start(t, Math.random(), 0.07);
    }
  }
  s_click() {
    const s = this.noise(), hp = this.filter("highpass", 2500), g = this.ctx.createGain(), t = this.t;
    this.env(g, t, 0.001, 0.4, 0.03);
    s.connect(hp).connect(g);
    this.out(g, 0.05);
    s.start(t, 0, 0.04);
  }
  s_beep(dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t;
    o.type = "square";
    o.frequency.value = 1900;
    g.gain.setValueAtTime(0.08, t);
    g.gain.setValueAtTime(0, t + 0.09);
    g.gain.setValueAtTime(0.08, t + 0.14);
    g.gain.setValueAtTime(0, t + 0.23);
    o.connect(g);
    this.to(dest, g, 0.2);
    o.start(t);
    o.stop(t + 0.3);
  }
  s_chime(dest, { pitch = 1 } = {}) {
    const t = this.t;
    for (const [f, k] of [[523, 1], [784, 0.6], [1046, 0.4]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = f * pitch;
      this.env(g, t, 0.01, 0.1 * k, 1.6);
      o.connect(g);
      this.out(g, 0.8);
      o.start(t);
      o.stop(t + 1.7);
    }
  }
  s_liftding(dest) {
    const t = this.t;
    for (const [f, dt] of [[1318, 0], [1046, 0.35]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = f;
      this.env(g, t + dt, 0.004, 0.35, 1.4);
      o.connect(g);
      this.to(dest, g, 0.6);
      o.start(t + dt);
      o.stop(t + dt + 1.5);
    }
  }
  s_liftdoor(dest) {
    const s = this.noise(), bp = this.filter("bandpass", 300, 2), g = this.ctx.createGain(), t = this.t;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + 1.1);
    s.connect(bp).connect(g);
    this.to(dest, g, 0.3);
    s.start(t, 0, 1.2);
  }
  s_lift(dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.filter("lowpass", 200), t = this.t;
    o.type = "sawtooth";
    o.frequency.value = 55;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.5);
    g.gain.linearRampToValueAtTime(0.25, t + 2.4);
    g.gain.linearRampToValueAtTime(0, t + 3);
    o.connect(lp).connect(g);
    this.out(g, 0.2);
    o.start(t);
    o.stop(t + 3.1);
  }
  s_stairs() {
    for (let i = 0; i < 9; i++) {
      const t = this.t + i * 0.3, s = this.noise(), bp = this.filter("bandpass", 320, 1.5), g = this.ctx.createGain();
      this.env(g, t, 0.003, 0.3, 0.1);
      s.connect(bp).connect(g);
      this.out(g, 0.5);
      s.start(t, Math.random(), 0.12);
    }
  }
  s_water(dest) {
    const s = this.noise(), bp = this.filter("bandpass", 1300, 0.8), g = this.ctx.createGain(), t = this.t;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.2);
    g.gain.linearRampToValueAtTime(0.3, t + 2.4);
    g.gain.linearRampToValueAtTime(0, t + 3);
    s.connect(bp).connect(g);
    this.to(dest, g, 0.4);
    s.start(t, 0, 3);
  }
  s_breaker(dest) {
    this.s_slam(dest);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t + 0.2;
    o.frequency.value = 100;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    o.connect(g);
    this.to(dest, g, 0.3);
    o.start(t);
    o.stop(t + 2.1);
  }
  s_keys(dest) {
    for (let i = 0; i < 7; i++) {
      const t = this.t + Math.random() * 0.4, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = 3000 + Math.random() * 3000;
      this.env(g, t, 0.001, 0.06, 0.15);
      o.connect(g);
      this.to(dest, g, 0.3);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
  s_drag(dest) {
    const s = this.noise(), bp = this.filter("bandpass", 900, 0.9), g = this.ctx.createGain(), t = this.t;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 4; i++) {
      g.gain.linearRampToValueAtTime(0.5, t + i * 0.7 + 0.3);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.7 + 0.65);
    }
    g.gain.linearRampToValueAtTime(0, t + 3);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(1200, t + 3);
    s.connect(bp).connect(g);
    this.to(dest, g, 0.5);
    s.start(t, 0, 3.1);
  }
  s_hands(dest) {
    this.s_drag(dest);
    this.s_whisper(dest, { vol: 0.4 });
  }
  s_whisper(dest, { vol = 0.25 } = {}) {
    const s = this.noise(), bp = this.filter("bandpass", 1800, 9), g = this.ctx.createGain(), t = this.t;
    for (let i = 1; i < 8; i++) bp.frequency.linearRampToValueAtTime(900 + Math.random() * 2400, t + i * 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + 1.0);
    s.connect(bp).connect(g);
    this.to(dest, g, 0.7);
    s.start(t, Math.random(), 1.1);
  }
  s_heart(dest, { k = 1 } = {}) {
    for (const [dt, m] of [[0, 1], [0.16, 0.7]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t + dt;
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      this.env(g, t, 0.012, 0.55 * k * m, 0.18);
      o.connect(g);
      this.out(g, 0.05);
      o.start(t);
      o.stop(t + 0.25);
    }
  }
  s_screech(dest, { vol = 0.25 } = {}) {
    const t = this.t, g = this.ctx.createGain(), ws = this.ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 6);
    ws.curve = curve;
    this.env(g, t, 0.05, vol, 0.85);
    for (const f of [620, 655, 1310]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.9);
      o.connect(ws);
      o.start(t);
      o.stop(t + 1);
    }
    ws.connect(g);
    this.to(dest, g, 0.6);
  }
  s_scream() {
    const t = this.t, g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.linearRampToValueAtTime(0.7, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    const ws = this.ctx.createWaveShaper(), curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) curve[i] = Math.tanh((i / 256 - 1) * 12);
    ws.curve = curve;
    ws.connect(g);
    for (const f of [180, 247, 333, 466, 931]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 0.6, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 2.3);
      o.connect(ws);
      o.start(t);
      o.stop(t + 2.5);
    }
    const n = this.noise(), ng = this.ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(ng).connect(ws);
    n.start(t, 0, 2.4);
    this.out(g, 0.5);
  }
  // a heart monitor's flat tone, thin and far away
  s_flatline() {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t;
    o.frequency.value = 988;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.setValueAtTime(0.07, t + 2.2);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    o.connect(g);
    this.out(g, 0.3);
    o.start(t);
    o.stop(t + 2.7);
  }
  // the ringing in your ears after something too loud
  s_tinnitus() {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t;
    o.frequency.value = 6200;
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.5);
    o.connect(g);
    this.out(g, 0);
    o.start(t);
    o.stop(t + 3.6);
  }
  // a deep hit, felt more than heard
  s_impact() {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t;
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g);
    this.out(g, 0.4);
    o.start(t);
    o.stop(t + 1);
    this.s_slam(null);
  }
  s_stinger() {
    const t = this.t, g = this.ctx.createGain();
    this.env(g, t, 0.02, 0.22, 2.4);
    for (const f of [110, 116.5, 164.8, 233]) {
      const o = this.ctx.createOscillator(), lp = this.filter("lowpass", 3000);
      o.type = "square";
      o.frequency.value = f;
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 2);
      o.connect(lp).connect(g);
      o.start(t);
      o.stop(t + 2.6);
    }
    this.out(g, 0.7);
  }

  /** A phone ringing at dest until stop() is called; each ring calls onRing. */
  ring(dest, onRing) {
    if (!this.ctx) return { stop() {} };
    const snd = this;
    let alive = true, timer;
    const once = () => {
      if (!alive) return;
      const t = this.t, g = this.ctx.createGain();
      g.gain.value = 0;
      for (let i = 0; i < 2; i++) {
        g.gain.setValueAtTime(0.22, t + i * 0.55);
        g.gain.setValueAtTime(0, t + i * 0.55 + 0.4);
      }
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), am = this.ctx.createOscillator(), amg = this.ctx.createGain();
      o1.frequency.value = 440;
      o2.frequency.value = 480;
      am.type = "square";
      am.frequency.value = 20;
      amg.gain.value = 0.5;
      am.connect(amg).connect(g.gain);
      o1.connect(g);
      o2.connect(g);
      this.to(typeof dest === "function" ? dest() : dest, g, 0.5);
      for (const o of [o1, o2, am]) {
        o.start(t);
        o.stop(t + 1.1);
      }
      onRing?.();
      timer = this.later(once, 3);
    };
    once();
    return {
      stop() {
        alive = false;
        snd.cancel(timer);
      },
    };
  }

  /** A sound that keeps going (a washing machine) until stopped. */
  loop(name, dest) {
    if (!this.ctx) return { stop() {} };
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    const nodes = [];
    if (name === "washer") {
      const n = this.noise(true), lp = this.filter("lowpass", 260, 2), am = this.ctx.createOscillator(), ag = this.ctx.createGain();
      am.frequency.value = 1.6;
      ag.gain.value = 0.4;
      am.connect(ag).connect(g.gain);
      n.connect(lp).connect(g);
      const o = this.ctx.createOscillator(), og = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 48;
      og.gain.value = 0.3;
      o.connect(og).connect(g);
      nodes.push(n, am, o);
    }
    this.to(dest, g, 0.3);
    for (const n of nodes) n.start();
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, this.t, 0.2);
        for (const n of nodes) n.stop(this.t + 1);
      },
    };
  }

  /**
   * A voice: syllables of filtered buzz shaped like speech, as long as the line. Styles: phone (thin and
   * far), speaker (a lift's tinny speaker), near (close, with a breath after), whisper, self (your own,
   * soft and dry).
   */
  voice(text, style, dest) {
    if (!this.ctx) return 0;
    const ctx = this.ctx, t0 = this.t + 0.05, syl = Math.max(3, Math.round(text.replace(/[^a-z]/gi, "").length / 2.6));
    const dur = syl * 0.16 + 0.3;
    const g = ctx.createGain();
    g.gain.value = 0;
    const src = style === "whisper" ? this.noise(true) : ctx.createOscillator();
    if (style !== "whisper") {
      src.type = "sawtooth";
      const f0 = style === "self" ? 120 : 215;
      src.frequency.setValueAtTime(f0, t0);
      for (let i = 0; i < syl; i++) src.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.35), t0 + i * 0.16 + 0.08);
      src.frequency.linearRampToValueAtTime(f0 * 0.75, t0 + dur);
    }
    const f1 = this.filter("bandpass", 700, 4), f2 = this.filter("bandpass", 1800, 5), mix = ctx.createGain();
    for (let i = 0; i < syl; i++) {
      f1.frequency.setValueAtTime(400 + Math.random() * 600, t0 + i * 0.16);
      f2.frequency.setValueAtTime(1200 + Math.random() * 1400, t0 + i * 0.16);
      g.gain.setValueAtTime(0.02, t0 + i * 0.16);
      g.gain.linearRampToValueAtTime(style === "whisper" ? 0.35 : 0.5, t0 + i * 0.16 + 0.04);
      g.gain.linearRampToValueAtTime(0.06, t0 + i * 0.16 + 0.14);
    }
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(f1).connect(mix);
    src.connect(f2).connect(mix);
    mix.connect(g);
    let last = g;
    if (style === "phone" || style === "speaker") {
      const hp = this.filter("highpass", style === "phone" ? 500 : 350), lp = this.filter("lowpass", style === "phone" ? 2600 : 3400);
      const ws = ctx.createWaveShaper(), c = new Float32Array(128);
      for (let i = 0; i < 128; i++) c[i] = Math.tanh((i / 64 - 1) * (style === "speaker" ? 3 : 1.6));
      ws.curve = c;
      g.connect(hp).connect(lp).connect(ws);
      last = ws;
      const hiss = this.noise(true), hg = ctx.createGain(), hb = this.filter("bandpass", 2000, 0.6);
      hg.gain.setValueAtTime(0.02, t0);
      hg.gain.setValueAtTime(0, t0 + dur);
      hiss.connect(hb).connect(hg);
      this.to(dest, hg, 0.2);
      hiss.start(t0);
      hiss.stop(t0 + dur + 0.1);
    }
    const out = ctx.createGain();
    out.gain.value = style === "self" ? 0.45 : 0.9;
    last.connect(out);
    this.to(style === "self" ? null : dest, out, style === "near" ? 0.15 : 0.35);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
    if (style === "near") {
      // a breath, close, after the line
      const b = this.noise(), bb = this.filter("bandpass", 900, 1.2), bg = ctx.createGain(), tb = t0 + dur + 0.25;
      bg.gain.setValueAtTime(0, tb);
      bg.gain.linearRampToValueAtTime(0.45, tb + 0.5);
      bg.gain.linearRampToValueAtTime(0, tb + 1.3);
      b.connect(bb).connect(bg);
      this.to(dest, bg, 0.1);
      b.start(tb, 0, 1.4);
    }
    return dur;
  }
}
