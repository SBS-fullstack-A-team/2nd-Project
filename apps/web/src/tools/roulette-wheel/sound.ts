/**
 * 효과음 — 파일 없이 Web Audio 로 짧게 만든다.
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로 '돌리기'를 누를 때 unlockSound() 를 부른다.
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

/** 바늘이 칸 경계를 지날 때 '딱' */
export function playTick(): void {
  tone(1500, 0, 0.03, 0.08, 'square');
}

/** 당첨 발표 */
export function playFanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35));
  tone(1319, 0.48, 0.5, 0.12);
}
