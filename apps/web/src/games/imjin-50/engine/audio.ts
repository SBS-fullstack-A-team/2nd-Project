// 임진 50 효과음. 판을 캔버스 도형으로 그리듯 소리도 Web Audio 오실레이터와 짧은
// 잡음으로 합성한다 — 음원 파일도, 네트워크 요청도, 첫 소리 전에 받을 것도 없다.
import type { BuildKind, EnemyKind } from './config';
import { MusicPlayer, type MusicMood } from './music';

const MUTE_KEY = 'ij-muted';
const VOLUME_KEY = 'ij-volume';
const MUSIC_OFF_KEY = 'ij-music-off';
/** 음량 1 일 때 마스터 게인. 컴프레서가 겹친 소리를 눌러 주므로 약간 여유를 둔다 */
const MASTER_GAIN = 0.9;

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
    /* 프라이빗 모드 등 저장이 막히면 음소거는 이번 방문에만 유지된다 */
  }
}

function readVolume(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const value = raw === null ? 1 : Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

function writeVolume(value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(value));
  } catch {
    /* 저장이 막히면 음량은 이번 방문에만 유지된다 */
  }
}

function readMusicOn(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUSIC_OFF_KEY) !== '1';
  } catch {
    return true;
  }
}

function writeMusicOn(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.removeItem(MUSIC_OFF_KEY);
    else window.localStorage.setItem(MUSIC_OFF_KEY, '1');
  } catch {
    /* 저장이 막히면 BGM 설정은 이번 방문에만 유지된다 */
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* 무시하지 않고 예외를 던지는 브라우저가 있다. 어느 쪽이든 소리에는 영향 없음 */
  }
}

export type SimSound =
  | 'shotCannon'
  | 'shotArrow'
  | 'buildHit'
  | 'buildBroken'
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
  private level: number;
  private lastPlayed = new Map<string, number>();
  private heartbeatTimer: number | null = null;
  /** 최근 처치음 시각 — 한꺼번에 쓰러질 때 처치음을 줄여 삑삑거리지 않게 한다 */
  private recentKills: number[] = [];
  /** 전투 BGM — AudioContext 를 만들 때 함께 만든다 */
  private player: MusicPlayer | null = null;
  private musicOn: boolean;
  /** 판이 원하는 음악 분위기 (BGM 을 꺼 두었거나 아직 소리를 켜기 전에도 기억해 둔다) */
  private mood: MusicMood = 'off';

  constructor() {
    this.muted = readMuted();
    this.level = readVolume();
    this.musicOn = readMusicOn();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isMusicOn(): boolean {
    return this.musicOn;
  }

  /** 판 상황에 맞춰 BGM 분위기를 바꾼다. 매 틱 불러도 바뀔 때만 동작한다. */
  music(mood: MusicMood): void {
    this.mood = mood;
    this.player?.setMood(this.musicOn ? mood : 'off');
  }

  /** BGM 만 따로 켜고 끈다 (효과음은 그대로) */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    writeMusicOn(this.musicOn);
    this.music(this.mood);
    return this.musicOn;
  }

  /** 0~1 음량 (음소거와 별개로 기억한다) */
  get volume(): number {
    return this.level;
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_GAIN * this.level;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    writeMuted(value);
    this.applyGain();
  }

  /** 음량을 바꾼다. 음량을 올리면 음소거는 풀리고, 0 으로 내리면 음소거가 된다. */
  setVolume(value: number): void {
    const next = Math.min(1, Math.max(0, value));
    if (next > 0) {
      this.level = next;
      writeVolume(next);
      if (this.muted) this.setMuted(false);
    } else if (!this.muted) {
      this.setMuted(true);
    }
    this.applyGain();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** AudioContext 를 (한 번) 만들거나 다시 깨운다. 브라우저는 사용자 동작(탭·클릭) 안에서만
   *  소리를 켜 주므로 그런 이벤트에서 부른다. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      // 여러 소리가 한꺼번에 겹쳐도 찢어지지 않게 마스터 뒤에 컴프레서를 둔다
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.applyGain();
      // BGM 은 마스터를 거치므로 음량 슬라이더·음소거를 함께 따른다
      this.player = new MusicPlayer(this.ctx, this.master);
      // 소리를 켜기 전에 정해진 분위기가 있으면 이어서 튼다
      this.music(this.mood);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 게임을 떠날 때 부른다 — 심장박동을 멈추고 AudioContext 를 닫는다.
   *  다시 unlock() 하면 새로 만든다 (개발 모드 StrictMode 의 재마운트 대비). */
  dispose(): void {
    this.stopHeartbeat();
    this.player?.dispose();
    this.player = null;
    this.mood = 'off';
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  /** 3단계 뒤 해금한 스킬이 터질 때 — 무기마다 다른 소리 */
  skill(kind: BuildKind): void {
    if (!this.throttled('skill-' + kind, 120)) return;
    switch (kind) {
      case 'wall':
        // 목책 매복: 나무가 뚫고 나오는 둔탁한 찌르기
        this.noise(0.12, { gain: 0.24, filterFreq: 380 });
        this.tone(180, 0.1, 'triangle', { gain: 0.14, glideTo: 120 });
        break;
      case 'arrow':
        // 연사: 활 시위 세 번
        for (let i = 0; i < 3; i += 1) {
          this.noise(0.05, {
            gain: 0.12,
            filterFreq: 2600,
            filterType: 'highpass',
            delay: i * 0.06,
          });
        }
        break;
      case 'cannon':
        // 대장군전: 깊고 긴 포성
        this.noise(0.35, { gain: 0.3, filterFreq: 160 });
        this.tone(70, 0.45, 'sine', { gain: 0.24, glideTo: 35 });
        vibrate(30);
        break;
      case 'caltrop':
        // 가시 폭발: 쇳조각이 흩어지는 짤랑임
        [1800, 2300, 1500].forEach((f, i) =>
          this.tone(f, 0.08, 'triangle', { gain: 0.09, glideTo: f * 0.7, delay: i * 0.035 }),
        );
        break;
      case 'hwacha':
        // 신기전 일제: 불화살이 줄지어 솟는 쉿쉿 소리
        for (let i = 0; i < 5; i += 1) {
          this.noise(0.09, {
            gain: 0.1,
            filterFreq: 1800 + i * 200,
            filterType: 'bandpass',
            delay: i * 0.04,
          });
        }
        this.tone(300, 0.25, 'sawtooth', { gain: 0.08, glideTo: 900 });
        break;
    }
    vibrate(15);
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

  /** 수리: 망치질 세 번 */
  repair(): void {
    for (let i = 0; i < 3; i += 1) {
      this.noise(0.04, { gain: 0.2, filterFreq: 1800, filterType: 'bandpass', delay: i * 0.1 });
      this.tone(880, 0.05, 'triangle', { gain: 0.08, delay: i * 0.1 });
    }
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
      case 'shotArrow':
        // 가장 자주 나는 소리라 짧고 작게 — 시위 튕기는 바람 소리
        if (!this.throttled('shotArrow', 70)) return;
        this.noise(0.04, { gain: 0.07, filterFreq: 3000, filterType: 'highpass' });
        return;
      case 'buildHit':
        // 무기가 깎이는 둔탁한 나무 소리 — 여럿이 깎아도 자주 울리지 않게
        if (!this.throttled('buildHit', 220)) return;
        this.noise(0.05, { gain: 0.09, filterFreq: 500 });
        return;
      case 'buildBroken':
        // 무기가 부서지는 소리: 나무가 쪼개지고 무너진다
        this.noise(0.28, { gain: 0.3, filterFreq: 700 });
        this.tone(160, 0.3, 'sawtooth', { gain: 0.12, glideTo: 60 });
        vibrate(35);
        return;
      case 'chain':
        if (!this.throttled('chain', 30)) return;
        this.tone(900 + Math.random() * 200, 0.05, 'sawtooth', { gain: 0.12, glideTo: 500 });
        return;
      case 'kill': {
        if (!this.throttled('kill', 45)) return;
        // 최근 0.6초 안에 쓰러진 수만큼 작아진다 — 한꺼번에 몰려 쓰러질 때도 귀가 편하게
        const now = performance.now();
        this.recentKills = this.recentKills.filter((t) => now - t < 600);
        this.recentKills.push(now);
        const duck = 1 / Math.sqrt(this.recentKills.length);
        const freq = killFrequency(data?.kind);
        // 사각파 삑 소리 대신 짧은 타격 잡음 + 부드러운 삼각파
        this.noise(0.05, { gain: 0.12 * duck, filterFreq: freq * 2, filterType: 'bandpass' });
        this.tone(freq, 0.07, 'triangle', { gain: 0.11 * duck, glideTo: freq * 0.6 });
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
