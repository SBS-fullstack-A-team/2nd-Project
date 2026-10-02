/**
 * 효과음 — 파일 없이 Web Audio 로 짧게 만든다.
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로 '출발' 버튼을 누를 때 unlock() 을 부른다.
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

function tone(freq: number, startIn: number, duration: number, volume = 0.15): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + startIn;
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** 카운트다운 삑 (마지막 출발 신호는 높게) */
export function playCountdown(go: boolean): void {
  tone(go ? 880 : 440, 0, go ? 0.4 : 0.15);
}

/** 구슬 도착 */
export function playArrival(): void {
  tone(1320, 0, 0.12, 0.08);
}

/** 결과 발표 팡파르 */
export function playFanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35));
}
