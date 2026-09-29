import { useEffect, useRef } from 'react';
import {
  BUILD_ORDER,
  BUILDS,
  ENEMIES,
  ENEMY_ORDER,
  towerDamage,
  towerRate,
  type BuildKind,
  type EnemyKind,
} from './engine/config';
import { drawEnemyPreview } from './engine/render';
import { BuildGlyph } from './build-glyph';
import { BUILD_COLOR } from './config';
import styles from './Imjin50.module.css';

const BADGE_SIZE = 30;

function EnemyIcon({ kind, size = BADGE_SIZE }: { kind: EnemyKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    drawEnemyPreview(ctx, kind, size, dpr);
  }, [kind, size]);

  return (
    <canvas
      ref={ref}
      className={styles.enemyIcon}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/**
 * 정비 시간에 다음 공세의 구성을 미리 보여준다. 공세 구성은 웨이브 번호로만
 * 정해져 모두에게 똑같으므로, 미리 보여줘도 공정성이 깨지지 않는다.
 */
export function NextWaveRoster({ counts }: { counts: Partial<Record<EnemyKind, number>> }) {
  const present = ENEMY_ORDER.filter((kind) => (counts[kind] ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <div className={styles.roster}>
      <p className={styles.rosterLabel}>다음 공세</p>
      <div className={styles.rosterRow}>
        {present.map((kind) => (
          <div key={kind} className={styles.rosterBadge} title={ENEMIES[kind].name}>
            <EnemyIcon kind={kind} />
            <span className={styles.rosterCount}>{counts[kind]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 패널이 좁아 "속도 0.72" 처럼 한 덩어리를 "·"로 이어 붙이면 한글 사이에서 그냥
// 줄바꿈돼 버린다(한글은 공백이 없어도 글자 사이에서 줄을 넘긴다). 그래서 한
// 덩어리씩 따로 한 줄에 둔다.
function statLines(kind: EnemyKind): string[] {
  const def = ENEMIES[kind];
  const lines = [`체력 ${def.hp}`, `속도 ${def.speed.toFixed(2)}`];
  if (def.armor > 0) lines.push(`방어 ${def.armor}`);
  return lines;
}

/**
 * 이 적에게 각 무기가 1단계 기준 초당 얼마나 박히는지 어림잡는다. 갑옷을 무시하지
 * 못하면 갑옷만큼 깎이고(최소 1), 척후병처럼 벽을 넘는 적은 척후병을 맞히는
 * 무기만 애초에 후보에 든다. 목책은 공격 시설이 아니라 애초에 제외한다.
 */
function matchupScore(enemyKind: EnemyKind, buildKind: BuildKind): number {
  const enemy = ENEMIES[enemyKind];
  const weapon = BUILDS[buildKind];
  if (weapon.damage === 0) return 0;
  if (enemy.ignoresWalls && !weapon.hitsScout) return 0;
  const raw = towerDamage(buildKind, 1);
  const perHit = weapon.pierceArmor ? raw : Math.max(1, raw - enemy.armor);
  return weapon.rate === 0 ? perHit : perHit * towerRate(buildKind, 1);
}

/** 잘 듣는 순서로 최대 3개 — 점수가 0이면(전혀 안 통하면) 후보에서 뺀다. */
function goodWeapons(kind: EnemyKind): BuildKind[] {
  return BUILD_ORDER.map((weapon) => ({ weapon, score: matchupScore(kind, weapon) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.weapon);
}

function tagsOf(kind: EnemyKind): string[] {
  const def = ENEMIES[kind];
  const tags: string[] = [];
  if (def.ignoresWalls) tags.push('목책·성벽을 넘어옴');
  if (def.slowResist >= 1) tags.push('둔화가 안 통함');
  else if (def.slowResist > 0) tags.push('둔화 저항 ' + Math.round(def.slowResist * 100) + '%');
  if (def.leak > 1) tags.push('뚫리면 성문 피해 ×' + def.leak);
  return tags;
}

/** 판에서 적을 짚었을 때 뜨는 정보 카드 — 그 병종의 능력치와 특징을 보여준다. */
export function EnemyInfoCard({ kind, onClose }: { kind: EnemyKind; onClose: () => void }) {
  const def = ENEMIES[kind];
  return (
    <div className={styles.selection}>
      <div className={styles.selectionTop}>
        <span className={styles.selectionIcon}>
          <EnemyIcon kind={kind} size={34} />
        </span>
        <div className={styles.selectionInfo}>
          <p className={styles.selectionName}>{def.name}</p>
          <p className={styles.statRow}>
            {statLines(kind).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className={styles.closeBtn}>
          ×
        </button>
      </div>
      <p className={styles.enemyNote}>{def.note}</p>
      {tagsOf(kind).length > 0 ? (
        <div className={styles.codexTags}>
          {tagsOf(kind).map((tag) => (
            <span key={tag} className={styles.codexTag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <CounterRow kind={kind} />
    </div>
  );
}

/** 이 적에게 잘 듣는 무기 — 배치 판단에 바로 쓰라고 상성을 미리 계산해 보여준다. */
function CounterRow({ kind }: { kind: EnemyKind }) {
  const weapons = goodWeapons(kind);
  if (weapons.length === 0) return null;

  return (
    <div className={styles.counterRow}>
      <p className={styles.counterLabel}>잘 듣는 무기</p>
      <div className={styles.counterList}>
        {weapons.map((weapon) => (
          <span key={weapon} className={styles.counterItem} style={{ color: BUILD_COLOR[weapon] }}>
            <BuildGlyph kind={weapon} size={14} />
            {BUILDS[weapon].name}
          </span>
        ))}
      </div>
    </div>
  );
}
