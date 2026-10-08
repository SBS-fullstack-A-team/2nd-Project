/**
 * 캣 블레이드 — 주인공 고양이 (Player) 와 폼 관리 (CatFormManager)
 *
 * 상태: normal(이동) / attack / skill / roll(무적 구르기) / parry(패링 자세) / hurt / dead
 * 판정: hurtbox() 는 맞는 영역, 공격은 world.addHitbox() 로 짧게 살아 있는 판정을 만든다.
 */
import {
  ARENA_L,
  ARENA_R,
  FORMS,
  FORM_COOLDOWN,
  GRAVITY,
  GROUND_Y,
  MAX_FALL,
  PARRY_COOLDOWN,
  PARRY_IFRAME,
  PARRY_POSE,
  PLATFORMS,
  PLAYER_H,
  PLAYER_MAX_HP,
  PLAYER_W,
  HURT_IFRAME,
  UPGRADE_HP_BONUS,
  getForm,
  ROLL_COOLDOWN,
  ROLL_IFRAME,
  ROLL_SEC,
  ROLL_SPEED,
  type FormDef,
  type FormId,
} from './config';
import { Beam, FIRE_WAVE_COLOR, Projectile, type World } from './entities';
import type { CatPose, CatPoseName } from './renderCat';
import type { SfxName } from './sound';
import { TAU, approach, clamp, lerp, rand, type Rect } from './util';

/* ---------------- 입력 ---------------- */

export type Action =
  | 'left'
  | 'right'
  | 'down'
  | 'jump'
  | 'attack'
  | 'skill'
  | 'roll'
  | 'parry'
  | 'formPrev'
  | 'formNext'
  | 'form1'
  | 'form2'
  | 'form3'
  | 'form4'
  | 'form5';

export interface InputSource {
  held(a: Action): boolean;
  /** 최근 INPUT_BUFFER 초 안에 눌렸고 아직 쓰지 않은 입력 */
  pressed(a: Action): boolean;
  consume(a: Action): void;
}

/* ---------------- 폼 관리 ---------------- */

export class CatFormManager {
  index = 0;
  /** 각성한 폼 (이스터에그로 시작했을 때만) */
  upgraded: FormId | null = null;
  /** 변신 재사용 대기 */
  cooldown = 0;
  /** 스킬 재사용 대기 — 폼마다 따로 돈다 */
  skillCd: Record<FormId, number> = { ninja: 0, knight: 0, fire: 0, cheese: 0, cyber: 0 };

  get def(): FormDef {
    return this.defAt(this.index);
  }

  /** 슬롯 i 의 폼 정의 — 각성한 폼이면 각성 버전 */
  defAt(i: number): FormDef {
    const base = FORMS[i] as FormDef;
    return getForm(base.id, base.id === this.upgraded);
  }

  get id(): FormId {
    return this.def.id;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const f of FORMS) this.skillCd[f.id] = Math.max(0, this.skillCd[f.id] - dt);
  }

  /** 변신 — 성공하면 true */
  switchTo(i: number): boolean {
    const n = FORMS.length;
    const next = ((i % n) + n) % n;
    if (next === this.index || this.cooldown > 0) return false;
    this.index = next;
    this.cooldown = FORM_COOLDOWN;
    return true;
  }

  skillReady() {
    return this.skillCd[this.id] <= 0;
  }

  useSkill() {
    this.skillCd[this.id] = this.def.skillCooldown;
  }
}

/* ---------------- 기본 공격 표 ---------------- */

interface AttackStep {
  kind: 'melee' | 'shot';
  dur: number;
  /** 판정이 나오는 시점 */
  hitAt: number;
  dmg: number;
  /** 근접 판정 사각형 (발 기준, 앞쪽으로 ox 떨어진 곳부터 w) */
  w: number;
  h: number;
  ox: number;
  oy: number;
  knock: number;
  launch: number;
  hitstop: number;
  shake: number;
  /** 휘두르며 앞으로 내딛는 속도 */
  lunge: number;
  sfx: SfxName;
}

const melee = (o: Partial<AttackStep> & Pick<AttackStep, 'dur' | 'hitAt' | 'dmg'>): AttackStep => ({
  kind: 'melee',
  w: 70,
  h: 56,
  ox: 4,
  oy: -54,
  knock: 140,
  launch: 0,
  hitstop: 0.045,
  shake: 2,
  lunge: 120,
  sfx: 'slash',
  ...o,
});

const shot = (o: Pick<AttackStep, 'dur' | 'hitAt' | 'dmg' | 'sfx'>): AttackStep => ({
  kind: 'shot',
  w: 0,
  h: 0,
  ox: 0,
  oy: 0,
  knock: 90,
  launch: 0,
  hitstop: 0.03,
  shake: 1,
  lunge: 0,
  ...o,
});

const ATTACKS: Record<FormId, AttackStep[]> = {
  ninja: [
    melee({ dur: 0.22, hitAt: 0.05, dmg: 9 }),
    melee({ dur: 0.22, hitAt: 0.05, dmg: 9 }),
    melee({
      dur: 0.36,
      hitAt: 0.08,
      dmg: 17,
      w: 96,
      knock: 340,
      hitstop: 0.07,
      shake: 5,
      lunge: 280,
    }),
  ],
  knight: [
    melee({
      dur: 0.56,
      hitAt: 0.26,
      dmg: 30,
      w: 104,
      h: 100,
      ox: -6,
      oy: -96,
      knock: 320,
      hitstop: 0.08,
      shake: 7,
      lunge: 80,
      sfx: 'heavy',
    }),
    melee({
      dur: 0.6,
      hitAt: 0.28,
      dmg: 36,
      w: 110,
      h: 100,
      ox: -6,
      oy: -96,
      knock: 380,
      launch: 200,
      hitstop: 0.09,
      shake: 8,
      lunge: 120,
      sfx: 'heavy',
    }),
  ],
  fire: [
    shot({ dur: 0.3, hitAt: 0.08, dmg: 12, sfx: 'fire' }),
    shot({ dur: 0.3, hitAt: 0.08, dmg: 12, sfx: 'fire' }),
  ],
  cheese: [
    melee({
      dur: 0.66,
      hitAt: 0.34,
      dmg: 40,
      w: 118,
      h: 92,
      ox: -4,
      oy: -90,
      knock: 460,
      launch: 380,
      hitstop: 0.1,
      shake: 10,
      lunge: 60,
      sfx: 'heavy',
    }),
  ],
  cyber: [
    shot({ dur: 0.17, hitAt: 0.04, dmg: 7, sfx: 'neon' }),
    shot({ dur: 0.17, hitAt: 0.04, dmg: 7, sfx: 'neon' }),
    shot({ dur: 0.26, hitAt: 0.05, dmg: 8, sfx: 'neon' }),
  ],
};

/** 각성 폼 전용 기본 공격 (없으면 기본 표를 쓰고 피해만 배율로 오른다) */
const UP_ATTACKS: Partial<Record<FormId, AttackStep[]>> = {
  // 사무라이 — 4연속 발도, 마지막은 길게 뻗는 일섬
  ninja: [
    melee({ dur: 0.2, hitAt: 0.045, dmg: 9, w: 80 }),
    melee({ dur: 0.2, hitAt: 0.045, dmg: 9, w: 80 }),
    melee({ dur: 0.22, hitAt: 0.05, dmg: 11, w: 86, knock: 180 }),
    melee({
      dur: 0.38,
      hitAt: 0.08,
      dmg: 20,
      w: 132,
      h: 64,
      knock: 380,
      hitstop: 0.08,
      shake: 6,
      lunge: 340,
    }),
  ],
};

/** 스킬 동작 전체 시간 */
const SKILL_DUR: Record<FormId, number> = {
  ninja: 0.45,
  knight: 0.62,
  fire: 0.42,
  cheese: 0.72,
  cyber: 0.42,
};

type PState = 'normal' | 'attack' | 'skill' | 'roll' | 'parry' | 'hurt' | 'dead';

/* =========================================================
 * Player
 * ========================================================= */

export class Player {
  x = 180;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing = 1;
  onGround = true;
  jumpsLeft = 1;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  /** HUD 의 붉은 잔상 체력바 */
  hpLag = PLAYER_MAX_HP;
  forms = new CatFormManager();

  /** upgrade 를 주면 그 폼이 각성한 채로, 그 폼으로 시작한다 (최대 체력도 늘어난다) */
  constructor(upgrade: FormId | null = null) {
    if (!upgrade) return;
    this.forms.upgraded = upgrade;
    this.forms.index = Math.max(
      0,
      FORMS.findIndex((f) => f.id === upgrade),
    );
    this.maxHp = PLAYER_MAX_HP + UPGRADE_HP_BONUS;
    this.hp = this.maxHp;
    this.hpLag = this.maxHp;
  }

  state: PState = 'normal';
  stateT = 0;
  attackStep = 0;
  private attackQueued = false;
  private attackDone = false;
  /** 공격이 끝난 직후 다시 누르면 콤보를 이어 준다 */
  private chainT = 0;
  private lastStep = 0;
  rollCd = 0;
  private rollDir = 1;
  private airRollUsed = false;
  parryCd = 0;
  parrySuccess = false;
  /** 남은 무적 시간 (피격·패링·변신 후) */
  iframe = 0;
  hurtFlash = 0;
  t = 0;
  private runPhase = 0;
  private ghostT = 0;
  private dropT = 0;
  private footT = 0;
  private skillStage = 0;
  private skillX = 0;

  get form(): FormDef {
    return this.forms.def;
  }

  get dead() {
    return this.state === 'dead';
  }

  /** 지금 폼이 각성 폼인지 */
  get awakened() {
    return this.form.upgraded === true;
  }

  /** 폼의 공격력 배율을 곱한 피해 */
  private dmg(n: number) {
    return Math.round(n * (this.form.power ?? 1));
  }

  hurtbox(): Rect {
    const w = PLAYER_W * (this.form.id === 'cheese' ? 1.2 : 1);
    const h = this.state === 'roll' ? 28 : PLAYER_H;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  isInvulnerable() {
    return (
      this.iframe > 0 ||
      (this.state === 'roll' && this.stateT < ROLL_IFRAME) ||
      this.state === 'dead'
    );
  }

  /** 지금 들어오는 공격을 받아칠 수 있는지 */
  isParrying() {
    if (this.state !== 'parry') return false;
    // 성공한 직후에도 잠깐 판정을 남겨 둬서 탄막을 연달아 쳐낼 수 있다
    return this.stateT <= this.form.parryWindow + (this.parrySuccess ? 0.12 : 0);
  }

  /** 맞아도 동작이 끊기지 않는 상태 (치즈 망치, 나이트 성검 낙하) */
  superArmor() {
    const id = this.form.id;
    return (
      (id === 'cheese' && (this.state === 'attack' || this.state === 'skill')) ||
      (id === 'knight' && this.state === 'skill')
    );
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  /** 피해를 받는다 — 무적이면 false */
  damage(amount: number, dir: number): boolean {
    if (this.state === 'dead' || this.isInvulnerable()) return false;
    const dmg = Math.max(1, Math.round(amount * this.form.damageTaken));
    this.hp = Math.max(0, this.hp - dmg);
    this.iframe = HURT_IFRAME;
    this.hurtFlash = 1;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.stateT = 0;
      this.vx = dir * 220;
      this.vy = -460;
      this.onGround = false;
      return true;
    }
    if (!this.superArmor()) {
      this.state = 'hurt';
      this.stateT = 0;
      this.vx = dir * 300;
      this.vy = this.onGround ? -260 : -80;
      this.onGround = false;
    }
    return true;
  }

  /** 패링 성공 — 엔진이 이펙트·반격을 처리하고 이걸 부른다 */
  onParrySuccess() {
    this.parrySuccess = true;
    this.iframe = Math.max(this.iframe, PARRY_IFRAME);
    this.parryCd = 0.1;
  }

  /* ---------------- 매 프레임 ---------------- */

  update(dt: number, input: InputSource, world: World) {
    this.t += dt;
    this.stateT += dt;
    this.iframe = Math.max(0, this.iframe - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.chainT = Math.max(0, this.chainT - dt);
    this.hpLag = this.hpLag > this.hp ? Math.max(this.hp, this.hpLag - dt * 30) : this.hp;
    this.forms.update(dt);

    if (this.state === 'dead') {
      this.vx = approach(this.vx, 0, 400 * dt);
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
      this.move(dt, world);
      return;
    }

    this.handleFormChange(input, world);
    this.handleActions(input, world);
    this.handleJump(input, world);

    const dirIn = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    let gravityOn = true;

    switch (this.state) {
      case 'normal': {
        const target = dirIn * this.form.speed;
        this.vx = approach(this.vx, target, (this.onGround ? 3400 : 2400) * dt);
        if (dirIn !== 0) this.facing = dirIn;
        break;
      }
      case 'attack':
        this.updateAttack(dt, input, world);
        break;
      case 'skill':
        gravityOn = this.updateSkill(dt, world);
        break;
      case 'roll': {
        const k = this.stateT / ROLL_SEC;
        this.vx = this.rollDir * ROLL_SPEED * (1 - k * 0.45);
        // 공중 구르기는 짧은 수평 대시
        if (!this.onGround && k < 0.75) {
          this.vy = 0;
          gravityOn = false;
        }
        this.ghostT -= dt;
        if (this.ghostT <= 0) {
          this.ghostT = 0.035;
          world.fx.ghost(this.pose(), this.form.glow, 0.26);
        }
        if (this.stateT >= ROLL_SEC) this.toNormal();
        break;
      }
      case 'parry':
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.stateT >= (this.parrySuccess ? 0.2 : PARRY_POSE)) this.toNormal();
        break;
      case 'hurt':
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (this.stateT >= 0.3) this.toNormal();
        break;
    }

    if (gravityOn) {
      this.vy += GRAVITY * dt;
      // 점프 키를 일찍 떼면 낮게 뛴다
      if (this.vy < 0 && !input.held('jump') && this.state === 'normal')
        this.vy += GRAVITY * 0.9 * dt;
    }
    this.vy = Math.min(this.vy, MAX_FALL);
    this.move(dt, world);

    // 달리기 애니메이션 · 발자국
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.runPhase += dt * Math.abs(this.vx) * 0.055;
      this.footT -= dt;
      if (this.footT <= 0 && this.state === 'normal') {
        this.footT = 0.2;
        world.fx.footprint(this.x - this.facing * 6, this.y, 'rgba(255,255,255,0.18)');
      }
    }
    this.ambient(world);
  }

  /** 지금 폼의 기본 공격 표 */
  private attacks(): AttackStep[] {
    const f = this.form;
    return (f.upgraded && UP_ATTACKS[f.id]) || ATTACKS[f.id];
  }

  private toNormal() {
    this.state = 'normal';
    this.stateT = 0;
  }

  private handleFormChange(input: InputSource, world: World) {
    if (this.state !== 'normal' && this.state !== 'attack' && this.state !== 'parry') return;
    let target = -1;
    const actions: [Action, number][] = [
      ['formPrev', this.forms.index - 1],
      ['formNext', this.forms.index + 1],
      ['form1', 0],
      ['form2', 1],
      ['form3', 2],
      ['form4', 3],
      ['form5', 4],
    ];
    for (const [a, idx] of actions) {
      if (input.pressed(a)) {
        input.consume(a);
        target = idx;
      }
    }
    if (target < 0) return;
    if (!this.forms.switchTo(target)) return;
    const f = this.form;
    world.fx.transform(this.x, this.y, f.color, f.glow);
    world.fx.text(this.x, this.y - 70, f.name, f.glow, 16, 0.7);
    world.sfx('form');
    world.sfx('meow');
    this.iframe = Math.max(this.iframe, 0.25);
    if (this.state === 'attack') this.toNormal();
  }

  private handleActions(input: InputSource, world: World) {
    const free = this.state === 'normal';
    const afterHit = this.state === 'attack' && this.attackDone;
    const afterParry = this.state === 'parry' && this.parrySuccess;
    const canCancel = free || this.state === 'attack' || afterParry;

    // 1) 구르기 — 공격 중에도 언제든 끊고 피할 수 있다
    if (input.pressed('roll')) {
      const airOk = this.onGround || !this.airRollUsed;
      if (this.rollCd <= 0 && airOk && canCancel) {
        input.consume('roll');
        this.startRoll(input, world);
        return;
      }
    }
    // 2) 패링
    if (
      input.pressed('parry') &&
      this.parryCd <= 0 &&
      (free || this.state === 'attack' || afterParry)
    ) {
      input.consume('parry');
      this.startParry(world);
      return;
    }
    // 3) 스킬
    if (input.pressed('skill') && (free || afterHit || afterParry)) {
      if (this.forms.skillReady()) {
        input.consume('skill');
        this.startSkill(world);
        return;
      }
    }
    // 4) 기본 공격 (공격 중이면 다음 타격 예약)
    if (input.pressed('attack')) {
      if (free || afterParry) {
        input.consume('attack');
        const steps = this.attacks();
        const next = this.chainT > 0 && this.lastStep + 1 < steps.length ? this.lastStep + 1 : 0;
        this.startAttack(next, input);
      } else if (this.state === 'attack') {
        const steps = this.attacks();
        const cur = steps[this.attackStep];
        if (cur && this.stateT >= cur.hitAt * 0.5 && this.attackStep + 1 < steps.length) {
          input.consume('attack');
          this.attackQueued = true;
        }
      }
    }
  }

  private handleJump(input: InputSource, world: World) {
    if (!input.pressed('jump')) return;
    const can = this.state === 'normal' || (this.state === 'parry' && this.parrySuccess);
    if (!can) return;
    input.consume('jump');
    if (this.onGround && input.held('down') && this.y < GROUND_Y - 1) {
      // 발판에서 아래로 내려가기
      this.dropT = 0.25;
      this.onGround = false;
      this.y += 2;
      return;
    }
    if (this.onGround) {
      this.vy = -this.form.jump;
      this.onGround = false;
      this.state = 'normal';
      world.fx.dust(this.x, this.y, this.facing, 4);
      world.sfx('jump');
    } else if (this.jumpsLeft > 0) {
      this.jumpsLeft -= 1;
      this.vy = -this.form.jump * 0.88;
      this.state = 'normal';
      world.fx.ring(this.x, this.y - 4, 4, 26, this.form.glow, 0.3, 3);
      world.fx.paws(this.x, this.y, 2, this.form.glow);
      world.sfx('jump');
    }
  }

  /* ---------------- 구르기 · 패링 ---------------- */

  private startRoll(input: InputSource, world: World) {
    const dirIn = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    this.rollDir = dirIn !== 0 ? dirIn : this.facing;
    this.facing = this.rollDir;
    this.state = 'roll';
    this.stateT = 0;
    this.ghostT = 0;
    this.rollCd = ROLL_COOLDOWN + ROLL_SEC;
    if (!this.onGround) this.airRollUsed = true;
    world.fx.dust(this.x, this.y, this.rollDir, 6);
    world.sfx('roll');
  }

  private startParry(world: World) {
    this.state = 'parry';
    this.stateT = 0;
    this.parryCd = PARRY_COOLDOWN;
    this.parrySuccess = false;
    this.vx *= 0.3;
    world.fx.flare(this.x + this.facing * 16, this.y - 26, 18, '#fff27a', 0.15);
  }

  /* ---------------- 기본 공격 ---------------- */

  private startAttack(step: number, input: InputSource) {
    const dirIn = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    if (dirIn !== 0) this.facing = dirIn;
    this.state = 'attack';
    this.stateT = 0;
    this.attackStep = step;
    this.attackDone = false;
    this.attackQueued = false;
  }

  private updateAttack(dt: number, input: InputSource, world: World) {
    const steps = this.attacks();
    const a = steps[this.attackStep];
    if (!a) {
      this.toNormal();
      return;
    }
    this.vx = approach(this.vx, 0, 2200 * dt);
    if (!this.attackDone && this.stateT >= a.hitAt) {
      this.attackDone = true;
      this.performAttack(a, world);
    }
    if (this.stateT >= a.dur) {
      this.lastStep = this.attackStep;
      if (this.attackQueued && this.attackStep + 1 < steps.length) {
        this.startAttack(this.attackStep + 1, input);
      } else {
        this.chainT = 0.28;
        this.toNormal();
      }
    }
  }

  private performAttack(a: AttackStep, world: World) {
    const f = this.form;
    const fx = world.fx;
    const step = this.attackStep;
    const up = this.awakened;
    world.sfx(a.sfx);
    if (a.kind === 'melee') {
      const x = this.facing > 0 ? this.x + a.ox : this.x - a.ox - a.w;
      world.addHitbox({
        team: 'player',
        shape: { kind: 'rect', x, y: this.y + a.oy, w: a.w, h: a.h },
        damage: this.dmg(a.dmg),
        dir: this.facing,
        knock: a.knock,
        launch: a.launch,
        hitstop: a.hitstop,
        shake: a.shake,
        color: f.glow,
        kind: 'melee',
        life: 0.07,
      });
      this.vx = this.facing * a.lunge;
      const cx = this.x + this.facing * 10;
      const cy = this.y - 28;
      const steps = this.attacks();
      const last = step === steps.length - 1;
      switch (f.id) {
        case 'ninja':
          if (last) {
            const len = up ? 140 : 100;
            fx.line(this.x, cy, this.x + this.facing * len, cy, f.glow, up ? 12 : 10, 0.18);
            fx.sparks(
              this.x + this.facing * (len - 10),
              cy,
              this.facing > 0 ? 0 : Math.PI,
              0.3,
              f.glow,
              6,
              500,
            );
            if (up) {
              // 일섬 끝에서 벚꽃 초승달 검기가 날아간다
              const p = new Projectile(
                'crescent',
                'player',
                this.x + this.facing * 40,
                cy,
                this.facing * 760,
                0,
                { r: 18, damage: this.dmg(10), color: '#ff7aa8', life: 0.55 },
              );
              p.pierce = Infinity;
              p.knock = 160;
              world.addProjectile(p);
              this.petals(world, this.x + this.facing * 60, cy, 10);
            }
          } else {
            const [a0, a1] = step % 2 === 0 ? [-2.1, 1.0] : [1.1, -1.9];
            fx.slash(cx, cy, this.facing, up ? 60 : 50, a0, a1, f.color, up ? 14 : 12, 0.2);
            if (up) this.petals(world, cx + this.facing * 30, cy, 3);
          }
          break;
        case 'knight':
          fx.slash(
            cx,
            this.y - 34,
            this.facing,
            up ? 76 : 66,
            -2.5,
            1.3,
            f.glow,
            up ? 22 : 18,
            0.26,
          );
          if (this.onGround) {
            const gx = this.x + this.facing * 70;
            fx.shards(gx, GROUND_Y, '#c8b8a0', 6, 280);
            fx.ring(gx, this.y, 6, up ? 80 : 60, f.glow, 0.3, 4);
            if (up && last) {
              // 왕검 두 번째 타격은 앞으로 황금 충격파를 보낸다
              const p = new Projectile(
                'shockwave',
                'player',
                this.x + this.facing * 40,
                GROUND_Y - 16,
                this.facing * 620,
                0,
                { r: 18, damage: this.dmg(14), color: '#ffd34a', life: 0.6 },
              );
              p.grounded = true;
              p.pierce = Infinity;
              p.knock = 200;
              world.addProjectile(p);
            }
          }
          break;
        case 'cheese': {
          const col = up ? '#9ae8ff' : '#ffd84a';
          fx.slash(cx, this.y - 34, this.facing, up ? 80 : 72, -2.8, 1.3, col, 22, 0.28);
          if (this.onGround) {
            const gx = this.x + this.facing * 76;
            fx.shards(gx, GROUND_Y, col, 8, 340);
            fx.dust(gx, GROUND_Y, this.facing, 8);
            fx.ring(gx, this.y, 8, up ? 100 : 80, up ? '#b4f0ff' : '#ffe066', 0.35, 6);
            if (up) {
              // 참치 망치 — 땅을 치면 물결이 앞으로 밀려 나간다
              const p = new Projectile(
                'groundWave',
                'player',
                gx,
                GROUND_Y - 18,
                this.facing * 520,
                0,
                { r: 18, damage: this.dmg(16), color: '#3ab4ff', life: 0.7 },
              );
              p.grounded = true;
              p.pierce = Infinity;
              p.knock = 260;
              p.launch = 240;
              world.addProjectile(p);
              this.splash(world, gx, GROUND_Y, 10);
            }
          }
          world.shake(up ? 6 : 4);
          break;
        }
        default:
          break;
      }
      return;
    }
    // 원거리 (파이어 · 사이버)
    const mx = this.x + this.facing * 26;
    const my = this.y - 27;
    if (f.id === 'fire') {
      const p = new Projectile(
        'fireWave',
        'player',
        mx,
        my + (step === 0 ? 4 : -6),
        this.facing * (up ? 760 : 640),
        0,
        {
          r: up ? 18 : 14,
          damage: this.dmg(a.dmg),
          color: up ? '#3a8aff' : FIRE_WAVE_COLOR,
          life: up ? 0.9 : 0.8,
        },
      );
      p.pierce = up ? Infinity : 2;
      p.knock = a.knock;
      world.addProjectile(p);
      fx.flare(mx, my, up ? 32 : 26, up ? '#5aa8ff' : '#ff8a2a', 0.18);
    } else {
      // 슈프림 캣은 모든 사격이 3갈래, 마지막 타격은 5갈래
      const spreads = up
        ? step === 2
          ? [-220, -110, 0, 110, 220]
          : [-90, 0, 90]
        : step === 2
          ? [-110, 0, 110]
          : [0];
      const colors = ['#ff4adf', '#28f0ff', '#ffe14a', '#7afff0', '#c07aff'];
      spreads.forEach((vy, i) => {
        const p = new Projectile('neon', 'player', mx, my, this.facing * (up ? 1300 : 1150), vy, {
          r: up ? 8 : 7,
          damage: this.dmg(a.dmg),
          color: up ? (colors[i % colors.length] as string) : '#28f0ff',
          life: 0.6,
        });
        p.knock = a.knock;
        world.addProjectile(p);
      });
      fx.flare(mx, my, up ? 26 : 20, up ? f.color : '#28f0ff', 0.12);
      fx.sparks(mx, my, this.facing > 0 ? 0 : Math.PI, 0.5, f.glow, up ? 5 : 3, 300);
      this.vx = -this.facing * 40;
    }
  }

  /** 벚꽃잎 흩날림 (사무라이 캣) */
  private petals(world: World, x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const p = world.fx.flare(x + rand(-24, 24), y + rand(-20, 16), rand(4, 7), '#ffb4cf', 0.6);
      p.vx = rand(-90, 90);
      p.vy = rand(-110, 20);
    }
  }

  /** 물보라 (참치 냥이) */
  private splash(world: World, x: number, y: number, n: number) {
    world.fx.burst(x, y - 10, '#9ae8ff', n, 320, 7);
    world.fx.burst(x, y - 10, '#ffffff', Math.ceil(n / 2), 220, 5);
  }

  /* ---------------- 폼 스킬 ---------------- */

  private startSkill(world: World) {
    this.forms.useSkill();
    this.state = 'skill';
    this.stateT = 0;
    this.skillStage = 0;
    this.vx = 0;
    world.sfx('skill');
    world.fx.flare(this.x, this.y - 24, this.awakened ? 56 : 40, this.form.color, 0.3);
    world.fx.text(
      this.x,
      this.y - 72,
      this.form.skill,
      this.form.glow,
      this.awakened ? 17 : 15,
      0.8,
    );
    if (this.awakened) {
      world.fx.ring(this.x, this.y - 24, 10, 90, this.form.glow, 0.4, 5);
      world.flash(this.form.color, 0.18);
    }
  }

  /** 스킬 진행 — 중력을 적용할지 돌려준다 */
  private updateSkill(dt: number, world: World): boolean {
    const f = this.form;
    const fx = world.fx;
    const t = this.stateT;
    const end = SKILL_DUR[f.id];
    let gravity = true;

    switch (f.id) {
      case 'ninja': {
        // 그림자 분신참 — 순식간에 앞으로 질주하고, 지나간 자리에 분신 셋이 차례로 벤다
        if (this.skillStage === 0) {
          this.vx = 0;
          if (t >= 0.06) {
            this.skillStage = 1;
            this.skillX = this.x;
            this.iframe = Math.max(this.iframe, 0.34);
            world.sfx('slash');
          }
        }
        if (this.skillStage === 1) {
          this.vx = this.facing * (this.awakened ? 1600 : 1350);
          this.vy = 0;
          gravity = false;
          this.ghostT -= dt;
          if (this.ghostT <= 0) {
            this.ghostT = 0.02;
            fx.ghost(this.pose(), f.color, 0.3);
            if (this.awakened) this.petals(world, this.x, this.y - 26, 1);
          }
          const hitWall = this.x <= ARENA_L + 16 || this.x >= ARENA_R - 16;
          if (t >= 0.23 || hitWall) {
            this.skillStage = 2;
            this.vx = this.facing * 160;
            this.shadowClones(world);
          }
        }
        break;
      }
      case 'knight': {
        // 성검 낙하 — 검을 치켜들었다가 내려찍어 양옆으로 충격파
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.skillStage === 0) {
          if (Math.random() < 0.6) {
            const p = fx.flare(this.x + rand(-20, 20), this.y - rand(20, 70), 10, f.glow, 0.3);
            p.vy = -80;
          }
          if (t >= 0.3) {
            this.skillStage = 1;
            this.knightSlam(world);
          }
        }
        break;
      }
      case 'fire': {
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.skillStage === 0 && t >= 0.16) {
          this.skillStage = 1;
          this.fireChain(world);
        }
        break;
      }
      case 'cheese': {
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.skillStage === 0 && t >= 0.36) {
          this.skillStage = 1;
          this.cheeseQuake(world);
        }
        break;
      }
      case 'cyber': {
        this.vx = 0;
        if (this.skillStage === 0) {
          this.vy = Math.min(this.vy, 0);
          gravity = false;
          fx.flare(this.x + this.facing * 18, this.y - 26, 16 + t * 120, f.glow, 0.08);
          if (t >= 0.14) {
            this.skillStage = 1;
            this.cyberLancer(world);
          }
        }
        break;
      }
    }
    if (t >= end) this.toNormal();
    return gravity;
  }

  private shadowClones(world: World) {
    const sx = this.skillX;
    const ex = this.x;
    const gy = this.y;
    const facing = this.facing;
    const lo = Math.min(sx, ex);
    const hi = Math.max(sx, ex);
    const base = this.pose();
    const up = this.awakened;
    const f = this.form;
    // 사무라이는 분신 다섯 + 마지막 일섬
    const n = up ? 5 : 3;
    const dmg = this.dmg(20);
    for (let i = 0; i < n; i++) {
      world.schedule(0.05 + i * (up ? 0.06 : 0.08), () => {
        const cx = lerp(sx, ex, (i + 0.5) / n);
        world.fx.ghost(
          { ...base, x: cx, y: gy, pose: 'attack', attackP: 0.6, attackStep: i % 2 },
          up ? '#ff6a8a' : '#6a7aff',
          0.4,
        );
        const [a0, a1] = i % 2 === 0 ? [-2.2, 1.2] : [1.2, -2.2];
        world.fx.slash(cx, gy - 28, facing, up ? 64 : 56, a0, a1, f.glow, 14, 0.24);
        if (up) this.petals(world, cx, gy - 30, 4);
        world.addHitbox({
          team: 'player',
          shape: { kind: 'rect', x: lo - 40, y: gy - 84, w: hi - lo + 80, h: 88 },
          damage: dmg,
          dir: facing,
          knock: 150,
          hitstop: 0.04,
          shake: 4,
          color: f.glow,
          kind: 'skill',
          life: 0.05,
        });
        world.sfx('slash');
      });
    }
    if (up) {
      // 천본벚꽃 일섬 — 지나온 길 전체를 한 줄로 가른다
      world.schedule(0.05 + n * 0.06 + 0.06, () => {
        const y = gy - 30;
        world.fx.line(lo - 50, y, hi + 50, y, '#ffffff', 14, 0.3);
        world.fx.line(lo - 50, y, hi + 50, y, '#ff3a5c', 6, 0.4);
        this.petals(world, (lo + hi) / 2, y, 18);
        world.addHitbox({
          team: 'player',
          shape: { kind: 'rect', x: lo - 60, y: gy - 90, w: hi - lo + 120, h: 94 },
          damage: this.dmg(30),
          dir: facing,
          knock: 320,
          launch: 200,
          hitstop: 0.09,
          shake: 9,
          color: '#ffc2d6',
          kind: 'skill',
          life: 0.06,
        });
        world.flash('#ffc2d6', 0.25);
        world.sfx('heavy');
      });
    }
  }

  private knightSlam(world: World) {
    const fx = world.fx;
    const f = this.form;
    const up = this.awakened;
    world.addHitbox({
      team: 'player',
      shape: { kind: 'rect', x: this.x - 150, y: this.y - 112, w: 300, h: 116 },
      damage: this.dmg(46),
      dir: this.facing,
      knock: 380,
      launch: 320,
      hitstop: 0.09,
      shake: 12,
      color: f.glow,
      kind: 'skill',
      life: 0.08,
    });
    if (this.onGround) {
      for (const dir of [-1, 1]) {
        const p = new Projectile(
          'shockwave',
          'player',
          this.x + dir * 30,
          GROUND_Y - 16,
          dir * 560,
          0,
          {
            r: up ? 20 : 16,
            damage: this.dmg(22),
            color: up ? '#ffd34a' : '#ffe9a8',
            life: 0.75,
          },
        );
        p.grounded = true;
        p.pierce = Infinity;
        p.knock = 220;
        world.addProjectile(p);
      }
    }
    if (up) {
      // 왕의 성검 심판 — 주변 하늘에서 빛의 성검 다섯 자루가 차례로 꽂힌다
      const x0 = this.x;
      const dmg = this.dmg(26);
      const offsets = [-260, 260, -150, 150, 0];
      offsets.forEach((ox, i) => {
        const sx = clamp(x0 + ox, ARENA_L + 30, ARENA_R - 30);
        world.schedule(0.12 + i * 0.09, () => {
          world.fx.line(sx, GROUND_Y - 300, sx, GROUND_Y, '#fff4c8', 16, 0.25);
          world.fx.line(sx, GROUND_Y - 300, sx, GROUND_Y, '#ffd34a', 6, 0.35);
          world.fx.ring(sx, GROUND_Y - 6, 8, 70, '#ffd34a', 0.35, 5);
          world.fx.flare(sx, GROUND_Y - 30, 60, '#ffe9a8', 0.3);
          world.fx.shards(sx, GROUND_Y, '#ffe9a8', 6, 300);
          world.addHitbox({
            team: 'player',
            shape: { kind: 'rect', x: sx - 34, y: GROUND_Y - 240, w: 68, h: 240 },
            damage: dmg,
            dir: sx >= x0 ? 1 : -1,
            knock: 180,
            launch: 380,
            hitstop: 0.05,
            shake: 6,
            color: '#ffd34a',
            kind: 'skill',
            life: 0.08,
          });
          world.shake(5);
          world.sfx('heavy');
        });
      });
    }
    fx.slash(this.x + this.facing * 8, this.y - 40, this.facing, 74, -2.8, 1.4, '#fff4c8', 22, 0.3);
    fx.ring(this.x, this.y, 10, up ? 200 : 160, f.glow, 0.45, 8);
    fx.flare(this.x, this.y - 10, 90, f.glow, 0.3);
    fx.shards(this.x, GROUND_Y, '#c8b8a0', 12, 420);
    world.shake(10);
    world.sfx('heavy');
    world.sfx('boom');
  }

  private fireChain(world: World) {
    const x0 = this.x;
    const facing = this.facing;
    const up = this.awakened;
    const dmg = this.dmg(18);
    const [core, hot, rim] = up
      ? ['#2a6aff', '#9af0ff', '#5aa8ff']
      : ['#ff5a1a', '#ffc04a', '#ff8a2a'];
    world.fx.flare(x0 + facing * 20, this.y - 26, up ? 56 : 40, rim, 0.25);
    // 플레임 캣은 앞뒤 양쪽으로 8칸씩 동시에 폭발한다
    const dirs = up ? [facing, -facing] : [facing];
    const n = up ? 8 : 6;
    for (let i = 0; i < n; i++) {
      world.schedule(i * (up ? 0.065 : 0.08), () => {
        for (const d of dirs) {
          const ex = x0 + d * (70 + i * 70);
          if (ex < ARENA_L - 20 || ex > ARENA_R + 20) continue;
          world.addHitbox({
            team: 'player',
            shape: { kind: 'circle', x: ex, y: GROUND_Y - 40, r: up ? 70 : 60 },
            damage: dmg,
            dir: d,
            knock: 200,
            launch: 260,
            hitstop: 0.03,
            shake: 5,
            color: rim,
            kind: 'skill',
            life: 0.08,
          });
          world.fx.explosion(ex, GROUND_Y - 34, up ? 84 : 70, core);
          world.fx.burst(ex, GROUND_Y - 30, hot, 10, 280, 10);
          world.fx.ring(ex, GROUND_Y - 30, 8, up ? 78 : 64, rim, 0.3, 5);
        }
        world.shake(3);
        world.sfx('fire');
      });
    }
  }

  private cheeseQuake(world: World) {
    const x0 = this.x;
    const facing = this.facing;
    const fx = world.fx;
    const up = this.awakened;
    const col = up ? '#9ae8ff' : '#ffd84a';
    world.addHitbox({
      team: 'player',
      shape: { kind: 'rect', x: facing > 0 ? x0 : x0 - 110, y: this.y - 90, w: 110, h: 94 },
      damage: this.dmg(34),
      dir: facing,
      knock: 300,
      launch: 300,
      hitstop: 0.08,
      shake: 10,
      color: col,
      kind: 'skill',
      life: 0.08,
    });
    fx.slash(x0 + facing * 10, this.y - 34, facing, 72, -2.8, 1.3, col, 22, 0.28);
    fx.ring(x0 + facing * 60, this.y, 8, up ? 150 : 120, up ? '#b4f0ff' : '#ffe066', 0.4, 8);
    world.shake(9);
    world.sfx('heavy');
    const dmg = this.dmg(26);
    // 참치 냥이는 앞뒤로 가시가 솟고, 양옆으로 해일이 밀려간다
    const dirs = up ? [facing, -facing] : [facing];
    for (let i = 0; i < 7; i++) {
      world.schedule(0.06 + i * 0.07, () => {
        for (const d of dirs) {
          const sx = x0 + d * (70 + i * 58);
          if (sx < ARENA_L || sx > ARENA_R) continue;
          world.addHitbox({
            team: 'player',
            shape: { kind: 'rect', x: sx - 24, y: GROUND_Y - 120, w: 48, h: 120 },
            damage: dmg,
            dir: d,
            knock: 120,
            launch: 560,
            hitstop: 0.04,
            shake: 5,
            color: col,
            kind: 'skill',
            life: 0.1,
          });
          world.fx.spike(sx, up ? '#7ad0f0' : '#e8b84a', 96 + i * 6, 42);
          if (up) this.splash(world, sx, GROUND_Y, 4);
        }
        world.shake(3);
        world.sfx('heavy');
      });
    }
    if (up && this.onGround) {
      for (const d of [-1, 1]) {
        const p = new Projectile('groundWave', 'player', x0 + d * 40, GROUND_Y - 30, d * 480, 0, {
          r: 30,
          damage: this.dmg(24),
          color: '#3ab4ff',
          life: 1.1,
        });
        p.grounded = true;
        p.pierce = Infinity;
        p.knock = 320;
        p.launch = 360;
        world.addProjectile(p);
      }
    }
  }

  private cyberLancer(world: World) {
    const fx = world.fx;
    const sx = this.x;
    const y = this.y - 26;
    const up = this.awakened;
    const wallDist = this.facing > 0 ? ARENA_R - sx : sx - ARENA_L;
    const base0 = this.facing > 0 ? 0 : Math.PI;
    // 슈프림 캣은 정면 + 위아래로 비스듬한 프리즘 광선 세 줄기
    const rays = up
      ? [
          { a: 0, c: '#ffffff', w: 40 },
          { a: -0.2, c: '#ff4adf', w: 22 },
          { a: 0.2, c: '#7afff0', w: 22 },
        ]
      : [{ a: 0, c: '#28f0ff', w: 26 }];
    for (const r of rays) {
      const beam = new Beam(sx, y, base0 + r.a * this.facing, {
        length: (r.a === 0 ? wallDist : 900) + 60,
        width: r.w,
        warn: 0,
        active: up ? 0.26 : 0.2,
        team: 'player',
        damage: this.dmg(r.a === 0 ? 48 : 28),
        color: r.c,
      });
      beam.once = true;
      world.addBeam(beam);
    }
    const ex = clamp(sx + this.facing * (up ? 340 : 280), ARENA_L + 16, ARENA_R - 16);
    const base = this.pose();
    for (let i = 1; i <= 5; i++) {
      fx.ghost(
        { ...base, x: lerp(sx, ex, i / 6) },
        up ? this.form.color : '#ff4adf',
        0.25 + i * 0.03,
      );
    }
    this.x = ex;
    this.iframe = Math.max(this.iframe, up ? 0.4 : 0.3);
    fx.line(sx, y, ex, y, '#ffffff', 10, 0.2);
    fx.sparks(ex, y, this.facing > 0 ? 0 : Math.PI, 0.6, this.form.glow, 14, 700);
    fx.ring(sx, y, 6, up ? 80 : 50, up ? this.form.color : '#ff4adf', 0.3, 4);
    world.shake(up ? 9 : 6);
    world.sfx('laser');
  }

  /* ---------------- 물리 ---------------- */

  private move(dt: number, world: World) {
    const prevY = this.y;
    const wasGround = this.onGround;
    const landSpeed = this.vy;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const half = 15;
    this.x = clamp(this.x, ARENA_L + half, ARENA_R - half);
    this.onGround = false;
    let landed = false;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      landed = true;
    } else if (this.vy >= 0 && this.dropT <= 0) {
      for (const p of PLATFORMS) {
        if (this.x >= p.x1 - 6 && this.x <= p.x2 + 6 && prevY <= p.y + 0.5 && this.y >= p.y) {
          this.y = p.y;
          landed = true;
          break;
        }
      }
    }
    if (landed) {
      this.vy = 0;
      this.onGround = true;
      this.jumpsLeft = 1;
      this.airRollUsed = false;
      if (!wasGround && landSpeed > 420 && this.state !== 'dead') {
        world.fx.dust(this.x, this.y, -1, 3);
        world.fx.dust(this.x, this.y, 1, 3);
      }
    }
  }

  /** 폼별 주변 파티클 (불티, 네온 스파크) */
  private ambient(world: World) {
    const id = this.form.id;
    if (this.awakened && Math.random() < 0.3) {
      // 각성 오라 — 몸 주위로 폼 색 불티가 피어오른다
      const p = world.fx.flare(
        this.x + rand(-16, 16),
        this.y - rand(4, 44),
        rand(3, 6),
        Math.random() < 0.5 ? this.form.color : this.form.glow,
        0.5,
      );
      p.vy = -rand(50, 110);
      p.vx = rand(-15, 15);
    }
    if (id === 'fire' && Math.random() < 0.2) {
      const p = world.fx.flare(
        this.x - this.facing * 20 + rand(-4, 4),
        this.y - 46,
        rand(4, 7),
        this.awakened ? '#5aa8ff' : '#ff8a2a',
        0.4,
      );
      p.vy = -rand(40, 90);
      p.vx = rand(-20, 20);
    } else if (id === 'cyber' && Math.random() < 0.08) {
      world.fx.sparks(
        this.x + rand(-12, 12),
        this.y - rand(10, 40),
        rand(0, TAU),
        0.3,
        this.awakened ? this.form.glow : '#28f0ff',
        1,
        120,
      );
    } else if (id === 'knight' && this.state === 'parry' && this.stateT < this.form.parryWindow) {
      world.fx.flare(this.x + this.facing * 18, this.y - 30, 16, this.form.glow, 0.08);
    }
  }

  /* ---------------- 그리기용 자세 ---------------- */

  pose(): CatPose {
    let pose: CatPoseName = 'idle';
    let attackP = 0;
    switch (this.state) {
      case 'normal':
        if (!this.onGround) pose = this.vy < 0 ? 'jump' : 'fall';
        else pose = Math.abs(this.vx) > 30 ? 'run' : 'idle';
        break;
      case 'attack': {
        pose = 'attack';
        const a = this.attacks()[this.attackStep];
        attackP = a ? this.stateT / a.dur : 0;
        break;
      }
      case 'skill':
        pose = 'skill';
        attackP = this.stateT / SKILL_DUR[this.form.id];
        if (this.form.id === 'ninja') {
          pose = 'attack';
          attackP = 0.9;
        }
        break;
      case 'roll':
        pose = 'roll';
        break;
      case 'parry':
        pose = 'parry';
        break;
      case 'hurt':
        pose = 'hurt';
        break;
      case 'dead':
        pose = 'dead';
        break;
    }
    const blinking =
      this.iframe > 0 && this.state !== 'roll' && !this.parrySuccess && this.state !== 'dead';
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      form: this.form.id,
      upgraded: this.awakened,
      pose,
      t: this.t,
      runPhase: this.runPhase,
      attackP: clamp(attackP, 0, 1),
      attackStep: this.attackStep,
      rollAngle: (this.stateT / ROLL_SEC) * TAU,
      flash: this.hurtFlash,
      alpha: blinking ? (Math.sin(this.t * 40) > 0 ? 1 : 0.4) : 1,
    };
  }
}
