import { useEffect, useRef } from 'react';
import {
  BUILDS,
  BUILD_ORDER,
  MAX_LEVEL,
  skillLabel,
  SKILLS,
  towerChain,
  towerDamage,
  towerDps,
  towerRange,
  towerRate,
  towerSlow,
  towerSplash,
  upgradeCost,
  wallSlow,
  wallThorn,
  type BuildKind,
} from './engine/config';
import { drawBuildPreview } from './engine/render';
import { BUILD_COLOR } from './config';
import { BuildGlyph } from './build-glyph';
import styles from './Imjin50.module.css';

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
const PREVIEW_SIZE = 52;

/** 판에 그려지는 것과 같은 그림으로 단계별 모습을 보여준다. */
function LevelPreview({ kind, level }: { kind: BuildKind; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = PREVIEW_SIZE * dpr;
    canvas.height = PREVIEW_SIZE * dpr;
    drawBuildPreview(ctx, kind, level, PREVIEW_SIZE, dpr, 0);
  }, [kind, level]);

  return (
    <canvas
      ref={ref}
      className={styles.levelPreview}
      style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      aria-hidden
    />
  );
}

function num(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

function statLines(kind: BuildKind, level: number): string[] {
  const lines: string[] = [];
  if (kind === 'wall') {
    const thorn = wallThorn(level);
    const slow = wallSlow(level);
    if (thorn === 0) lines.push('길만 막음');
    else {
      lines.push(`옆 적 초당 체력 ${(thorn * 100).toFixed(1)}%`);
      if (slow > 0) lines.push(`둔화 ${Math.round(slow * 100)}%`);
    }
  } else if (kind === 'caltrop') {
    lines.push(`범위 안 모두 초당 ${num(towerDamage(kind, level))}`);
    lines.push(`둔화 ${Math.round(towerSlow(kind, level) * 100)}%`);
    lines.push(`사거리 ${towerRange(kind, level).toFixed(2)}칸`);
  } else {
    lines.push(`초당 피해 ${num(towerDps(kind, level))}`);
    lines.push(`${num(towerDamage(kind, level))} × ${towerRate(kind, level).toFixed(1)}발`);
    lines.push(`사거리 ${towerRange(kind, level).toFixed(2)}칸`);
    if (kind === 'cannon') lines.push(`폭발 ${towerSplash(kind, level).toFixed(2)}칸`);
    if (kind === 'hwacha') lines.push(`불길 ${towerChain(kind, level)}명`);
  }
  if (level >= MAX_LEVEL) lines.push('스킬 강화 +' + SKILLS[kind].cost + ' · ' + skillLabel(kind));
  return lines;
}

function tagsOf(kind: BuildKind): string[] {
  const def = BUILDS[kind];
  if (kind === 'wall') return ['갑옷 무시', '왜장은 절반만'];
  const tags: string[] = [];
  if (def.pierceArmor) tags.push('갑옷 무시');
  tags.push(def.hitsScout ? '척후병 공격' : '척후병 못 맞힘');
  if (kind === 'caltrop') tags.push('척후병은 안 느려짐');
  if (kind === 'hwacha') tags.push('옮겨붙을 때마다 70%');
  return tags;
}

/** 무기별 설명과 1~3단계 모습·수치·강화 비용. */
export function WeaponCodex() {
  return (
    <ul className={styles.codexList}>
      {BUILD_ORDER.map((kind) => {
        const def = BUILDS[kind];
        return (
          <li key={kind} className={styles.codexItem}>
            <div className={styles.codexHead}>
              <span style={{ color: BUILD_COLOR[kind] }}>
                <BuildGlyph kind={kind} size={20} />
              </span>
              <p className={styles.codexName}>{def.name}</p>
            </div>
            <p className={styles.codexBlurb}>{def.blurb}</p>
            <div className={styles.codexTags}>
              {tagsOf(kind).map((tag) => (
                <span key={tag} className={styles.codexTag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className={styles.levelGrid}>
              {LEVELS.map((level) => (
                <div key={level} className={styles.levelCell}>
                  <LevelPreview kind={kind} level={level} />
                  <p className={styles.levelLabel}>
                    {level}단계
                    <span className={styles.levelCost}>
                      {level === 1 ? def.cost : '+' + upgradeCost(kind, level - 1)}
                    </span>
                  </p>
                  {statLines(kind, level).map((line) => (
                    <p key={line} className={styles.levelStat}>
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
