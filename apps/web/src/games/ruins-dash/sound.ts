import type { RunEvent } from './engine';

/**
 * 짧은 효과음 — 음원 파일 없이 Web Audio 발진기로 만든다.
 * 브라우저 자동재생 정책 때문에 첫 클릭/키 입력 안에서 unlock() 을 불러야 소리가 난다.
 */
export class RunSound {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null; // 오디오를 못 쓰는 환경이면 조용히 진행
    }
  }

  play(event: RunEvent): void {
    if (this.muted || !this.ctx) return;
    switch (event) {
      case 'coin':
        this.tone(988, 0.05, 'square', 0.06);
        this.tone(1319, 0.08, 'square', 0.06, 0.05);
        break;
      case 'jump':
        this.sweep(330, 660, 0.14, 'triangle', 0.1);
        break;
      case 'slide':
        this.sweep(440, 180, 0.16, 'triangle', 0.09);
        break;
      case 'lane':
        this.tone(520, 0.03, 'sine', 0.04);
        break;
      case 'crash':
        this.sweep(200, 50, 0.5, 'sawtooth', 0.16);
        break;
      case 'item':
        // 올라가는 세 음
        this.tone(659, 0.07, 'square', 0.07);
        this.tone(880, 0.07, 'square', 0.07, 0.07);
        this.tone(1175, 0.12, 'square', 0.07, 0.14);
        break;
      case 'stumble':
        this.sweep(300, 120, 0.25, 'sawtooth', 0.12);
        this.sweep(90, 60, 0.35, 'triangle', 0.14, 0.05);
        break;
      case 'shield':
        this.sweep(1200, 300, 0.3, 'triangle', 0.12);
        break;
      case 'smash':
        this.sweep(160, 40, 0.18, 'sawtooth', 0.12);
        break;
      case 'turn':
        this.sweep(500, 900, 0.12, 'triangle', 0.08);
        break;
      case 'fall':
        this.sweep(700, 80, 0.9, 'triangle', 0.14);
        break;
      case 'close':
        // 휙 — 짧게 올라가는 두 음
        this.tone(1047, 0.05, 'triangle', 0.08);
        this.tone(1568, 0.08, 'triangle', 0.08, 0.05);
        break;
      case 'multUp':
        // 배율 상승 — 네 음 아르페지오
        this.tone(523, 0.07, 'square', 0.06);
        this.tone(659, 0.07, 'square', 0.06, 0.07);
        this.tone(784, 0.07, 'square', 0.06, 0.14);
        this.tone(1047, 0.14, 'square', 0.06, 0.21);
        break;
      case 'golden':
        // 반짝이는 다섯 음 — 황금 신전 입장
        [784, 988, 1175, 1568, 1976].forEach((f, i) =>
          this.tone(f, 0.12, 'triangle', 0.07, i * 0.07),
        );
        break;
      case 'goldenEnd':
        this.tone(1319, 0.08, 'triangle', 0.06);
        this.tone(988, 0.16, 'triangle', 0.06, 0.08);
        break;
      case 'collapse':
        // 쿠르릉 — 다리가 무너지기 시작하는 낮은 울림
        this.sweep(120, 40, 0.9, 'sawtooth', 0.15);
        this.sweep(70, 35, 0.9, 'triangle', 0.14, 0.1);
        break;
      case 'collapseEnd':
        this.tone(523, 0.08, 'triangle', 0.06);
        this.tone(784, 0.14, 'triangle', 0.06, 0.08);
        break;
      case 'ride':
        // 덜컹 — 올라타는 소리
        this.sweep(180, 90, 0.25, 'square', 0.08);
        this.sweep(300, 700, 0.3, 'triangle', 0.08, 0.15);
        break;
      case 'rideEnd':
        this.tone(698, 0.08, 'triangle', 0.06);
        this.tone(988, 0.14, 'triangle', 0.06, 0.08);
        break;
      case 'pursuit':
        // 쿵 — 바위가 달려드는 낮은 울림과 경고음
        this.sweep(110, 45, 0.55, 'sawtooth', 0.14);
        this.tone(740, 0.12, 'square', 0.07, 0.05);
        this.tone(740, 0.12, 'square', 0.07, 0.3);
        break;
      case 'pursuitEnd':
        this.tone(659, 0.08, 'square', 0.07);
        this.tone(880, 0.08, 'square', 0.07, 0.08);
        this.tone(1319, 0.2, 'square', 0.07, 0.16);
        break;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    this.sweep(freq, freq, dur, type, vol, delay);
  }

  private sweep(
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}
