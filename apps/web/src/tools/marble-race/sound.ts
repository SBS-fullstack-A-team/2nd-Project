import type { RaceEventKind } from './race';

/**
 * 효과음 — 파일 없이 Web Audio 로 짧게 만든다.
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로 '출발' 버튼을 누를 때 unlockSound() 를 부른다.
 */
let ctx: AudioContext | null = null;

export function unlockSound(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // 오디오를 못 쓰는 환경 — 소리 없이 진행
  }
}

function tone(
  freq: number,
  startIn: number,
  duration: number,
  volume = 0.15,
  type: OscillatorType = 'triangle',
): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + startIn;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** 신호등 빨간불 (출발 신호는 playEvent('start')) */
export function playCountdown(go: boolean): void {
  tone(go ? 880 : 440, 0, go ? 0.5 : 0.18, 0.18, 'square');
}

/** 중계 자막이 뜰 때 */
export function playEvent(kind: RaceEventKind): void {
  switch (kind) {
    case 'start':
      playCountdown(true);
      break;
    case 'lead':
      tone(660, 0, 0.12, 0.1);
      tone(990, 0.08, 0.16, 0.1);
      break;
    case 'hole':
      tone(220, 0, 0.25, 0.14, 'sawtooth');
      tone(140, 0.1, 0.3, 0.12, 'sawtooth');
      break;
    case 'finish':
      tone(1320, 0, 0.18, 0.12);
      break;
    case 'photo':
      tone(1800, 0, 0.05, 0.15, 'square');
      break;
  }
}

/** 결과 발표 팡파르 */
export function playFanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35));
}
