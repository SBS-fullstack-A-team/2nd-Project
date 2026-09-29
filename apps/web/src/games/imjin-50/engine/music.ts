// 임진 50 전투 BGM. 효과음처럼 음원 파일 없이 Web Audio 로 합성한다.
// 계면조 느낌의 D 단조 5음(레·파·솔·라·도)으로 태평소 가락을 짜고, 북·장구로 장단을 친다.
// 판 상황(정비 / 공세 / 왜장 공세)에 따라 분위기를 바꾸고, 멈추면 서서히 꺼진다.

/** 지금 판 상황에 맞춘 음악 분위기. off 면 서서히 꺼진다. */
export type MusicMood = 'off' | 'calm' | 'battle' | 'boss';
type PlayingMood = Exclude<MusicMood, 'off'>;

/** 음악 전체 크기 (효과음보다 한 발 물러서게) */
const MUSIC_GAIN = 0.55;
const STEPS_PER_BAR = 16;
const BARS = 4;
const TEMPO: Record<PlayingMood, number> = { calm: 88, battle: 116, boss: 132 };
const ROOT = 293.66; // 레 (D4)
/** 레 파 솔 라 도 레' 파' (반음 수) */
const SCALE = [0, 3, 5, 7, 10, 12, 15];

/** [마디 안 16분음표 위치, 음계 번호, 길이(16분음표 수)] — 네 마디 가락 */
type Note = readonly [at: number, degree: number, length: number];
const MELODY: readonly (readonly Note[])[] = [
  [
    [0, 3, 4],
    [4, 2, 2],
    [6, 3, 2],
    [8, 4, 4],
    [12, 3, 2],
    [14, 2, 2],
  ],
  [
    [0, 1, 4],
    [4, 2, 2],
    [6, 1, 2],
    [8, 0, 6],
  ],
  [
    [0, 5, 3],
    [3, 4, 1],
    [4, 3, 4],
    [8, 2, 2],
    [10, 3, 2],
    [12, 4, 4],
  ],
  [
    [0, 5, 6],
    [6, 4, 2],
    [8, 3, 4],
    [12, 2, 2],
    [14, 1, 2],
  ],
];

/** 분위기별 장단 — 북(큰 북), 장구 덩(양손), 기덕(채편만) 을 치는 16분음표 위치 */
const RHYTHM: Record<
  PlayingMood,
  { buk: readonly number[]; deong: readonly number[]; gidEok: readonly number[] }
> = {
  calm: { buk: [0], deong: [8], gidEok: [12] },
  battle: { buk: [0, 6, 8, 11], deong: [0, 8], gidEok: [2, 4, 10, 12, 14] },
  boss: { buk: [0, 3, 6, 8, 11, 14], deong: [0, 4, 8, 12], gidEok: [2, 6, 10, 14, 15] },
};

function noteFreq(degree: number, octave: number): number {
  return ROOT * Math.pow(2, (SCALE[degree]! + octave * 12) / 12);
}

/** 잔향으로 보내는 양 */
const REVERB_WET = 0.32;

/** 잔향용 임펄스 응답 — 점점 잦아드는 스테레오 잡음 (파일 없이 만든다) */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buffer;
}

/** 사람이 치고 부는 느낌 — 박을 몇 ms 흔들고 세기를 조금씩 다르게 한다 */
function humanize(t: number, ms = 9): number {
  return t + ((Math.random() * 2 - 1) * ms) / 1000;
}

function velocity(base = 1): number {
  return base * (0.82 + Math.random() * 0.18);
}

export class MusicPlayer {
  private readonly bus: GainNode;
  private mood: MusicMood = 'off';
  private timer: number | null = null;
  private stopTimer: number | null = null;
  /** 다음에 예약할 16분음표의 시각(AudioContext 기준)과 네 마디 안 위치 */
  private nextStepTime = 0;
  private step = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.connect(destination);
    // 잔향: 소리가 넓은 들판에 퍼지는 느낌을 더해 합성음 특유의 건조함을 덜어낸다
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_WET;
    this.reverb.connect(wet);
    wet.connect(this.bus);
  }

  private readonly reverb: ConvolverNode;

  /** 가락·장구는 마른 소리와 함께 잔향으로도 보낸다 */
  private out(node: AudioNode, send = 1): void {
    node.connect(this.bus);
    if (send > 0) {
      const amount = this.ctx.createGain();
      amount.gain.value = send;
      node.connect(amount);
      amount.connect(this.reverb);
    }
  }

  /** 분위기를 바꾼다. 매 틱 불러도 바뀔 때만 동작한다. */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === 'off') {
      this.fadeOut();
      return;
    }
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.rampTo(MUSIC_GAIN, 0.6);
    if (this.timer === null) {
      // 멈춰 있었다면 마디 첫 박부터 다시 시작한다
      this.step = 0;
      this.nextStepTime = this.ctx.currentTime + 0.08;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  dispose(): void {
    this.mood = 'off';
    this.stopScheduler();
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.bus.disconnect();
  }

  private rampTo(value: number, seconds: number): void {
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), now);
    this.bus.gain.linearRampToValueAtTime(Math.max(0.0001, value), now + seconds);
  }

  private fadeOut(): void {
    this.rampTo(0, 0.5);
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => {
      this.stopTimer = null;
      this.stopScheduler();
    }, 600);
  }

  private stopScheduler(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** 앞으로 0.15초 안에 올 16분음표를 미리 예약한다 — 화면이 잠깐 버벅여도 박이 밀리지 않게 */
  private schedule(): void {
    if (this.mood === 'off') return;
    const mood = this.mood;
    const stepDur = 60 / TEMPO[mood] / 4;
    const now = this.ctx.currentTime;
    // 탭을 오래 떠났다 돌아오면 밀린 박을 몰아치지 않고 지금부터 다시 맞춘다
    if (this.nextStepTime < now - 0.2) this.nextStepTime = now + 0.05;
    while (this.nextStepTime < now + 0.15) {
      this.playStep(mood, this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS);
    }
  }

  private playStep(mood: PlayingMood, step: number, t: number, stepDur: number): void {
    const inBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const rhythm = RHYTHM[mood];
    const soft = mood === 'calm' ? 0.6 : 1;
    if (rhythm.buk.includes(inBar))
      this.buk(humanize(t, 5), velocity(inBar === 0 ? 1 : 0.75) * soft);
    if (rhythm.deong.includes(inBar)) this.janggu(humanize(t), true, velocity(soft));
    if (rhythm.gidEok.includes(inBar)) this.janggu(humanize(t), false, velocity(0.85 * soft));
    // 마디 첫 박마다 레·라 지속음을 깐다
    if (inBar === 0) this.drone(t, stepDur * STEPS_PER_BAR, soft);
    // 정비 시간에는 가락 없이 장단만 잔잔하게
    if (mood === 'calm') return;
    // 왜장 공세는 가락을 한 옥타브 올려 긴박하게
    const octave = mood === 'boss' ? 0 : -1;
    for (const [at, degree, length] of MELODY[bar]!) {
      if (at !== inBar) continue;
      // 마디 첫 음은 힘주어, 나머지는 세기를 조금씩 다르게
      const strength = velocity(at === 0 ? 1 : 0.9);
      this.reed(noteFreq(degree, octave), humanize(t, 12), length * stepDur, strength);
    }
  }

  /** 큰 북: 아래로 떨어지는 낮은 사인 + 가죽 울림 잡음 */
  private buk(t: number, strength: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.5);
    this.noise(t, 0.08, 0.12 * strength, 400, 'lowpass');
  }

  /** 장구: 덩(둥근 북편 + 채편) 또는 기덕(채편만 딱) */
  private janggu(t: number, deong: boolean, strength: number): void {
    if (deong) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(env);
      this.out(env, 0.5);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    this.noise(t, 0.05, (deong ? 0.1 : 0.08) * strength, 2400, 'bandpass');
  }

  /** 낮게 깔리는 레·라 지속음 (한 마디 길이) */
  private drone(t: number, duration: number, strength: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // 윙 하는 전자음처럼 들리지 않게 작고 어둡게
    filter.frequency.value = 260;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.03 * strength, t + 0.4);
    env.gain.setValueAtTime(0.03 * strength, t + duration - 0.25);
    env.gain.linearRampToValueAtTime(0.0001, t + duration);
    filter.connect(env);
    env.connect(this.bus);
    for (const freq of [ROOT / 4, (ROOT / 4) * 1.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  /**
   * 태평소 느낌의 가락. 사각파 하나는 기계음처럼 들려서, 살짝 어긋난 톱니파 둘을 겹치고
   * (합창 효과) 부는 세기에 따라 밝기가 부풀었다 가라앉게 하고, 숨소리를 섞는다.
   * 떨림은 음 머리보다 조금 늦게, 음마다 속도를 달리해 사람이 부는 것처럼 만든다.
   */
  private reed(freq: number, t: number, duration: number, strength: number): void {
    const end = t + duration;
    const peak = 0.085 * strength;

    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 1.4;
    // 불어 넣는 순간 밝아졌다가 음이 이어지며 조금 어두워진다
    tone.frequency.setValueAtTime(600, t);
    tone.frequency.linearRampToValueAtTime(2300 * strength, t + 0.07);
    tone.frequency.linearRampToValueAtTime(1500, t + Math.min(duration, 0.4));

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    env.gain.setValueAtTime(peak * 0.85, t + Math.max(0.06, duration - 0.08));
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    tone.connect(env);
    this.out(env, 0.9);

    // 떨림: 음 머리 뒤 0.15초부터 서서히, 속도는 음마다 조금씩 다르게
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 4.8 + Math.random() * 1.2;
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + Math.min(0.15, duration * 0.4));
    depth.gain.linearRampToValueAtTime(freq * 0.014, t + Math.min(0.45, duration));
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(end + 0.12);

    for (const detune of [-6, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      // 음 머리를 아래에서 밀어 올려 부는 느낌, 긴 음은 끝을 살짝 꺾어 내린다
      osc.frequency.setValueAtTime(freq * 0.96, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      if (duration > 0.3) {
        osc.frequency.setValueAtTime(freq, t + duration * 0.8);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.965, end);
      }
      depth.connect(osc.frequency);
      osc.connect(tone);
      osc.start(t);
      osc.stop(end + 0.12);
    }

    // 숨소리: 음 머리에 조금, 이어지는 동안 아주 약하게
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * (duration + 0.1)));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const breath = this.ctx.createBufferSource();
    breath.buffer = buffer;
    const breathTone = this.ctx.createBiquadFilter();
    breathTone.type = 'bandpass';
    breathTone.frequency.value = freq * 4;
    breathTone.Q.value = 0.8;
    const breathEnv = this.ctx.createGain();
    breathEnv.gain.setValueAtTime(0.0001, t);
    breathEnv.gain.exponentialRampToValueAtTime(0.03 * strength, t + 0.03);
    breathEnv.gain.exponentialRampToValueAtTime(0.008 * strength, t + 0.15);
    breathEnv.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    breath.connect(breathTone);
    breathTone.connect(breathEnv);
    this.out(breathEnv, 0.6);
    breath.start(t);
    breath.stop(end + 0.1);
  }

  private noise(
    t: number,
    duration: number,
    gain: number,
    freq: number,
    type: BiquadFilterType,
  ): void {
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }
}
