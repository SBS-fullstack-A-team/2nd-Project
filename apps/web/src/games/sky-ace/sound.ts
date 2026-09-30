/**
 * 효과음·배경음악을 Web Audio API 로 직접 합성한다 (오디오 파일 없음).
 *
 * 브라우저는 사용자 동작 전에는 소리를 막으므로, 버튼을 누를 때 unlock() 으로 AudioContext 를 깨운다.
 * 오디오를 쓸 수 없는 환경이면 조용히 아무것도 하지 않는다.
 */

export type SfxName =
  | 'shot'
  | 'hit'
  | 'explode'
  | 'bigExplode'
  | 'bomb'
  | 'power'
  | 'bombItem'
  | 'die'
  | 'warning'
  | 'laser'
  | 'phase'
  | 'clear'
  | 'select';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const MUTE_KEY = 'simsim:sky-ace:muted:v1';

/** 스테이지별 배경음 (반음 단위, null = 쉼표) — 16분음표 16칸 */
const BGM: Record<number, { root: number; lead: (number | null)[]; bass: number[]; bpm: number }> =
  {
    1: {
      root: 57,
      bpm: 150,
      lead: [12, null, 12, 15, null, 17, 15, null, 12, null, 10, 12, null, 7, null, 10],
      bass: [0, 0, 12, 0, 0, 0, 12, 0, -2, -2, 10, -2, 3, 3, 15, 3],
    },
    2: {
      root: 55,
      bpm: 158,
      lead: [12, 14, 15, null, 19, null, 15, 14, 12, null, 15, null, 14, 10, null, 7],
      bass: [0, 12, 0, 12, -4, 8, -4, 8, -2, 10, -2, 10, -5, 7, -5, 7],
    },
    3: {
      root: 52,
      bpm: 168,
      lead: [12, 13, 12, 19, null, 18, 19, 13, 12, null, 16, 15, 13, null, 12, 11],
      bass: [0, 0, 12, 0, 1, 1, 13, 1, 0, 0, 12, 0, -1, -1, 11, -1],
    },
    4: {
      // 보스전
      root: 50,
      bpm: 176,
      lead: [12, null, 15, 12, 18, null, 17, 15, 12, null, 15, 12, 20, 19, 18, 15],
      bass: [0, 0, 0, 12, 0, 0, 0, 12, 1, 1, 1, 13, 1, 1, 1, 13],
    },
  };

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  /** 같은 효과음이 한 프레임에 수십 번 겹치지 않도록 마지막 재생 시각 */
  private lastPlay = new Map<SfxName, number>();
  private bgmTimer: number | null = null;
  private bgmTrack = 0;
  private bgmStep = 0;
  private bgmNext = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 저장 실패는 무시 (시크릿 모드 등)
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  /** 클릭·키 입력 안에서 호출 — AudioContext 생성/재개 */
  unlock() {
    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      try {
        const ctx = new Ctor();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(ctx.destination);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = 0.55;
        this.sfxBus.connect(this.master);
        this.bgmBus = ctx.createGain();
        this.bgmBus.gain.value = 0.16;
        this.bgmBus.connect(this.master);
        // 폭발음용 화이트 노이즈 1초
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  destroy() {
    this.stopBgm();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }

  /* ---------------- 효과음 ---------------- */

  play(name: SfxName) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted) return;
    const now = ctx.currentTime;
    const minGap: Partial<Record<SfxName, number>> = { shot: 0.07, hit: 0.05, explode: 0.04 };
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < (minGap[name] ?? 0.02)) return;
    this.lastPlay.set(name, now);

    switch (name) {
      case 'shot':
        this.tone('square', 880, 440, 0.05, 0.05);
        break;
      case 'hit':
        this.tone('square', 300, 180, 0.04, 0.05);
        break;
      case 'explode':
        this.burst(0.25, 1400, 0.4);
        this.tone('sawtooth', 140, 40, 0.2, 0.18);
        break;
      case 'bigExplode':
        this.burst(1.1, 900, 0.8);
        this.tone('sawtooth', 90, 25, 0.9, 0.35);
        break;
      case 'bomb':
        this.burst(1.6, 600, 0.9);
        this.tone('sine', 60, 30, 1.5, 0.6);
        this.tone('sawtooth', 400, 60, 0.8, 0.2);
        break;
      case 'power':
        [0, 4, 7, 12].forEach((s, i) => this.note(72 + s, now + i * 0.06, 0.1, 'square', 0.12));
        break;
      case 'bombItem':
        [0, 7, 12, 19].forEach((s, i) => this.note(64 + s, now + i * 0.07, 0.12, 'triangle', 0.2));
        break;
      case 'die':
        this.burst(0.9, 1800, 0.7);
        this.tone('square', 600, 50, 0.8, 0.2);
        break;
      case 'warning':
        for (let i = 0; i < 4; i++) {
          this.note(69, now + i * 0.6, 0.28, 'sawtooth', 0.2);
          this.note(62, now + i * 0.6 + 0.3, 0.28, 'sawtooth', 0.2);
        }
        break;
      case 'laser':
        this.tone('sawtooth', 1200, 200, 0.45, 0.12);
        break;
      case 'phase':
        this.burst(1.2, 700, 0.8);
        [0, -3, -6, -9].forEach((s, i) => this.note(60 + s, now + i * 0.12, 0.2, 'square', 0.15));
        break;
      case 'clear':
        [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) =>
          this.note(67 + s, now + i * 0.11, 0.16, 'square', 0.14),
        );
        break;
      case 'select':
        this.tone('square', 660, 990, 0.08, 0.1);
        break;
    }
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, cutoff: number, vol: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxBus!);
    src.start(t);
    src.stop(t + dur);
  }

  private note(
    midi: number,
    at: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    bus: GainNode | null = this.sfxBus,
  ) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /* ---------------- 배경음 ---------------- */

  /** track: 1~3 = 스테이지, 4 = 보스전 */
  playBgm(track: number) {
    if (!this.ctx) return;
    if (this.bgmTimer !== null && this.bgmTrack === track) return;
    this.stopBgm();
    this.bgmTrack = track;
    this.bgmStep = 0;
    this.bgmNext = this.ctx.currentTime + 0.05;
    // 조금 앞서서 음을 예약해 두는 방식 (setInterval 지연에도 박자가 흔들리지 않게)
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 50);
  }

  stopBgm() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  private scheduleBgm() {
    const ctx = this.ctx;
    const song = BGM[this.bgmTrack];
    if (!ctx || !song || ctx.state !== 'running') return;
    const stepDur = 60 / song.bpm / 4;
    while (this.bgmNext < ctx.currentTime + 0.2) {
      const i = this.bgmStep % 16;
      const lead = song.lead[i];
      const bass = song.bass[i];
      if (lead !== null && lead !== undefined) {
        this.note(song.root + lead, this.bgmNext, stepDur * 0.9, 'square', 0.35, this.bgmBus);
      }
      if (bass !== undefined) {
        this.note(song.root - 12 + bass, this.bgmNext, stepDur * 0.8, 'triangle', 0.6, this.bgmBus);
      }
      this.bgmNext += stepDur;
      this.bgmStep += 1;
    }
  }
}
