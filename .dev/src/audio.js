/* ============================================================
   余烬之刃 — 程序化音频引擎（WebAudio，无外部素材）
   ============================================================ */
(function () {
  const G = window.G;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.master = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.volume = 0.7;
      this.muted = false;
      this.musicMode = 'none';
      this._noise = null;
      this._timer = null;
      this._nextStep = 0;
      this._step = 0;
      this._intensity = 0;
      this._musicLevel = 0;
    }

    init() {
      if (this.ready) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (e) { return false; }
      this.ready = true;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);

      /* 2 秒白噪声缓冲 */
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noise = buf;

      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._startScheduler();
      return true;
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }

    toggleMute() { this.setMuted(!this.muted); return this.muted; }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    /* ---------- 基础合成原语 ---------- */
    _env(node, t, peak, attack, hold, release) {
      const g = node.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
      g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    }

    tone(opts) {
      if (!this.ready) return;
      const ctx = this.ctx, t = (opts.time != null ? opts.time : ctx.currentTime) + (opts.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dest = opts.dest || this.sfxGain;
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freq || 440, t);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t + (opts.slideTime || opts.dur || 0.2));
      if (opts.detune) osc.detune.value = opts.detune;
      this._env(gain, t, opts.gain || 0.2, opts.attack != null ? opts.attack : 0.005,
        opts.hold != null ? opts.hold : 0.02, opts.release != null ? opts.release : 0.12);
      let node = osc;
      if (opts.filter) {
        const f = ctx.createBiquadFilter();
        f.type = opts.filter;
        f.frequency.value = opts.filterFreq || 1200;
        if (opts.Q) f.Q.value = opts.Q;
        node.connect(f); node = f;
      }
      node.connect(gain); gain.connect(dest);
      osc.start(t);
      osc.stop(t + (opts.attack || 0) + (opts.hold || 0) + (opts.release || 0.12) + 0.05);
    }

    noise(opts) {
      if (!this.ready) return;
      const ctx = this.ctx, t = (opts.time != null ? opts.time : ctx.currentTime) + (opts.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const gain = ctx.createGain();
      let node = src;
      if (opts.filter) {
        const f = ctx.createBiquadFilter();
        f.type = opts.filter;
        f.frequency.setValueAtTime(opts.freq || 1000, t);
        if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), t + (opts.dur || 0.2));
        if (opts.Q) f.Q.value = opts.Q;
        src.connect(f); node = f;
      }
      this._env(gain, t, opts.gain || 0.2, opts.attack != null ? opts.attack : 0.004,
        opts.hold != null ? opts.hold : 0.01, opts.release != null ? opts.release : (opts.dur || 0.2));
      node.connect(gain); gain.connect(opts.dest || this.sfxGain);
      src.start(t);
      src.stop(t + (opts.attack || 0) + (opts.hold || 0) + (opts.release || 0.2) + 0.05);
    }

    /* ---------- 音效 ---------- */
    sfx(name, opt) {
      opt = opt || {};
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'swing':
          this.noise({ filter: 'bandpass', freq: 900, sweepTo: 3200, Q: 1.1, gain: 0.14, dur: 0.13, release: 0.1 });
          break;
        case 'swingHeavy':
          this.noise({ filter: 'bandpass', freq: 300, sweepTo: 1400, Q: 0.9, gain: 0.2, dur: 0.26, release: 0.2 });
          this.tone({ type: 'sine', freq: 120, slideTo: 55, gain: 0.14, dur: 0.18 });
          break;
        case 'hit':
          this.noise({ filter: 'lowpass', freq: 2600, sweepTo: 500, gain: 0.26, dur: 0.06, release: 0.07 });
          this.tone({ type: 'square', freq: 150, slideTo: 65, gain: 0.12, dur: 0.07, release: 0.05, filter: 'lowpass', filterFreq: 1200 });
          break;
        case 'hitHeavy':
          this.noise({ filter: 'lowpass', freq: 1500, sweepTo: 200, gain: 0.36, dur: 0.14, release: 0.16 });
          this.tone({ type: 'sine', freq: 95, slideTo: 36, gain: 0.32, dur: 0.22, release: 0.18 });
          break;
        case 'hurt':
          this.tone({ type: 'sawtooth', freq: 190, slideTo: 70, gain: 0.2, dur: 0.2, release: 0.18, filter: 'lowpass', filterFreq: 900 });
          this.noise({ filter: 'lowpass', freq: 900, gain: 0.2, dur: 0.16, release: 0.14 });
          break;
        case 'dodge':
          this.noise({ filter: 'bandpass', freq: 420, sweepTo: 1600, Q: 0.8, gain: 0.13, dur: 0.2, release: 0.16 });
          break;
        case 'cast':
          this.tone({ type: 'triangle', freq: 520, slideTo: 1300, gain: 0.16, dur: 0.18, release: 0.16 });
          this.tone({ type: 'sine', freq: 1040, slideTo: 2300, gain: 0.08, dur: 0.14, release: 0.12, delay: 0.02 });
          break;
        case 'waveHit':
          this.tone({ type: 'triangle', freq: 720, slideTo: 180, gain: 0.14, dur: 0.14, release: 0.12 });
          this.noise({ filter: 'bandpass', freq: 2000, sweepTo: 400, gain: 0.1, dur: 0.12, release: 0.1 });
          break;
        case 'ult':
          this.tone({ type: 'sine', freq: 70, slideTo: 28, gain: 0.5, dur: 0.9, release: 0.8 });
          this.noise({ filter: 'lowpass', freq: 1200, sweepTo: 80, gain: 0.4, dur: 0.8, release: 0.7 });
          this.tone({ type: 'sawtooth', freq: 110, slideTo: 440, gain: 0.12, dur: 0.5, release: 0.4, filter: 'lowpass', filterFreq: 1600 });
          this.noise({ filter: 'highpass', freq: 3000, gain: 0.1, dur: 0.5, release: 0.6, delay: 0.12 });
          break;
        case 'shockwave':
          this.tone({ type: 'sine', freq: 55, slideTo: 26, gain: 0.42, dur: 0.5, release: 0.5 });
          this.noise({ filter: 'lowpass', freq: 500, sweepTo: 60, gain: 0.3, dur: 0.5, release: 0.4 });
          break;
        case 'roar':
          this.tone({ type: 'sawtooth', freq: 62, slideTo: 40, gain: 0.3, dur: 0.8, release: 0.6, filter: 'lowpass', filterFreq: 320 });
          this.tone({ type: 'sawtooth', freq: 93, slideTo: 58, gain: 0.18, dur: 0.8, release: 0.6, filter: 'lowpass', filterFreq: 420, detune: 14 });
          this.noise({ filter: 'lowpass', freq: 700, gain: 0.18, dur: 0.7, release: 0.5 });
          break;
        case 'heal':
          [523.25, 659.25, 783.99].forEach((f, i) => {
            this.tone({ type: 'sine', freq: f, gain: 0.13, dur: 0.25, release: 0.35, delay: i * 0.08 });
          });
          break;
        case 'potion':
          this.tone({ type: 'sine', freq: 300, slideTo: 600, gain: 0.12, dur: 0.1, release: 0.08 });
          this.tone({ type: 'sine', freq: 520, slideTo: 900, gain: 0.1, dur: 0.14, release: 0.1, delay: 0.09 });
          break;
        case 'enemyDeath':
          this.tone({ type: 'sawtooth', freq: 340, slideTo: 60, gain: 0.16, dur: 0.26, release: 0.24, filter: 'lowpass', filterFreq: 900 });
          this.noise({ filter: 'bandpass', freq: 1200, sweepTo: 200, gain: 0.16, dur: 0.24, release: 0.2 });
          break;
        case 'perfect':
          this.tone({ type: 'sine', freq: 880, gain: 0.14, dur: 0.1, release: 0.3 });
          this.tone({ type: 'sine', freq: 1320, gain: 0.1, dur: 0.12, release: 0.4, delay: 0.06 });
          this.noise({ filter: 'highpass', freq: 4000, gain: 0.08, dur: 0.25, release: 0.3 });
          break;
        case 'waveStart':
          this.tone({ type: 'sine', freq: 82, slideTo: 62, gain: 0.38, dur: 0.7, release: 0.9 });
          this.tone({ type: 'sawtooth', freq: 164, gain: 0.1, dur: 0.5, release: 0.6, filter: 'lowpass', filterFreq: 800 });
          this.noise({ filter: 'lowpass', freq: 400, gain: 0.16, dur: 0.5, release: 0.6 });
          break;
        case 'bossStart':
          this.tone({ type: 'sine', freq: 44, slideTo: 30, gain: 0.5, dur: 1.4, release: 1.2 });
          this.noise({ filter: 'lowpass', freq: 300, gain: 0.28, dur: 1.2, release: 1.0 });
          this.tone({ type: 'sawtooth', freq: 55, slideTo: 82, gain: 0.14, dur: 1.2, release: 0.8, filter: 'lowpass', filterFreq: 300, delay: 0.4 });
          break;
        case 'victory':
          [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            this.tone({ type: 'triangle', freq: f, gain: 0.12, dur: 0.3, release: 0.6, delay: i * 0.13 });
          });
          break;
        case 'death':
          this.tone({ type: 'sine', freq: 110, slideTo: 36, gain: 0.35, dur: 1.2, release: 1.4 });
          this.noise({ filter: 'lowpass', freq: 500, sweepTo: 60, gain: 0.2, dur: 1.0, release: 1.2 });
          break;
        case 'ui':
          this.tone({ type: 'sine', freq: 660, gain: 0.07, dur: 0.03, release: 0.07 });
          break;
        case 'comboTick':
          this.tone({ type: 'triangle', freq: 880 + (opt.pitch || 0), gain: 0.05, dur: 0.02, release: 0.06 });
          break;
        case 'teleport':
          this.tone({ type: 'sine', freq: 900, slideTo: 200, gain: 0.12, dur: 0.3, release: 0.25 });
          break;
        case 'swordWave':
          this.noise({ filter: 'bandpass', freq: 1600, sweepTo: 600, Q: 1.2, gain: 0.16, dur: 0.22, release: 0.2 });
          this.tone({ type: 'sine', freq: 620, slideTo: 240, gain: 0.1, dur: 0.16, release: 0.14 });
          break;
        /* ---------- v2.0 战斗 / 关卡 / 系统音效 ---------- */
        case 'parry':
          /* 金属铿锵：撞击瞬态 + 高频泛音尾 */
          this.tone({ type: 'triangle', freq: 2100, slideTo: 1250, gain: 0.16, attack: 0.001, hold: 0.012, release: 0.18 });
          this.tone({ type: 'square', freq: 3200, slideTo: 2400, gain: 0.055, attack: 0.001, hold: 0.01, release: 0.12, filter: 'bandpass', filterFreq: 3000, Q: 2.2 });
          [5300, 6400, 7800].forEach((f, i) => {
            this.tone({ type: 'sine', freq: f, gain: 0.05 - i * 0.012, attack: 0.001, hold: 0.02, release: 0.45 + i * 0.15, delay: 0.004 + i * 0.012 });
          });
          this.noise({ filter: 'highpass', freq: 4200, gain: 0.09, attack: 0.001, hold: 0.02, release: 0.25 });
          break;
        case 'block':
          /* 沉闷金属撞击：低频闷响 + 短促金属嗡 */
          this.tone({ type: 'square', freq: 320, slideTo: 150, gain: 0.15, attack: 0.001, hold: 0.02, release: 0.14, filter: 'lowpass', filterFreq: 900 });
          this.noise({ filter: 'bandpass', freq: 700, sweepTo: 260, Q: 1.6, gain: 0.14, attack: 0.001, hold: 0.02, release: 0.16 });
          this.tone({ type: 'sine', freq: 130, slideTo: 68, gain: 0.13, attack: 0.001, hold: 0.03, release: 0.14 });
          this.tone({ type: 'triangle', freq: 1450, gain: 0.05, attack: 0.001, hold: 0.012, release: 0.18, filter: 'bandpass', filterFreq: 1500, Q: 3 });
          break;
        case 'guardBreak':
          /* 护甲碎裂：噪声迸裂 + 碎片叮当 + 闷响 */
          this.noise({ filter: 'highpass', freq: 2600, sweepTo: 900, gain: 0.22, attack: 0.001, hold: 0.02, release: 0.3, dur: 0.2 });
          this.noise({ filter: 'bandpass', freq: 1400, sweepTo: 400, Q: 1.2, gain: 0.2, attack: 0.001, hold: 0.02, release: 0.34, dur: 0.24 });
          [1800, 2350, 3100, 4200].forEach((f, i) => {
            this.tone({ type: 'triangle', freq: f, gain: 0.045, attack: 0.001, hold: 0.005, release: 0.12 + i * 0.05, delay: 0.03 + i * 0.045 });
          });
          this.tone({ type: 'sine', freq: 160, slideTo: 58, gain: 0.18, attack: 0.002, hold: 0.04, release: 0.22 });
          break;
        case 'execute':
          /* 重斩：破风 + 重击 + 低频轰鸣 */
          this.noise({ filter: 'bandpass', freq: 500, sweepTo: 2600, Q: 1.0, gain: 0.18, attack: 0.008, hold: 0.02, release: 0.14, dur: 0.16 });
          this.noise({ filter: 'lowpass', freq: 1400, sweepTo: 180, gain: 0.32, attack: 0.002, hold: 0.03, release: 0.4, delay: 0.08 });
          this.tone({ type: 'sine', freq: 88, slideTo: 30, gain: 0.38, attack: 0.003, hold: 0.08, release: 0.7, delay: 0.08 });
          this.tone({ type: 'sawtooth', freq: 220, slideTo: 55, gain: 0.1, attack: 0.005, hold: 0.05, release: 0.4, filter: 'lowpass', filterFreq: 600, delay: 0.08 });
          this.tone({ type: 'sine', freq: 1560, slideTo: 780, gain: 0.05, attack: 0.002, hold: 0.02, release: 0.5, delay: 0.1 });
          break;
        case 'blessingOpen':
          /* 空灵上行铺底：缓慢渐入的和声 + 空气感上行噪声 */
          [293.66, 440, 587.33, 880].forEach((f, i) => {
            this.tone({ type: 'sine', freq: f, gain: 0.09 - i * 0.015, attack: 0.18 + i * 0.03, hold: 0.25, release: 1.4, delay: i * 0.07 });
          });
          this.noise({ filter: 'bandpass', freq: 800, sweepTo: 5200, Q: 0.9, gain: 0.055, attack: 0.12, hold: 0.1, release: 1.0, dur: 0.9 });
          [1760, 2349.32].forEach((f, i) => {
            this.tone({ type: 'triangle', freq: f, gain: 0.035, attack: 0.1, hold: 0.05, release: 1.0, delay: 0.25 + i * 0.12 });
          });
          break;
        case 'blessingPick': {
          /* 明亮确认和弦：rarity 越高音高/音色/尾音越华丽 */
          const rar = opt.rarity === 'epic' ? 2 : (opt.rarity === 'rare' ? 1 : 0);
          const chordList = [
            [523.25, 659.25, 783.99],
            [587.33, 739.99, 880, 1174.66],
            [659.25, 830.61, 987.77, 1318.51],
          ];
          chordList[rar].forEach((f, i) => {
            this.tone({ type: rar === 2 ? 'triangle' : 'sine', freq: f, gain: 0.07 - i * 0.008, attack: 0.004, hold: 0.06, release: 0.45 + rar * 0.22, delay: i * 0.035 });
          });
          if (rar >= 1) this.noise({ filter: 'highpass', freq: 5000, gain: 0.04, attack: 0.002, hold: 0.02, release: 0.5, delay: 0.05 });
          if (rar === 2) {
            [1975.53, 2637.02].forEach((f, i) => {
              this.tone({ type: 'sine', freq: f, gain: 0.028, attack: 0.02, hold: 0.03, release: 0.9, delay: 0.18 + i * 0.08 });
            });
          }
          break;
        }
        case 'styleUp': {
          /* 短促上扬鸣响：rank 越高音高越亮、空气感越强 */
          const rank = opt.rank === 'S' ? 3 : (opt.rank === 'A' ? 2 : (opt.rank === 'B' ? 1 : 0));
          const baseFreq = [440, 523.25, 659.25, 783.99][rank];
          const airFreq = [1400, 2400, 3600, 5200][rank];
          this.tone({ type: 'triangle', freq: baseFreq, slideTo: baseFreq * 2, gain: 0.1, attack: 0.004, hold: 0.03, release: 0.22 });
          this.tone({ type: 'sine', freq: baseFreq * 2, gain: 0.06 + rank * 0.008, attack: 0.004, hold: 0.03, release: 0.3 + rank * 0.08, delay: 0.03 });
          this.noise({ filter: 'highpass', freq: airFreq, gain: 0.03 + rank * 0.012, attack: 0.001, hold: 0.01, release: 0.16 + rank * 0.06 });
          if (rank >= 2) this.tone({ type: 'sine', freq: baseFreq * 3, gain: 0.04, attack: 0.004, hold: 0.02, release: 0.4, delay: 0.06 });
          break;
        }
        case 'styleDown':
          /* 低调下行：连击中断 / 评级回落 */
          this.tone({ type: 'triangle', freq: 520, slideTo: 200, gain: 0.09, attack: 0.004, hold: 0.04, release: 0.3 });
          this.tone({ type: 'sine', freq: 260, slideTo: 108, gain: 0.07, attack: 0.005, hold: 0.05, release: 0.35, delay: 0.04 });
          this.noise({ filter: 'lowpass', freq: 1200, sweepTo: 300, gain: 0.05, attack: 0.004, hold: 0.02, release: 0.28, dur: 0.2, delay: 0.02 });
          break;
        case 'pickup':
          /* 清脆拨奏：快速上行的三角波拨弦 */
          this.tone({ type: 'triangle', freq: 783.99, gain: 0.1, attack: 0.002, hold: 0.02, release: 0.16, filter: 'lowpass', filterFreq: 5000 });
          this.tone({ type: 'triangle', freq: 1174.66, gain: 0.08, attack: 0.002, hold: 0.02, release: 0.24, delay: 0.055 });
          this.tone({ type: 'sine', freq: 1760, gain: 0.05, attack: 0.002, hold: 0.01, release: 0.2, delay: 0.1 });
          break;
        case 'swordRain': {
          /* 多段下坠呼啸 + 落地冲击，单次调用完整播放 */
          for (let i = 0; i < 4; i++) {
            const d = i * 0.11;
            this.noise({ filter: 'bandpass', freq: 2400 - i * 300, sweepTo: 700, Q: 1.4, gain: 0.11 - i * 0.018, attack: 0.01, hold: 0.02, release: 0.2, dur: 0.18, delay: d });
            this.tone({ type: 'triangle', freq: 1400 + i * 120, slideTo: 420, gain: 0.055, attack: 0.004, hold: 0.02, release: 0.2, delay: d + 0.02 });
            this.noise({ filter: 'lowpass', freq: 900, sweepTo: 160, gain: 0.12, attack: 0.002, hold: 0.03, release: 0.2, delay: d + 0.14 });
            this.tone({ type: 'sine', freq: 120, slideTo: 44, gain: 0.12, attack: 0.002, hold: 0.04, release: 0.18, delay: d + 0.14 });
          }
          this.noise({ filter: 'lowpass', freq: 1000, sweepTo: 80, gain: 0.2, attack: 0.002, hold: 0.05, release: 0.35, delay: 0.46 });
          this.tone({ type: 'sine', freq: 70, slideTo: 28, gain: 0.24, attack: 0.003, hold: 0.06, release: 0.4, delay: 0.46 });
          break;
        }
        case 'bossPhase':
          /* Boss 转阶段：巨吼 + 铜锣泛音群 + 低频冲击 */
          this.tone({ type: 'sawtooth', freq: 72, slideTo: 46, gain: 0.3, attack: 0.04, hold: 0.28, release: 0.9, filter: 'lowpass', filterFreq: 380 });
          this.tone({ type: 'sawtooth', freq: 108, slideTo: 68, gain: 0.16, attack: 0.05, hold: 0.24, release: 0.8, filter: 'lowpass', filterFreq: 520, detune: 18 });
          this.noise({ filter: 'lowpass', freq: 800, sweepTo: 200, gain: 0.16, attack: 0.03, hold: 0.2, release: 0.6, dur: 0.7 });
          [196, 296, 415, 587, 880].forEach((f, i) => {
            this.tone({ type: 'sine', freq: f, gain: 0.09 - i * 0.012, attack: 0.005, hold: 0.1, release: 1.6 - i * 0.15, delay: 0.08 });
          });
          this.tone({ type: 'sine', freq: 52, slideTo: 26, gain: 0.42, attack: 0.002, hold: 0.1, release: 0.9, delay: 0.02 });
          this.noise({ filter: 'lowpass', freq: 420, gain: 0.16, attack: 0.002, hold: 0.06, release: 0.5, delay: 0.02 });
          break;
        case 'endlessStart':
          /* 无尽模式开启：低沉号角（五度叠置，缓慢起音） */
          [110, 164.81, 220].forEach((f, i) => {
            this.tone({ type: 'sawtooth', freq: f, gain: 0.1 - i * 0.02, attack: 0.15, hold: 0.3, release: 1.1, filter: 'lowpass', filterFreq: 900 - i * 150, delay: i * 0.02 });
          });
          this.tone({ type: 'sine', freq: 55, gain: 0.2, attack: 0.1, hold: 0.4, release: 1.2 });
          this.noise({ filter: 'lowpass', freq: 500, gain: 0.08, attack: 0.2, hold: 0.2, release: 1.0, dur: 0.9 });
          this.tone({ type: 'sawtooth', freq: 165, slideTo: 220, gain: 0.07, attack: 0.2, hold: 0.2, release: 0.9, filter: 'lowpass', filterFreq: 1100, delay: 0.3 });
          break;
        case 'detonate':
          /* 滴答两下后爆炸 */
          this.tone({ type: 'square', freq: 1800, gain: 0.05, attack: 0.001, hold: 0.008, release: 0.05, filter: 'highpass', filterFreq: 1200 });
          this.tone({ type: 'square', freq: 1800, gain: 0.05, attack: 0.001, hold: 0.008, release: 0.05, filter: 'highpass', filterFreq: 1200, delay: 0.18 });
          this.noise({ filter: 'lowpass', freq: 3000, sweepTo: 180, gain: 0.38, attack: 0.002, hold: 0.06, release: 0.5, delay: 0.36 });
          this.tone({ type: 'sine', freq: 95, slideTo: 26, gain: 0.44, attack: 0.003, hold: 0.1, release: 0.6, delay: 0.36 });
          this.noise({ filter: 'bandpass', freq: 1400, sweepTo: 300, Q: 0.7, gain: 0.2, attack: 0.001, hold: 0.04, release: 0.35, delay: 0.36 });
          this.tone({ type: 'sawtooth', freq: 200, slideTo: 45, gain: 0.12, attack: 0.004, hold: 0.06, release: 0.4, filter: 'lowpass', filterFreq: 700, delay: 0.37 });
          break;
        case 'eliteSpawn':
          /* 精英出现：暗色低频脉冲（三连）+ 不祥尾音 */
          for (let i = 0; i < 3; i++) {
            this.tone({ type: 'sawtooth', freq: 150 - i * 22, slideTo: 60, gain: 0.12 - i * 0.02, attack: 0.02, hold: 0.05, release: 0.28, filter: 'lowpass', filterFreq: 420, delay: i * 0.16 });
            this.tone({ type: 'sine', freq: 70, slideTo: 40, gain: 0.2 - i * 0.03, attack: 0.01, hold: 0.05, release: 0.3, delay: i * 0.16 });
          }
          this.noise({ filter: 'bandpass', freq: 300, sweepTo: 900, Q: 2.0, gain: 0.09, attack: 0.05, hold: 0.1, release: 0.6, dur: 0.5 });
          break;
        case 'uiHover':
          /* 轻微悬停反馈（比 ui 更轻） */
          this.tone({ type: 'sine', freq: 880, gain: 0.035, attack: 0.002, hold: 0.01, release: 0.06 });
          this.tone({ type: 'sine', freq: 1320, gain: 0.02, attack: 0.002, hold: 0.005, release: 0.05, delay: 0.01 });
          break;
        default:
          break;
      }
    }

    /* ---------- 程序化配乐 ---------- */
    /* 模式归一化：未知/非法模式按 battle 处理，保证 setMusicMode 任意入参都不报错 */
    _mode() {
      const m = this.musicMode;
      if (m === 'none' || m === 'title' || m === 'battle' || m === 'boss' || m === 'boss2') return m;
      return 'battle';
    }

    setMusicMode(mode) {
      this.musicMode = mode;
      if (!this.ready) return;
      const m = this._mode();
      const target = m === 'none' ? 0 : (m === 'title' ? 0.55 : 1.0);
      this._musicLevel = target;
      this.musicGain.gain.setTargetAtTime(m === 'none' ? 0 : 0.5, this.ctx.currentTime, 0.8);
      if (m !== 'none' && !this._timer) this._startScheduler();
    }

    setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); }

    _startScheduler() {
      if (this._timer) return;
      this._step = 0;
      this._nextStep = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._schedule(), 40);
    }

    _schedule() {
      if (!this.ready) return;
      /* boss2 二阶段提速到 100 BPM，其余模式保持 84 BPM */
      const bpm = this._mode() === 'boss2' ? 100 : 84;
      const stepDur = 60 / bpm / 2; /* 八分音符 */
      while (this._nextStep < this.ctx.currentTime + 0.18) {
        this._playStep(this._step, this._nextStep);
        this._nextStep += stepDur;
        this._step = (this._step + 1) % 32;
      }
    }

    _mnote(t, midi, dur, gain, type) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      this.tone({
        type: type || 'triangle', freq, gain, attack: 0.01, hold: Math.max(0.02, dur * 0.5),
        release: dur, time: t, dest: this.musicGain,
      });
    }

    _playStep(step, t) {
      if (!this.ready) return;
      const mode = this._mode();
      if (mode === 'none') return;
      const intense = mode === 'boss' || mode === 'boss2' || this._intensity > 0.55;
      const m = this.musicGain;

      /* 低频脉冲 / 战鼓 */
      if (mode !== 'title') {
        if (step === 0 || step === 8 || (intense && (step === 6 || step === 14))) {
          this.tone({ type: 'sine', freq: 92, slideTo: 34, gain: 0.5, attack: 0.002, hold: 0.05, release: 0.18, time: t, dest: m });
          this.noise({ filter: 'lowpass', freq: 260, gain: 0.12, attack: 0.002, hold: 0.02, release: 0.1, time: t, dest: m });
        }
        if (intense && (step === 4 || step === 12)) {
          this.noise({ filter: 'bandpass', freq: 180, Q: 0.7, gain: 0.1, attack: 0.002, hold: 0.03, release: 0.16, time: t, dest: m });
        }
        if (step % 2 === 1) {
          this.noise({ filter: 'highpass', freq: 6200, gain: intense ? 0.035 : 0.018, attack: 0.001, hold: 0.005, release: 0.035, time: t, dest: m });
        }
      } else if (step % 8 === 0) {
        this.noise({ filter: 'highpass', freq: 5000, gain: 0.012, attack: 0.001, hold: 0.01, release: 0.2, time: t, dest: m });
      }

      /* 低音线：D 小调五声 */
      const bassPat = [null, null, 38, null, null, null, 41, null, 43, null, null, null, 45, null, 41, null];
      const b = bassPat[step % 16];
      if (b != null && mode !== 'title') {
        this.tone({
          type: 'sawtooth', freq: 440 * Math.pow(2, (b - 69) / 12), gain: 0.11,
          attack: 0.01, hold: 0.08, release: 0.16, time: t,
          filter: 'lowpass', filterFreq: intense ? 620 : 420, dest: m,
        });
      }

      /* 氛围和弦：每 8 步一次长音 */
      if (step % 8 === 0) {
        const chords = [
          [50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52],
        ];
        const ch = chords[Math.floor(step / 8) % chords.length];
        ch.forEach((n, i) => {
          this.tone({
            type: i === 0 ? 'sawtooth' : 'triangle',
            freq: 440 * Math.pow(2, (n - 60) / 12),
            gain: mode === 'title' ? 0.024 : 0.034,
            attack: 0.6, hold: 0.5, release: 1.6, time: t + i * 0.02,
            filter: 'lowpass', filterFreq: 760, dest: m,
          });
        });
        this.tone({ type: 'sine', freq: 36.7, gain: mode === 'title' ? 0.05 : 0.07, attack: 1.2, hold: 1.0, release: 2.0, time: t, dest: m });
      }

      /* 五声拨弦旋律（稀疏） */
      if (mode !== 'title') {
        const melody = {
          0: 74, 3: 77, 6: 81, 10: 79, 13: 77, 16: 74, 19: 69, 22: 72, 26: 74, 29: 77,
        };
        const note = melody[step];
        if (note != null && (intense || step % 2 === 0)) {
          this.tone({
            type: 'triangle', freq: 440 * Math.pow(2, (note - 69) / 12), gain: 0.06,
            attack: 0.004, hold: 0.03, release: 0.5, time: t,
            filter: 'lowpass', filterFreq: 2400, dest: m,
          });
        }
      } else if (step % 8 === 3) {
        this.tone({
          type: 'sine', freq: 440 * Math.pow(2, (74 - 69) / 12), gain: 0.035,
          attack: 0.02, hold: 0.05, release: 1.4, time: t, dest: m,
        });
      }

      if (mode === 'boss' && step % 4 === 0) {
        this.tone({ type: 'sawtooth', freq: 41.2, gain: 0.05, attack: 0.3, hold: 0.2, release: 1.2, time: t, filter: 'lowpass', filterFreq: 180, dest: m });
      }

      /* boss2 二阶段：密集鼓点 + 低音铜管 + 不协和层（各层增益克制，避免刺耳/削波） */
      if (mode === 'boss2') {
        /* 反拍双踩底鼓 */
        if (step % 4 === 2) {
          this.tone({ type: 'sine', freq: 104, slideTo: 38, gain: 0.26, attack: 0.002, hold: 0.04, release: 0.14, time: t, dest: m });
          this.noise({ filter: 'lowpass', freq: 300, gain: 0.08, attack: 0.002, hold: 0.02, release: 0.08, time: t, dest: m });
        }
        /* 军鼓反拍 */
        if (step % 8 === 4) {
          this.noise({ filter: 'bandpass', freq: 1100, Q: 0.8, gain: 0.07, attack: 0.002, hold: 0.02, release: 0.14, time: t, dest: m });
          this.tone({ type: 'triangle', freq: 190, slideTo: 140, gain: 0.05, attack: 0.002, hold: 0.02, release: 0.12, time: t, dest: m });
        }
        /* 踩镲补位：原曲奇数步已有一层，这里补偶数步 */
        if (step % 2 === 0) {
          this.noise({ filter: 'highpass', freq: 7200, gain: 0.018, attack: 0.001, hold: 0.004, release: 0.03, time: t, dest: m });
        }
        /* 低音铜管：D 根音 + A 五度，每 8 步一次 */
        if (step % 8 === 0) {
          [38, 45].forEach((n, i) => {
            this.tone({
              type: 'sawtooth', freq: 440 * Math.pow(2, (n - 69) / 12),
              gain: i === 0 ? 0.085 : 0.05, attack: 0.03, hold: 0.24, release: 0.5, time: t,
              filter: 'lowpass', filterFreq: 360, dest: m,
            });
          });
          /* 不协和长音层：降三音（E♭）与根音形成摩擦 */
          this.tone({
            type: 'sawtooth', freq: 440 * Math.pow(2, (51 - 69) / 12), gain: 0.026,
            attack: 0.5, hold: 0.4, release: 1.0, time: t, detune: 12,
            filter: 'lowpass', filterFreq: 700, dest: m,
          });
        }
        /* 偶发不协和刺音，制造二阶段紧张感 */
        if (step === 14) {
          this.tone({ type: 'sawtooth', freq: 622.25, gain: 0.028, attack: 0.01, hold: 0.08, release: 0.45, time: t, filter: 'lowpass', filterFreq: 1800, detune: 22, dest: m });
        }
        /* 低频轰鸣铺底 */
        if (step % 4 === 0) {
          this.tone({ type: 'sine', freq: 36.7, gain: 0.05, attack: 0.2, hold: 0.2, release: 1.0, time: t, dest: m });
        }
      }
    }
  }

  G.audio = new AudioEngine();
})();
