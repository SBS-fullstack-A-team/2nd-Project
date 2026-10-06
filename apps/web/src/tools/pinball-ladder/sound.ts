import type { BoardEvent } from './board';

/**
 * 효과음 — 파일 없이 Web Audio 로 짧게 만든다.
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로 '시작' 버튼을 누를 때 unlockSound() 를 부른다.
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

/** 핀 소리는 음 높이를 조금씩 바꿔 '또로롱' 느낌을 낸다 */
const PEG_NOTES = [784, 880, 988, 1175, 1319];
let pegNote = 0;

export function playEvent(event: BoardEvent): void {
  switch (event.kind) {
    case 'drop':
      tone(330, 0, 0.12, 0.12, 'square');
      tone(494, 0.06, 0.12, 0.1, 'square');
      break;
    case 'peg':
      pegNote = (pegNote + 1 + Math.floor(Math.random() * 2)) % PEG_NOTES.length;
      tone(PEG_NOTES[pegNote]!, 0, 0.08, 0.05 + (event.strength ?? 0.5) * 0.06, 'sine');
      break;
    case 'land':
      tone(523, 0, 0.14, 0.14);
      tone(784, 0.08, 0.14, 0.14);
      tone(1047, 0.16, 0.3, 0.14);
      break;
  }
}

/** 마지막 공까지 들어갔을 때 */
export function playFanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35));
}
