import { CharacterAnimator, drawCharacter3d } from './character3d';
import type { Look } from './looks';
import { hex, rotY, Scene, v3, type Lighting } from './r3d';
import { TrailFx } from './trail';

/**
 * 상점 미리보기 — 제자리에서 달리는 캐릭터를 천천히 돌려 가며 보여 준다.
 * 게임 화면과 같은 렌더러를 쓰므로 실제로 보이는 모습 그대로다.
 */

const LIGHT: Lighting = {
  dir: { x: -0.4, y: 0.8, z: -0.45 },
  ambient: 0.55,
  diffuse: 0.6,
  tint: [1.05, 0.97, 0.88],
  fog: hex('#2a2030'),
  fogStart: 50,
  fogEnd: 60,
};

/** 미리보기에서 보이는 달리기 속도 — 달리기 효과가 뒤로 흘러가는 빠르기 */
const PREVIEW_SPEED = 5;

export class LookPreview {
  private anim = new CharacterAnimator();
  private trail = new TrailFx();
  private lastT: number | null = null;
  private lastTrail: Look['trail'] | null = null;

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, look: Look, t: number): void {
    const dt = this.lastT === null ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    if (look.trail !== this.lastTrail) {
      this.lastTrail = look.trail;
      this.trail.clear();
    }

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#3a2a3e');
    bg.addColorStop(1, '#1a1420');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // 발밑 둥근 받침
    ctx.fillStyle = 'rgba(255, 210, 120, 0.12)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.86, w * 0.3, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    const scene = new Scene(
      { pos: v3(0, 1.35, -3.6), pitch: 0.12, roll: 0, f: h * 1.35, cx: w / 2, cy: h * 0.58 },
      LIGHT,
    );
    // 뒷모습(게임에서 보이는 쪽)을 가운데 두고 좌우로 천천히 돌아본다 — 얼굴은 따로 없어서 앞은 안 보인다
    const turn = Math.sin(t * 0.6) * 1.5;
    scene.xform = (p) => rotY(p, turn);
    // 배율이 한 단계씩 올랐다가 처음으로 — 횃불 투구가 어떻게 바뀌는지 보인다
    const step = Math.floor((t * 0.6) % 5);
    drawCharacter3d(
      scene,
      v3(0, 0, 0),
      { pose: 'run', phase: this.anim.runPhase(8, t), jumpP: 0, intensity: 0.4, fallenT: 0 },
      0,
      this.anim,
      t,
      look,
      { heat: step / 4, top: step === 4, speed: 20, airborne: false },
    );
    this.trail.update(dt, look.trail, {
      x: 0,
      y: 0,
      speed: PREVIEW_SPEED,
      grounded: true,
      phase: this.anim.phase,
      boost: false,
      intensity: 0.4,
    });
    this.trail.draw(scene, look.trail, t, 0, 0);
    scene.render(ctx);
  }
}
