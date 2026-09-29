// Synthesized SFX for Rampart 50. Every sound is drawn from Web Audio
// oscillators and short noise bursts, the same way the board is drawn from
// canvas primitives rather than shipped as image assets — no audio files, no
// network request, nothing to download before the first sound plays.
import type { BuildKind, EnemyKind } from './config';

const MUTE_KEY = 'ij-muted';

function readMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(MUTE_KEY, '1');
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    /* private mode or storage disabled: mute just stays session-only */
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw instead of ignoring; either way, no sound is lost */
  }
}

export type SimSound =
  | 'shotCannon'
  | 'chain'
  | 'kill'
  | 'killBoss'
  | 'leak'
  | 'waveStart'
  | 'waveStartBoss'
  | 'waveClear'
  | 'combo'
  | 'gameOver'
  | 'victory';

function killFrequency(kind?: EnemyKind): number {
  switch (kind) {
    case 'runner':
      return 780;
    case 'gunner':
      return 420;
    case 'armored':
      return 340;
    case 'scout':
      return 640;
    case 'boss':
      return 200;
    default:
      return 520;
  }
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private lastPlayed = new Map<string, number>();
  private heartbeatTimer: number | null = null;

  constructor() {
    this.muted = readMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    writeMuted(value);
    if (this.master) this.master.gain.value = value ? 0 : 0.9;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Creates (once) or resumes the AudioContext. Call this from a real user
   *  gesture (a tap, a click) — browsers refuse to start audio otherwise. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private throttled(key: string, minGapMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? 0;
    if (now - last < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    opts: { gain?: number; glideTo?: number; delay?: number } = {},
  ): void {
    if (!this.ctx || !this.master) return;
    const { gain = 0.2, glideTo, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, duration * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(
    duration: number,
    opts: {
      gain?: number;
      filterFreq?: number;
      delay?: number;
      filterType?: BiquadFilterType;
    } = {},
  ): void {
    if (!this.ctx || !this.master) return;
    const { gain = 0.22, filterFreq = 900, delay = 0, filterType = 'lowpass' } = opts;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  ui(): void {
    this.tone(720, 0.05, 'square', { gain: 0.1 });
  }

  build(kind: BuildKind): void {
    if (kind === 'wall') {
      this.noise(0.09, { gain: 0.28, filterFreq: 260 });
      return;
    }
    if (kind === 'arrow') this.tone(660, 0.07, 'square', { gain: 0.17, glideTo: 880 });
    else if (kind === 'cannon') {
      this.noise(0.08, { gain: 0.26, filterFreq: 220 });
      this.tone(160, 0.12, 'sine', { gain: 0.18, delay: 0.01 });
    } else if (kind === 'caltrop') this.tone(1400, 0.16, 'triangle', { gain: 0.15, glideTo: 900 });
    else this.tone(220, 0.14, 'sawtooth', { gain: 0.15, glideTo: 340 });
    vibrate(8);
  }

  upgrade(level: number): void {
    const base = 480 + level * 90;
    this.tone(base, 0.08, 'sine', { gain: 0.17 });
    this.tone(base * 1.5, 0.09, 'sine', { gain: 0.15, delay: 0.06 });
    vibrate(8);
  }

  sell(): void {
    this.tone(420, 0.07, 'square', { gain: 0.13, glideTo: 220 });
  }

  refuse(): void {
    this.tone(140, 0.14, 'sawtooth', { gain: 0.15, glideTo: 90 });
  }

  callWave(): void {
    this.tone(500, 0.1, 'triangle', { gain: 0.17, glideTo: 760 });
  }

  sim(event: SimSound, data?: { kind?: EnemyKind; combo?: number }): void {
    switch (event) {
      case 'shotCannon':
        if (!this.throttled('shotCannon', 90)) return;
        this.noise(0.06, { gain: 0.16, filterFreq: 300 });
        this.tone(120, 0.09, 'sine', { gain: 0.13, delay: 0.01 });
        return;
      case 'chain':
        if (!this.throttled('chain', 30)) return;
        this.tone(900 + Math.random() * 200, 0.05, 'sawtooth', { gain: 0.12, glideTo: 500 });
        return;
      case 'kill': {
        if (!this.throttled('kill', 35)) return;
        const freq = killFrequency(data?.kind);
        this.tone(freq, 0.08, 'square', { gain: 0.15, glideTo: freq * 0.6 });
        return;
      }
      case 'killBoss':
        this.noise(0.3, { gain: 0.28, filterFreq: 180 });
        this.tone(90, 0.4, 'sine', { gain: 0.2, glideTo: 40 });
        vibrate(50);
        return;
      case 'leak':
        this.tone(200, 0.09, 'square', { gain: 0.2, glideTo: 120 });
        this.tone(200, 0.09, 'square', { gain: 0.18, glideTo: 120, delay: 0.1 });
        vibrate(40);
        return;
      case 'waveStart':
        this.tone(300, 0.18, 'sawtooth', { gain: 0.15, glideTo: 460 });
        return;
      case 'waveStartBoss':
        this.tone(140, 0.3, 'sawtooth', { gain: 0.19, glideTo: 100 });
        this.tone(140, 0.3, 'sawtooth', { gain: 0.17, glideTo: 100, delay: 0.28 });
        return;
      case 'waveClear':
        [660, 880, 1100].forEach((f, i) =>
          this.tone(f, 0.12, 'triangle', { gain: 0.15, delay: i * 0.07 }),
        );
        vibrate(20);
        return;
      case 'combo':
        this.tone(560 + Math.min(10, data?.combo ?? 0) * 30, 0.09, 'sine', { gain: 0.14 });
        return;
      case 'gameOver':
        [420, 320, 220].forEach((f, i) =>
          this.tone(f, 0.22, 'sawtooth', { gain: 0.17, delay: i * 0.16 }),
        );
        vibrate([60, 40, 60]);
        return;
      case 'victory':
        [520, 660, 780, 1040, 1240].forEach((f, i) =>
          this.tone(f, 0.16, i % 2 ? 'triangle' : 'square', { gain: 0.16, delay: i * 0.1 }),
        );
        vibrate([30, 30, 30, 30, 80]);
        return;
    }
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer !== null || typeof window === 'undefined') return;
    const beat = () => {
      this.tone(90, 0.07, 'sine', { gain: 0.13 });
      this.tone(90, 0.07, 'sine', { gain: 0.1, delay: 0.14 });
    };
    beat();
    this.heartbeatTimer = window.setInterval(beat, 780);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export function mapSimEvent(kind: EnemyKind): SimSound {
  return kind === 'boss' ? 'killBoss' : 'kill';
}
