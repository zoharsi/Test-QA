'use strict';
/* =========================================================
   Sound — everything is synthesised with WebAudio,
   no audio files needed.
   ========================================================= */

const Sound = {
  ctx: null, ready: false,
  vol: { sfx: 0.8, music: 0.55 },

  init() {
    try {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.out = c.createDynamicsCompressor();
      this.out.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(this.out);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.buildLoops();
      this.ready = true;
      this.applyVolume();
      Radio.init(c, this.music);
    } catch (e) { console.warn('Audio disabled:', e); }
  },

  applyVolume() {
    if (!this.ready) return;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music;
  },

  loopNoise(type, freq, q) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
    return { s, f, g };
  },

  buildLoops() {
    const c = this.ctx;
    // engine: saw + sub square through a resonant low-pass
    const o1 = c.createOscillator(), o2 = c.createOscillator(), sub = c.createGain();
    const ef = c.createBiquadFilter(), eg = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; sub.gain.value = 0.4;
    ef.type = 'lowpass'; ef.Q.value = 3; ef.frequency.value = 600; eg.gain.value = 0;
    o1.connect(ef); o2.connect(sub); sub.connect(ef); ef.connect(eg); eg.connect(this.sfx);
    o1.frequency.value = 50; o2.frequency.value = 25; o1.start(); o2.start();
    this.engine = { o1, o2, ef, eg };

    // siren: triangle with slow wail LFO
    const so = c.createOscillator(), lfo = c.createOscillator(), lfoG = c.createGain(), sg = c.createGain();
    so.type = 'triangle'; so.frequency.value = 950;
    lfo.type = 'triangle'; lfo.frequency.value = 0.28; lfoG.gain.value = 380;
    lfo.connect(lfoG); lfoG.connect(so.frequency);
    sg.gain.value = 0; so.connect(sg); sg.connect(this.sfx); so.start(); lfo.start();
    this.siren = { so, sg };

    this.screech = this.loopNoise('bandpass', 2600, 4);

    // helicopter: low noise chopped by a square LFO
    const h = this.loopNoise('lowpass', 260, 1), chop = c.createGain(), hl = c.createOscillator(), hlg = c.createGain();
    h.f.disconnect(); h.f.connect(chop); chop.connect(h.g);
    chop.gain.value = 0.5; hl.type = 'square'; hl.frequency.value = 11; hlg.gain.value = 0.5;
    hl.connect(hlg); hlg.connect(chop.gain); hl.start();
    this.heli = h;

    this.amb = this.loopNoise('lowpass', 380, 0.7);
    this.amb.g.gain.value = 0.03;

    // horn: two detuned squares
    const h1 = c.createOscillator(), h2 = c.createOscillator(), hf = c.createBiquadFilter(), hg = c.createGain();
    h1.type = h2.type = 'square'; h1.frequency.value = 392; h2.frequency.value = 494;
    hf.type = 'lowpass'; hf.frequency.value = 1800; hg.gain.value = 0;
    h1.connect(hf); h2.connect(hf); hf.connect(hg); hg.connect(this.sfx); h1.start(); h2.start();
    this.hornG = hg;
  },

  to(param, v, tc = 0.08) { if (this.ready) param.setTargetAtTime(v, this.ctx.currentTime, tc); },

  updateEngine(active, rpm, throttle) {
    if (!this.ready) return;
    const e = this.engine, f = 42 + rpm * 115 + throttle * 12;
    this.to(e.o1.frequency, f, 0.04);
    this.to(e.o2.frequency, f * 0.5, 0.04);
    this.to(e.ef.frequency, 380 + rpm * 1500 + throttle * 700, 0.06);
    this.to(e.eg.gain, active ? 0.05 + throttle * 0.05 + rpm * 0.02 : 0, 0.12);
  },
  setSiren(v) { if (this.ready) this.to(this.siren.sg.gain, v, 0.15); },
  setScreech(v) { if (this.ready) this.to(this.screech.g.gain, v, 0.06); },
  setHeli(v) { if (this.ready) this.to(this.heli.g.gain, v, 0.2); },
  setHorn(on) { if (this.ready) this.to(this.hornG.gain, on ? 0.09 : 0, 0.02); },
  setAmbient(v) { if (this.ready) this.to(this.amb.g.gain, v, 0.5); },

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  burst(dur, type, freq, vol, when = 0, freqTo = 0) {
    if (!this.ready || vol <= 0.001) return;
    const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  crash(k) { k = clamp(k, 0.08, 1); this.burst(0.35 + k * 0.3, 'lowpass', 1600, 0.5 * k); this.tone(90, 0.25, 'sine', 0.4 * k, 0, 40); this.burst(0.15, 'highpass', 3000, 0.15 * k, 0.02); },
  explosion(v = 1) { this.burst(1.4, 'lowpass', 900, 0.9 * v, 0, 60); this.tone(70, 1.2, 'sine', 0.7 * v, 0, 25); this.burst(0.4, 'highpass', 1500, 0.3 * v); },
  gunshot(v = 0.5) { this.burst(0.22, 'bandpass', 1400, v); this.burst(0.5, 'lowpass', 500, v * 0.4, 0.01, 100); },
  punch() { this.tone(140, 0.12, 'sine', 0.35, 0, 50); this.burst(0.06, 'lowpass', 900, 0.3); },
  thud() { this.tone(110, 0.2, 'sine', 0.4, 0, 40); this.burst(0.12, 'lowpass', 700, 0.35); },
  pickup() { this.tone(988, 0.12, 'triangle', 0.18); this.tone(1319, 0.22, 'triangle', 0.18, 0.08); },
  click() { this.tone(1400, 0.04, 'square', 0.04); },
  hover() { this.tone(2200, 0.025, 'sine', 0.025); },
  door() { this.burst(0.08, 'lowpass', 1200, 0.25); this.tone(220, 0.08, 'square', 0.05, 0.03); },
  heat() { this.tone(660, 0.12, 'square', 0.05); this.tone(880, 0.12, 'square', 0.05, 0.12); },
  passed() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, i * 0.11)); this.tone(262, 1.2, 'sine', 0.15, 0.44); },
  failed() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.06, i * 0.18)); },
  wasted() { this.tone(200, 2.2, 'sawtooth', 0.08, 0, 60); this.burst(2, 'lowpass', 400, 0.3, 0, 80); },
};

/* =========================================================
   Radio — tiny step sequencer, three stations
   ========================================================= */
const Radio = {
  stations: [
    { name: 'AURELIO FM', genre: 'סינת׳וויב לנסיעות לילה', bpm: 104, bassOct: -24,
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', arp: true, pad: true },
    { name: 'LOW TIDE 88.2', genre: 'לו־פיי מהחוף', bpm: 80, bassOct: -12,
      chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.....x.', pad: true, keys: true },
    { name: 'PULSE 99', genre: 'האוס אחרי חצות', bpm: 122, bassOct: -24,
      chords: [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: '..x...x...x...x.', stab: 'x.....x...x.....' },
  ],
  idx: 0, level: 0, c: null,

  init(ctx, dest) {
    this.c = ctx;
    this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(dest);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.connect(this.g);
    this.bus = this.lp; this.step = 0; this.next = ctx.currentTime + 0.1;
    setInterval(() => this.tick(), 25);
  },
  get current() { return this.idx >= 0 ? this.stations[this.idx] : null; },
  tick() {
    if (!this.c) return;
    const now = this.c.currentTime, st = this.current;
    if (!st || this.level < 0.01) { this.next = now + 0.05; return; }
    if (this.next < now - 0.2) this.next = now + 0.05;
    const sp = 60 / st.bpm / 4;
    while (this.next < now + 0.15) {
      this.play(st, this.step, this.next, sp);
      this.next += sp; this.step = (this.step + 1) % 64;
    }
  },
  play(st, step, t, sp) {
    const s = step % 16, ch = st.chords[Math.floor(step / 16) % st.chords.length];
    if (st.kick[s] === 'x') this.kick(t);
    if (st.snare[s] === 'x') this.snare(t);
    if (st.hat[s] === 'x') this.hat(t);
    if (st.bass[s] === 'x') this.note(ch[0] + st.bassOct, t, sp * 1.6, 'sawtooth', 0.09, 420);
    if (st.arp) this.note(ch[s % ch.length] + 12 + (s >= 8 ? 12 : 0), t, sp * 0.9, 'square', 0.022, 2200);
    if (st.pad && s === 0) ch.forEach(n => this.note(n, t, sp * 16, 'sawtooth', 0.022, 900, true));
    if (st.keys && (s === 0 || s === 6 || s === 10)) ch.forEach(n => this.note(n + 12, t, sp * 3, 'sine', 0.03, 3000));
    if (st.stab && st.stab[s] === 'x') ch.forEach(n => this.note(n + 12, t, sp * 1.2, 'sawtooth', 0.028, 1800));
  },
  note(midi, t, dur, type, vol, cutoff, pad) {
    const c = this.c, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const a = pad ? dur * 0.3 : 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0.0001, t + (pad ? dur * 0.6 : dur * 0.5), dur * 0.25);
    o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.6);
  },
  kick(t) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.4);
  },
  noiseHit(t, type, freq, vol, dur) {
    const c = this.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = Sound.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  snare(t) { this.noiseHit(t, 'bandpass', 1800, 0.22, 0.16); },
  hat(t) { this.noiseHit(t, 'highpass', 7000, 0.05, 0.035); },

  setLevel(v, cutoff = 18000) {
    if (!this.c) return;
    this.level = v;
    this.g.gain.setTargetAtTime(v, this.c.currentTime, 0.3);
    this.lp.frequency.setTargetAtTime(cutoff, this.c.currentTime, 0.3);
  },
  nextStation() {
    this.idx++;
    if (this.idx >= this.stations.length) this.idx = -1;
    this.step = 0;
    if (this.c) this.next = this.c.currentTime + 0.05;
    return this.current;
  },
};
