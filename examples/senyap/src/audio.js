// Every sound is synthesized with WebAudio: a low drone and wind, a heartbeat that quickens as the thing
// gets close, footsteps, its breathing placed in 3D, a screech when the light burns it, and the scream.

export class Sound {
  constructor() {
    this.ctx = null;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // a long noise buffer, reused by every noisy sound
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // a cheap reverb: a decaying noise impulse
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.master);

    this.drone();
    this.breathing();
  }

  get t() {
    return this.ctx.currentTime;
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
    if (!loop) s.loopStart = 0;
    return s;
  }

  drone() {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 150;
    for (const f of [41.2, 41.7, 61.9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 70;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    lp.connect(g);
    this.out(g, 0.3);
    this.droneGain = g;

    // wind through the walls
    const w = this.noise(true), bp = ctx.createBiquadFilter(), wg = ctx.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 2.5;
    wg.gain.value = 0.05;
    const wl = ctx.createOscillator(), wlg = ctx.createGain();
    wl.frequency.value = 0.11;
    wlg.gain.value = 260;
    wl.connect(wlg).connect(bp.frequency);
    wl.start();
    w.connect(bp).connect(wg);
    this.out(wg, 0.5);
    w.start();

    // a high, thin tone that rises with fear
    const tone = ctx.createOscillator(), tg = ctx.createGain();
    tone.type = "sine";
    tone.frequency.value = 3100;
    tg.gain.value = 0;
    tone.connect(tg);
    this.out(tg, 0.3);
    tone.start();
    this.fearTone = tg;
  }

  // the thing's breathing and muttering, panned to where it stands
  breathing() {
    const ctx = this.ctx;
    this.panner = ctx.createPanner();
    Object.assign(this.panner, { panningModel: "HRTF", distanceModel: "exponential", refDistance: 2, rolloffFactor: 1.6, maxDistance: 60 });
    const n = this.noise(true), bp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 6;
    g.gain.value = 0;
    // slow ragged breaths
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.42;
    lg.gain.value = 0.5;
    am.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    lfo.start();
    const formant = ctx.createOscillator(), fg = ctx.createGain();
    formant.frequency.value = 0.9;
    fg.gain.value = 300;
    formant.connect(fg).connect(bp.frequency);
    formant.start();
    n.connect(bp).connect(am).connect(g).connect(this.panner);
    // a low growl underneath
    const growl = ctx.createOscillator(), gg = ctx.createGain(), glp = ctx.createBiquadFilter();
    growl.type = "sawtooth";
    growl.frequency.value = 52;
    glp.type = "lowpass";
    glp.frequency.value = 220;
    gg.gain.value = 0.25;
    growl.connect(glp).connect(gg).connect(am);
    growl.start();
    this.out(this.panner, 0.35);
    n.start();
    this.breath = g;
  }

  /** Per frame: the listener follows the camera, the breathing follows the thing, the drone follows fear. */
  update(camera, enemyPos, fear, hunting, alive = true) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = camera.position, f = camera.getWorldDirection(camera.userData.tmp ?? (camera.userData.tmp = camera.position.clone()));
    const t = this.t + 0.03;
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
    const pn = this.panner;
    if (pn.positionX) {
      pn.positionX.linearRampToValueAtTime(enemyPos.x, t);
      pn.positionY.linearRampToValueAtTime(enemyPos.y, t);
      pn.positionZ.linearRampToValueAtTime(enemyPos.z, t);
    } else pn.setPosition(enemyPos.x, enemyPos.y, enemyPos.z);
    this.breath.gain.setTargetAtTime(alive ? (hunting ? 0.9 : 0.5) : 0, this.t, 0.3);
    this.fearTone.gain.setTargetAtTime(fear > 0.45 ? (fear - 0.45) * 0.03 : 0, this.t, 0.4);
    this.droneGain.gain.setTargetAtTime(0.14 + fear * 0.14, this.t, 0.5);
  }

  heartbeat(strength) {
    if (!this.ctx) return;
    for (const [dt, k] of [[0, 1], [0.16, 0.7]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.t + dt;
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.55 * strength * k, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      this.out(g, 0.05);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  step(run) {
    if (!this.ctx) return;
    const s = this.noise(), bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), t = this.t;
    bp.type = "bandpass";
    bp.frequency.value = 260 + Math.random() * 160;
    bp.Q.value = 1.4;
    g.gain.setValueAtTime(run ? 0.55 : 0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(bp).connect(g);
    this.out(g, 0.25);
    s.start(t, Math.random() * 1.5, 0.15);
    // a floorboard creak now and then
    if (Math.random() < 0.12) this.creak(0.12);
  }

  creak(vol = 0.15) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter(), t = this.t;
    o.type = "sawtooth";
    const f = 90 + Math.random() * 80;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 0.5);
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    // the creak judders
    const am = this.ctx.createOscillator(), ag = this.ctx.createGain();
    am.frequency.value = 22 + Math.random() * 20;
    ag.gain.value = vol * 0.6;
    am.connect(ag).connect(g.gain);
    o.connect(bp).connect(g);
    this.out(g, 0.6);
    o.start(t);
    am.start(t);
    o.stop(t + 0.65);
    am.stop(t + 0.65);
  }

  click() {
    if (!this.ctx) return;
    const s = this.noise(), hp = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), t = this.t;
    hp.type = "highpass";
    hp.frequency.value = 2500;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    s.connect(hp).connect(g);
    this.out(g, 0.05);
    s.start(t, 0, 0.04);
  }

  chime(pitch = 1) {
    if (!this.ctx) return;
    const t = this.t;
    for (const [f, k] of [[523, 1], [784, 0.6], [1046, 0.4], [1568, 0.2]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = f * pitch;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12 * k, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      o.connect(g);
      this.out(g, 0.8);
      o.start(t);
      o.stop(t + 1.9);
    }
  }

  whisper(vol = 0.2, pan = 0) {
    if (!this.ctx) return;
    const s = this.noise(), bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), p = this.ctx.createStereoPanner(), t = this.t;
    bp.type = "bandpass";
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(1800, t);
    for (let i = 1; i < 8; i++) bp.frequency.linearRampToValueAtTime(900 + Math.random() * 2400, t + i * 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + 1.0);
    p.pan.value = pan;
    s.connect(bp).connect(g).connect(p);
    this.out(p, 0.7);
    s.start(t, Math.random(), 1.1);
  }

  screech(vol = 0.3) {
    if (!this.ctx) return;
    const t = this.t, g = this.ctx.createGain(), ws = this.ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    ws.curve = curve;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
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
    this.out(g, 0.6);
  }

  scream() {
    if (!this.ctx) return;
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
      const vib = this.ctx.createOscillator(), vg = this.ctx.createGain();
      vib.frequency.value = 13;
      vg.gain.value = f * 0.06;
      vib.connect(vg).connect(o.frequency);
      vib.start(t);
      vib.stop(t + 2.5);
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

  stinger() {
    if (!this.ctx) return;
    const t = this.t, g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    for (const f of [110, 116.5, 164.8, 233]) {
      const o = this.ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 2);
      o.connect(lp).connect(g);
      o.start(t);
      o.stop(t + 2.6);
    }
    this.out(g, 0.7);
  }

  stopAll() {
    if (this.ctx) this.ctx.suspend();
  }
}
