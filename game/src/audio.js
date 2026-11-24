// audio.js — procedural WebAudio. No audio files: every sound is
// synthesised (oscillators + filtered noise). Created lazily on the first
// user gesture so browsers allow it. All methods are safe to call before
// the context exists (they no-op).
class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.engineOsc = null;
    this.engineGain = null; this.musicTimer = null; this.musicOn = false;
    this.radioTrack = 0; this.radioNames = [
      'Radio Mango 98.6 — Guava Sunrise',
      'Radio Mango 98.6 — Sunset Drive',
      'Wave 104.2 — Neon Coast',
      'Wave 104.2 — Midnight Palm',
    ];
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, freq) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shoot() { this.noise(0.12, 0.35, 2600); this.tone(180, 0.09, 'square', 0.12, 60); }
  hit() { this.tone(140, 0.12, 'sawtooth', 0.18, 70); }
  pickup() { this.tone(660, 0.12, 'sine', 0.2); this.tone(990, 0.16, 'sine', 0.2); }
  cash() { this.tone(880, 0.1, 'triangle', 0.22); setTimeout(() => this.tone(1320, 0.18, 'triangle', 0.22), 90); }
  sirenBlip() { this.tone(950, 0.22, 'sine', 0.07, 1400); }
  busted() { this.tone(220, 0.5, 'sawtooth', 0.25, 110); }
  jump() { this.tone(300, 0.14, 'sine', 0.12, 520); }
  click() { this.tone(1200, 0.05, 'square', 0.1); }
  mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.22), i * 110)); }
  fail() { [400, 300, 200].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sawtooth', 0.16), i * 130)); }
  nitro() { this.noise(0.5, 0.2, 3200); }
  crash() { this.noise(0.3, 0.4, 500); this.tone(90, 0.3, 'sawtooth', 0.25, 40); }
  startEngine() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  setEngine(rpm, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.now();
    this.engineOsc.frequency.setTargetAtTime(48 + rpm * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + rpm * 0.05 : 0.0, t, 0.1);
  }
  // A tiny looping "radio" — a chill chord pad that changes every 32s.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [247, 294, 370]];
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const ch = chords[step % chords.length]; step++;
      ch.forEach((f) => {
        const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = this.ctx.createGain();
        const t = this.now();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 1.2);
        g.gain.setValueAtTime(0.045, t + 6);
        g.gain.linearRampToValueAtTime(0.0, t + 8);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 8.2);
      });
      this.radioTrack = (this.radioTrack + 1) % this.radioNames.length;
      this.musicTimer = setTimeout(play, 8000);
    };
    play();
  }
  radioName() { return this.radioNames[this.radioTrack]; }
  stop() {
    if (this.musicTimer) clearTimeout(this.musicTimer);
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null; this.musicOn = false;
  }
}
export const audio = new AudioSys();
