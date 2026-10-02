/**
 * 캣 블레이드 — 효과음·배경음악을 Web Audio API 로 직접 합성한다 (오디오 파일 없음).
 *
 * 브라우저는 사용자 동작 전에는 소리를 막으므로, 버튼을 누를 때 unlock() 으로 AudioContext 를 깨운다.
 * 오디오를 쓸 수 없는 환경이면 조용히 아무것도 하지 않는다.
 */

export type SfxName =
  | 'slash'
  | 'heavy'
  | 'fire'
  | 'neon'
  | 'hit'
  | 'bigHit'
  | 'parry'
  | 'roll'
  | 'jump'
  | 'form'
  | 'skill'
  | 'hurt'
  | 'enemyDie'
  | 'roar'
  | 'boom'
  | 'laser'
  | 'charge'
  | 'warning'
  | 'missile'
  | 'clank'
  | 'break'
  | 'pickup'
  | 'clear'
  | 'victory'
  | 'gameover'
  | 'select'
  | 'meow';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const MUTE_KEY = 'simsim:cat-blade:muted:v1';

/** 트랙별 배경음 (반음 단위, null = 쉼표) — 16분음표 16칸. 1~3 = 스테이지, 4~6 = 보스전 */
const BGM: Record<
  number,
  { root: number; lead: (number | null)[]; bass: (number | null)[]; bpm: number }
> = {
  1: {
    root: 57,
    bpm: 132,
    lead: [12, null, 15, null, 17, 15, 12, null, 10, null, 12, 15, null, 12, 10, 7],
    bass: [0, null, 0, 12, 0, null, 0, 12, -4, null, -4, 8, -2, null, -2, 10],
  },
  2: {
    root: 55,
    bpm: 140,
    lead: [12, 12, 19, 12, 17, 12, 15, 14, 12, 12, 19, 12, 20, 19, 17, 15],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, -3, -3, 9, -3, -5, -5, 7, -5],
  },
  3: {
    root: 52,
    bpm: 120,
    lead: [12, null, 13, 12, null, 8, 7, null, 12, null, 13, 15, 13, 12, 8, null],
    bass: [0, 0, 0, 0, 1, 1, 1, 1, -4, -4, -4, -4, -5, -5, -1, -1],
  },
  4: {
    root: 50,
    bpm: 168,
    lead: [12, null, 15, 12, 17, null, 15, 12, 18, 17, 15, 12, 10, null, 12, 15],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 15, 3, -2, -2, 10, -2],
  },
  5: {
    root: 52,
    bpm: 174,
    lead: [12, 15, 19, 15, 12, 15, 20, 19, 12, 15, 19, 22, 20, 19, 15, 14],
    bass: [0, 12, 0, 12, 0, 12, 0, 12, -4, 8, -4, 8, -2, 10, -2, 10],
  },
  6: {
    root: 49,
    bpm: 182,
    lead: [12, 13, 12, 19, null, 18, 19, 13, 12, null, 16, 15, 13, null, 12, 11],
    bass: [0, 0, 12, 0, 1, 1, 13, 1, 0, 0, 12, 0, -1, -1, 11, -1],
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
        this.sfxBus.gain.value = 0.5;
        this.sfxBus.connect(this.master);
        this.bgmBus = ctx.createGain();
        this.bgmBus.gain.value = 0.13;
        this.bgmBus.connect(this.master);
        // 타격·폭발음용 화이트 노이즈 1초
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
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const minGap: Partial<Record<SfxName, number>> = {
      hit: 0.04,
      neon: 0.05,
      enemyDie: 0.05,
      boom: 0.06,
      missile: 0.08,
      laser: 0.15,
    };
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < (minGap[name] ?? 0.02)) return;
    this.lastPlay.set(name, now);

    try {
      switch (name) {
        case 'slash':
          this.burst(0.09, 6000, 0.35, 'highpass', 1800);
          this.tone('triangle', 900, 300, 0.07, 0.08);
          break;
        case 'heavy':
          this.burst(0.2, 2500, 0.45, 'bandpass', 700);
          this.tone('sawtooth', 220, 60, 0.18, 0.14);
          break;
        case 'fire':
          this.burst(0.25, 3000, 0.3, 'bandpass', 900);
          this.tone('sawtooth', 300, 120, 0.2, 0.06);
          break;
        case 'neon':
          this.tone('square', 1400, 700, 0.06, 0.06);
          this.tone('sine', 2200, 1800, 0.05, 0.05);
          break;
        case 'hit':
          this.burst(0.07, 4000, 0.4);
          this.tone('square', 260, 120, 0.06, 0.08);
          break;
        case 'bigHit':
          this.burst(0.18, 3000, 0.6);
          this.tone('sawtooth', 160, 40, 0.18, 0.2);
          break;
        case 'parry':
          // 금속성 '팅' + 고음 반짝임
          this.tone('triangle', 2400, 2200, 0.35, 0.22);
          this.tone('sine', 3600, 3500, 0.5, 0.12);
          this.tone('square', 1200, 900, 0.08, 0.08);
          this.burst(0.08, 8000, 0.35, 'highpass', 3000);
          break;
        case 'roll':
          this.burst(0.14, 1500, 0.2, 'bandpass', 600);
          break;
        case 'jump':
          this.tone('square', 380, 760, 0.08, 0.05);
          break;
        case 'form':
          [0, 7, 12, 16, 19].forEach((s, i) =>
            this.note(72 + s, now + i * 0.035, 0.12, 'triangle', 0.16),
          );
          break;
        case 'skill':
          this.tone('sawtooth', 200, 900, 0.18, 0.1);
          this.burst(0.3, 2000, 0.3, 'bandpass', 1200);
          break;
        case 'hurt':
          this.tone('square', 520, 140, 0.22, 0.14);
          this.burst(0.12, 2500, 0.35);
          break;
        case 'enemyDie':
          this.burst(0.3, 1800, 0.45);
          this.tone('square', 600, 80, 0.25, 0.1);
          break;
        case 'roar':
          this.tone('sawtooth', 110, 60, 0.9, 0.3);
          this.tone('sawtooth', 116, 58, 0.9, 0.2);
          this.burst(0.9, 600, 0.5);
          break;
        case 'boom':
          this.burst(0.6, 900, 0.7);
          this.tone('sine', 90, 30, 0.5, 0.45);
          break;
        case 'laser':
          this.tone('sawtooth', 1600, 300, 0.5, 0.1);
          this.tone('square', 800, 160, 0.5, 0.06);
          break;
        case 'charge':
          this.tone('sawtooth', 120, 900, 0.5, 0.07);
          break;
        case 'warning':
          for (let i = 0; i < 3; i++) {
            this.note(69, now + i * 0.5, 0.24, 'sawtooth', 0.16);
            this.note(62, now + i * 0.5 + 0.25, 0.24, 'sawtooth', 0.16);
          }
          break;
        case 'missile':
          this.burst(0.25, 2400, 0.25, 'bandpass', 1500);
          this.tone('sine', 300, 900, 0.2, 0.05);
          break;
        case 'clank':
          this.tone('square', 1800, 1500, 0.1, 0.1);
          this.tone('triangle', 900, 880, 0.2, 0.1);
          break;
        case 'break':
          this.burst(0.5, 5000, 0.6);
          [12, 7, 3, 0].forEach((s, i) => this.note(60 + s, now + i * 0.06, 0.14, 'square', 0.14));
          break;
        case 'pickup':
          [0, 4, 7, 12].forEach((s, i) => this.note(76 + s, now + i * 0.05, 0.1, 'triangle', 0.16));
          break;
        case 'clear':
          [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) =>
            this.note(67 + s, now + i * 0.1, 0.16, 'square', 0.12),
          );
          break;
        case 'victory':
          [0, 4, 7, 12, 16, 19, 24, 19, 24, 28, 31].forEach((s, i) =>
            this.note(60 + s, now + i * 0.11, 0.22, 'square', 0.12),
          );
          break;
        case 'gameover':
          [7, 3, 0, -5].forEach((s, i) => this.note(60 + s, now + i * 0.28, 0.4, 'triangle', 0.2));
          break;
        case 'select':
          this.tone('square', 660, 990, 0.08, 0.08);
          break;
        case 'meow':
          // 짧은 '냐옹' — 주파수가 올라갔다 내려간다
          this.meow();
          break;
      }
    } catch {
      // 오디오 노드 생성 실패는 게임 진행에 영향 없도록 무시
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

  private meow() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    f.type = 'bandpass';
    f.Q.value = 3;
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.35);
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(f).connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private burst(
    dur: number,
    cutoff: number,
    vol: number,
    type: BiquadFilterType = 'lowpass',
    endFreq = 80,
  ) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random() * 0.5);
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

  /** track: 1~3 = 스테이지, 4~6 = 스테이지별 보스전 */
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
    // 탭이 오래 멈췄다 돌아오면 밀린 음을 한꺼번에 몰아 치지 않도록 건너뛴다
    if (this.bgmNext < ctx.currentTime - 0.5) this.bgmNext = ctx.currentTime + 0.05;
    const stepDur = 60 / song.bpm / 4;
    try {
      while (this.bgmNext < ctx.currentTime + 0.2) {
        const i = this.bgmStep % 16;
        const lead = song.lead[i];
        const bass = song.bass[i];
        if (lead !== null && lead !== undefined) {
          this.note(song.root + lead, this.bgmNext, stepDur * 0.85, 'square', 0.3, this.bgmBus);
        }
        if (bass !== null && bass !== undefined) {
          this.note(
            song.root - 12 + bass,
            this.bgmNext,
            stepDur * 0.8,
            'triangle',
            0.6,
            this.bgmBus,
          );
        }
        // 4박마다 킥 느낌의 저음
        if (i % 4 === 0) this.note(song.root - 24, this.bgmNext, 0.08, 'sine', 0.7, this.bgmBus);
        this.bgmNext += stepDur;
        this.bgmStep += 1;
      }
    } catch {
      this.stopBgm();
    }
  }
}
