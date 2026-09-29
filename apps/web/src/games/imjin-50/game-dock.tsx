import type { CSSProperties } from 'react';
import {
  BUILDS,
  BUILD_ORDER,
  MAX_LEVEL,
  SKILLS,
  TOTAL_WAVES,
  type BuildKind,
  type EnemyKind,
} from './engine/config';
import type { Snapshot } from './engine/engine';
import type { Best } from './best';
import { BUILD_COLOR } from './config';
import { BuildGlyph } from './build-glyph';
import { cx } from './cx';
import { EnemyInfoCard, NextWaveRoster } from './enemy-roster';
import styles from './Imjin50.module.css';

export interface DockSelection {
  col: number;
  row: number;
  kind: BuildKind | null;
  level: number;
  dps: number;
  range: number;
  /** 그 시설만의 고유 능력치 — statRow 가 구절마다 줄바꿈 없이 감싸도록 이미 조각나 있다. */
  trait: string[] | null;
  nextCost: number | null;
  refund: number;
  skillUnlocked: boolean;
  /** 3단계를 채우고 아직 스킬을 안 샀을 때만 값이 있다 — 해금 버튼에 쓴다. */
  skillCost: number | null;
}

/** 선택 패널의 능력치 줄 — statRow 가 구절마다 줄바꿈 없이 감싸도록 조각으로 나눈다. */
function weaponStatParts(selection: DockSelection): string[] {
  if (selection.dps <= 0) {
    return [...(selection.trait ?? ['길만 막는 울타리']), '강화하면 옆 적도 공격'];
  }
  const parts = ['초당 ' + Math.round(selection.dps), '사거리 ' + selection.range.toFixed(2)];
  if (selection.trait) parts.push(...selection.trait);
  return parts;
}

export function GameDock({
  stats,
  selection,
  pending,
  speed,
  paused,
  muted,
  onPick,
  onUpgrade,
  onUnlockSkill,
  onSell,
  onClose,
  onCallWave,
  onSpeed,
  onPause,
  onToggleMute,
  onHoverKind,
  nextWave,
  inspected,
  onCloseInspect,
  best,
}: {
  stats: Snapshot;
  selection: DockSelection | null;
  pending: BuildKind | null;
  speed: number;
  paused: boolean;
  muted: boolean;
  onPick: (kind: BuildKind) => void;
  onUpgrade: () => void;
  onUnlockSkill: () => void;
  onSell: () => void;
  onClose: () => void;
  onCallWave: () => void;
  onSpeed: () => void;
  onPause: () => void;
  onToggleMute: () => void;
  /** 무기 버튼 위에 마우스를 올리고 뗄 때 호출 — 아직 세우지 않은 선택 칸에
   *  그 무기의 그림자와 사거리를 미리 보여주는 데 쓴다. */
  onHoverKind: (kind: BuildKind | null) => void;
  /** 정비 시간에만 채워지는, 다음 공세의 적 구성 (없으면 예고를 숨긴다) */
  nextWave: Partial<Record<EnemyKind, number>> | null;
  /** 판에서 짚은 적의 종류 — 무기 패널보다 우선해서 정보 카드를 보여준다 */
  inspected: EnemyKind | null;
  onCloseInspect: () => void;
  /** 이 브라우저의 최고 점수·최고 도달 공세 (아직 없으면 null) */
  best: Best | null;
}) {
  const placed = selection !== null && selection.kind !== null;
  const kind = selection?.kind ?? null;

  return (
    <div className={styles.dock}>
      <div className={styles.controls}>
        <button
          type="button"
          onClick={onSpeed}
          aria-label="배속 전환"
          className={styles.controlBtn}
        >
          x{speed}
        </button>
        <button
          type="button"
          onClick={onPause}
          aria-pressed={paused}
          aria-label={paused ? '이어서 하기' : '멈추기'}
          className={styles.controlBtn}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? '소리 켜기' : '소리 끄기'}
          className={styles.controlBtn}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
      {stats.phase === 'break' ? (
        <button type="button" onClick={onCallWave} className={styles.callWaveButton}>
          미리 소집 {Math.ceil(stats.breakLeft)}초
        </button>
      ) : (
        <span className={styles.remainingTag}>남은 적 {stats.remaining}</span>
      )}

      {stats.phase === 'break' && nextWave ? <NextWaveRoster counts={nextWave} /> : null}

      <div className={styles.dockContent}>
        {inspected ? (
          <EnemyInfoCard kind={inspected} onClose={onCloseInspect} />
        ) : placed && kind ? (
          <div className={styles.selection}>
            <div className={styles.selectionTop}>
              <span className={styles.selectionIcon} style={{ color: BUILD_COLOR[kind] }}>
                <BuildGlyph kind={kind} size={20} />
              </span>
              <div className={styles.selectionInfo}>
                <p className={styles.selectionName}>
                  {BUILDS[kind].name}
                  {BUILDS[kind].upgradable ? (
                    <span className={styles.selectionLevel}>
                      레벨 {selection.level}/{MAX_LEVEL}
                    </span>
                  ) : null}
                </p>
                <p className={styles.statRow}>
                  {weaponStatParts(selection).map((part) => (
                    <span key={part}>{part}</span>
                  ))}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="닫기" className={styles.closeBtn}>
                ×
              </button>
            </div>

            <div className={styles.selectionActions}>
              {selection.nextCost !== null ? (
                <button
                  type="button"
                  onClick={onUpgrade}
                  disabled={stats.gold < selection.nextCost}
                  className={styles.upgradeBtn}
                >
                  {'강화 ' + selection.nextCost}
                </button>
              ) : selection.skillCost !== null && kind ? (
                <button
                  type="button"
                  onClick={onUnlockSkill}
                  disabled={stats.gold < selection.skillCost}
                  className={styles.skillBtn}
                >
                  <span className={styles.skillBtnName}>{SKILLS[kind].name}</span>
                  <span className={styles.skillBtnCost}>{selection.skillCost}</span>
                </button>
              ) : selection.skillUnlocked && kind ? (
                <button type="button" disabled className={styles.skillBtn}>
                  <span className={styles.skillBtnName}>✓ {SKILLS[kind].name}</span>
                </button>
              ) : (
                <button type="button" disabled className={styles.upgradeBtn}>
                  {'강화 없음'}
                </button>
              )}
              <button type="button" onClick={onSell} className={styles.sellBtn}>
                해체 +{selection.refund}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.buildPane}>
            <div className={styles.buildGrid}>
              {BUILD_ORDER.map((option) => {
                const def = BUILDS[option];
                const affordable = stats.gold >= def.cost;
                const active = pending === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onPick(option)}
                    onMouseEnter={() => onHoverKind(option)}
                    onMouseLeave={() => onHoverKind(null)}
                    disabled={!affordable}
                    aria-pressed={active}
                    className={cx(styles.buildBtn, active && styles.buildBtnActive)}
                    style={{ '--build-accent': BUILD_COLOR[option] } as CSSProperties}
                  >
                    <BuildGlyph kind={option} size={17} />
                    <span className={styles.buildText}>
                      <span className={styles.buildName}>{def.name}</span>
                      <span className={styles.buildCost}>{def.cost}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.bestRecord}>
              <p className={styles.bestRecordLabel}>이 브라우저 최고 기록</p>
              {best ? (
                <div className={styles.bestRecordRow}>
                  <span>점수 {best.score.toLocaleString('ko-KR')}</span>
                  <span>
                    공세 {best.wave}/{TOTAL_WAVES}
                  </span>
                </div>
              ) : (
                <p className={styles.bestRecordEmpty}>아직 기록 없음</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
