/**
 * 효과음 — 파일 없이 Web Audio 로 짧은 소리를 만든다.
 * 브라우저가 소리를 막거나 지원하지 않으면 조용히 넘어간다.
 */
type Kind =
  'eat' | 'kill' | 'die' | 'power' | 'streak' | 'shield' | 'feast' | 'bounty' | 'bountyClaim';

type Note = { freq: number; at: number; len: number; type?: OscillatorType; gain?: number };

const NOTES: Record<Kind, Note[]> = {
  eat: [{ freq: 880, at: 0, len: 0.05, type: 'triangle', gain: 0.04 }],
  kill: [
    { freq: 523, at: 0, len: 0.08 },
    { freq: 784, at: 0.08, len: 0.08 },
    { freq: 1047, at: 0.16, len: 0.2 },
  ],
  power: [
    { freq: 660, at: 0, len: 0.07 },
    { freq: 990, at: 0.06, len: 0.07 },
    { freq: 1320, at: 0.12, len: 0.15 },
  ],
  streak: [
    { freq: 523, at: 0, len: 0.1, type: 'square', gain: 0.05 },
    { freq: 659, at: 0.1, len: 0.1, type: 'square', gain: 0.05 },
    { freq: 784, at: 0.2, len: 0.1, type: 'square', gain: 0.05 },
    { freq: 1047, at: 0.3, len: 0.3, type: 'square', gain: 0.05 },
  ],
  shield: [
    { freq: 1200, at: 0, len: 0.08, type: 'triangle' },
    { freq: 600, at: 0.08, len: 0.2, type: 'triangle' },
  ],
  feast: [
    { freq: 1047, at: 0, len: 0.1 },
    { freq: 1319, at: 0.1, len: 0.1 },
    { freq: 1568, at: 0.2, len: 0.1 },
    { freq: 2093, at: 0.3, len: 0.3 },
  ],
  bounty: [
    { freq: 392, at: 0, len: 0.12, type: 'square', gain: 0.04 },
    { freq: 523, at: 0.12, len: 0.22, type: 'square', gain: 0.04 },
  ],
  bountyClaim: [
    { freq: 784, at: 0, len: 0.08, type: 'square', gain: 0.05 },
    { freq: 1047, at: 0.08, len: 0.08, type: 'square', gain: 0.05 },
    { freq: 1319, at: 0.16, len: 0.08, type: 'square', gain: 0.05 },
    { freq: 1568, at: 0.24, len: 0.08, type: 'square', gain: 0.05 },
    { freq: 2093, at: 0.32, len: 0.4, type: 'triangle', gain: 0.07 },
  ],
  die: [
    { freq: 330, at: 0, len: 0.15, type: 'sawtooth', gain: 0.06 },
    { freq: 220, at: 0.14, len: 0.2, type: 'sawtooth', gain: 0.06 },
    { freq: 140, at: 0.3, len: 0.35, type: 'sawtooth', gain: 0.06 },
  ],
};

/** 먹는 소리는 너무 자주 나지 않게 */
const EAT_GAP = 0.07;

let ctx: AudioContext | null = null;
let lastEat = 0;

export function playSound(kind: Kind, muted: boolean) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    if (kind === 'eat') {
      if (now - lastEat < EAT_GAP) return;
      lastEat = now;
    }
    for (const n of NOTES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      // 먹는 소리는 높낮이를 조금씩 바꿔 덜 지루하게
      osc.frequency.value = kind === 'eat' ? n.freq * (0.9 + Math.random() * 0.4) : n.freq;
      const peak = n.gain ?? 0.08;
      gain.gain.setValueAtTime(peak, now + n.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.len + 0.02);
    }
  } catch {
    // 소리는 없어도 게임은 계속된다
  }
}
