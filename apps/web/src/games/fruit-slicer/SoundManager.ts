/**
 * SoundManager — 효과음·배경음악을 Web Audio API 로 직접 합성한다 (오디오 파일 없음).
 *
 * 브라우저는 사용자 동작(클릭·터치) 전에는 소리를 막으므로, 버튼을 누를 때 unlock() 을 호출해
 * AudioContext 를 만들고 깨운다. 오디오를 쓸 수 없는 환경이면 조용히 아무것도 하지 않는다.
 */

export type SfxName =
  | 'swoosh'
  | 'slice'
  | 'bomb'
  | 'defuse'
  | 'miss'
  | 'combo'
  | 'fever'
  | 'feverEnd'
  | 'gameOver'
  | 'unlock'
  | 'click';

export interface SoundSettings {
  /** 전체 음소거 */
  muted: boolean;
  /** 효과음 크기 0 ~ 1 */
  sfxVolume: number;
  /** 배경음악 크기 0 ~ 1 */
  bgmVolume: number;
}

export const DEFAULT_SOUND: SoundSettings = { muted: false, sfxVolume: 0.7, bgmVolume: 0.4 };

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** 배경음악 한 마디 (16분음표 16칸) — 도리안 느낌의 가벼운 루프. null 은 쉼표 */
const BGM_LEAD: (number | null)[] = [
  0,
  null,
  7,
  null,
  10,
  12,
  null,
  10,
  7,
  null,
  5,
  null,
  7,
  null,
  3,
  null,
];
const BGM_BASS: (number | null)[] = [
  -24,
  null,
  null,
  null,
  -17,
  null,
  null,
  null,
  -19,
  null,
  null,
  null,
  -17,
  null,
  -14,
  null,
];
/** 마디마다 바꿔 끼는 화음 이동 (반음) */
const BGM_PROGRESSION = [0, 0, -4, -2];
const BGM_ROOT_HZ = 293.66; // D4

const midiRatio = (semitones: number) => 2 ** (semitones / 12);

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private settings: SoundSettings = { ...DEFAULT_SOUND };
  private lastPlayed = new Map<SfxName, number>();

  // 배경음악 스케줄러
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmNextTime = 0;
  private bgmFast = false;
  private paused = false;

  /** 사용자 동작 안에서 호출 — AudioContext 생성·재개 */
  unlock() {
    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.bgmBus = ctx.createGain();
      this.bgmBus.connect(this.master);
      this.noise = this.makeNoise(ctx);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended' && !this.paused) {
      this.ctx.resume().catch(() => {
        // 재개 실패는 다음 사용자 동작 때 다시 시도
      });
    }
  }

  apply(settings: SoundSettings) {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  /** 일시정지 — 모든 소리를 멈춘다 (배경음악 위치도 그대로 멈춤) */
  pause() {
    this.paused = true;
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    this.paused = false;
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  destroy() {
    this.stopBgm();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    // 새 AudioContext 는 시간이 0 부터 다시 시작하므로 이전 재생 기록을 비운다
    this.lastPlayed.clear();
    this.paused = false;
  }

  // ---------------- 효과음 ----------------

  play(name: SfxName) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running' || this.settings.muted) return;
    if (this.settings.sfxVolume <= 0) return;

    // 같은 소리가 한꺼번에 몰리면 시끄러우므로 최소 간격을 둔다
    const now = ctx.currentTime;
    const minGap = name === 'swoosh' ? 0.13 : name === 'slice' ? 0.035 : 0.05;
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'swoosh':
        this.noiseSweep(now, 0.14, 700, 3200, 0.18, 'bandpass');
        break;
      case 'slice':
        this.noiseSweep(now, 0.09, 2500, 900, 0.22, 'lowpass');
        this.tone(now, 'sine', 420, 140, 0.1, 0.18);
        break;
      case 'bomb':
        this.noiseSweep(now, 1.3, 900, 120, 0.9, 'lowpass');
        this.tone(now, 'sine', 90, 30, 0.9, 0.8);
        this.tone(now, 'square', 60, 35, 0.4, 0.15);
        break;
      case 'defuse':
        this.tone(now, 'triangle', 600, 1400, 0.15, 0.25);
        this.noiseSweep(now, 0.08, 4000, 6000, 0.1, 'highpass');
        break;
      case 'miss':
        this.tone(now, 'sine', 220, 80, 0.3, 0.35);
        break;
      case 'combo':
        this.arpeggio(now, [0, 4, 7, 12], 0.06, 'square', 0.08);
        break;
      case 'fever':
        this.arpeggio(now, [0, 4, 7, 12, 16, 19, 24], 0.07, 'square', 0.1);
        this.arpeggio(now + 0.02, [-12, -8, -5, 0, 4, 7, 12], 0.07, 'triangle', 0.08);
        break;
      case 'feverEnd':
        this.arpeggio(now, [7, 0, -5], 0.1, 'triangle', 0.14);
        break;
      case 'gameOver':
        this.arpeggio(now, [0, -5, -9, -12], 0.18, 'triangle', 0.18);
        break;
      case 'unlock':
        this.bell(now, 880, 0.2);
        this.bell(now + 0.12, 1320, 0.18);
        this.bell(now + 0.24, 1760, 0.14);
        break;
      case 'click':
        this.tone(now, 'square', 1200, 900, 0.03, 0.06);
        break;
    }
  }

  // ---------------- 배경음악 ----------------

  startBgm() {
    const ctx = this.ctx;
    if (!ctx || this.bgmTimer !== null) return;
    this.bgmStep = 0;
    this.bgmNextTime = ctx.currentTime + 0.1;
    // 가벼운 룩어헤드 스케줄러: 50ms 마다 0.2초 앞까지 음을 예약한다
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 50);
    this.scheduleBgm();
  }

  stopBgm() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  /** 피버 중엔 템포를 올린다 */
  setBgmFast(fast: boolean) {
    this.bgmFast = fast;
  }

  private scheduleBgm() {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const stepDur = 60 / (this.bgmFast ? 150 : 112) / 4;
    // 멈춰 있다 돌아오면 밀린 음을 한꺼번에 내지 않도록 현재 시각으로 당긴다
    if (this.bgmNextTime < ctx.currentTime - 0.05) this.bgmNextTime = ctx.currentTime + 0.05;
    while (this.bgmNextTime < ctx.currentTime + 0.2) {
      const idx = this.bgmStep % 16;
      const bar = Math.floor(this.bgmStep / 16) % BGM_PROGRESSION.length;
      const shift = BGM_PROGRESSION[bar] ?? 0;
      const lead = BGM_LEAD[idx];
      const bass = BGM_BASS[idx];
      if (lead !== null && lead !== undefined) {
        this.note(
          bus,
          this.bgmNextTime,
          BGM_ROOT_HZ * midiRatio(lead + shift),
          stepDur * 1.6,
          'square',
          0.05,
        );
      }
      if (bass !== null && bass !== undefined) {
        this.note(
          bus,
          this.bgmNextTime,
          BGM_ROOT_HZ * midiRatio(bass + shift),
          stepDur * 3.5,
          'triangle',
          0.16,
        );
      }
      // 박자마다 하이햇
      if (idx % 2 === 0) this.hat(bus, this.bgmNextTime, idx % 4 === 0 ? 0.05 : 0.025);
      this.bgmNextTime += stepDur;
      this.bgmStep += 1;
    }
  }

  // ---------------- 합성 도구 ----------------

  private applyVolumes() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.bgmBus) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.02);
    this.bgmBus.gain.setTargetAtTime(this.settings.bgmVolume * 0.6, t, 0.02);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private envelope(gain: GainNode, start: number, duration: number, peak: number) {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  /** 주파수가 from → to 로 미끄러지는 음 */
  private tone(
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    peak: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    this.envelope(gain, start, duration, peak);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** 필터 주파수가 움직이는 잡음 — 칼 바람소리, 폭발 등 */
  private noiseSweep(
    start: number,
    duration: number,
    fromHz: number,
    toHz: number,
    peak: number,
    type: BiquadFilterType,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + duration);
    const gain = ctx.createGain();
    this.envelope(gain, start, duration, peak);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + duration + 0.05);
  }

  /** C5 기준 반음 목록을 차례로 울린다 */
  private arpeggio(
    start: number,
    semitones: number[],
    step: number,
    type: OscillatorType,
    peak: number,
  ) {
    semitones.forEach((s, i) => {
      const f = 523.25 * midiRatio(s);
      this.tone(start + i * step, type, f, f, step * 2.2, peak);
    });
  }

  private bell(start: number, freq: number, peak: number) {
    this.tone(start, 'sine', freq, freq, 0.6, peak);
    this.tone(start, 'sine', freq * 2.01, freq * 2.01, 0.35, peak * 0.3);
  }

  private note(
    bus: GainNode,
    start: number,
    freq: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    this.envelope(gain, start, duration, peak);
    osc.connect(gain).connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private hat(bus: GainNode, start: number, peak: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    this.envelope(gain, start, 0.04, peak);
    src.connect(filter).connect(gain).connect(bus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + 0.06);
  }
}
