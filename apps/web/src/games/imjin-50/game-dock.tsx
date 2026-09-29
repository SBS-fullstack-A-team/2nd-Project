import type { CSSProperties } from 'react';
import { BUILDS, BUILD_ORDER, MAX_LEVEL, type BuildKind } from './engine/config';
import type { Snapshot } from './engine/engine';
import { BUILD_COLOR } from './config';
import { BuildGlyph } from './build-glyph';
import { cx } from './cx';
import styles from './Imjin50.module.css';

export interface DockSelection {
  col: number;
  row: number;
  kind: BuildKind | null;
  level: number;
  dps: number;
  range: number;
  /** 그 시설만의 고유 능력치 (이미 문구로 완성됨) */
  trait: string | null;
  nextCost: number | null;
  refund: number;
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
  onSell,
  onClose,
  onCallWave,
  onSpeed,
  onPause,
  onToggleMute,
  onHoverKind,
}: {
  stats: Snapshot;
  selection: DockSelection | null;
  pending: BuildKind | null;
  speed: number;
  paused: boolean;
  muted: boolean;
  onPick: (kind: BuildKind) => void;
  onUpgrade: () => void;
  onSell: () => void;
  onClose: () => void;
  onCallWave: () => void;
  onSpeed: () => void;
  onPause: () => void;
  onToggleMute: () => void;
  /** 무기 버튼 위에 마우스를 올리고 뗄 때 호출 — 아직 세우지 않은 선택 칸에
   *  그 무기의 그림자와 사거리를 미리 보여주는 데 쓴다. */
  onHoverKind: (kind: BuildKind | null) => void;
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
        <button type="button" onClick={onPause} className={styles.controlBtn}>
          {paused ? '계속' : '멈춤'}
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

      <div className={styles.dockContent}>
        {placed && kind ? (
          <div className={styles.selection}>
            <div className={styles.selectionTop}>
              <span className={styles.selectionIcon} style={{ color: BUILD_COLOR[kind] }}>
                <BuildGlyph kind={kind} size={20} />
              </span>
              <div className={styles.selectionInfo}>
                <p className={styles.selectionName}>
                  {kind === 'wall' && selection.level >= 2 ? '녹채' : BUILDS[kind].name}
                  {BUILDS[kind].upgradable ? (
                    <span className={styles.selectionLevel}>
                      레벨 {selection.level}/{MAX_LEVEL}
                    </span>
                  ) : null}
                </p>
                <p className={styles.selectionStats}>
                  {selection.dps > 0
                    ? '초당 ' +
                      Math.round(selection.dps) +
                      ' · 사거리 ' +
                      selection.range.toFixed(2) +
                      (selection.trait ? ' · ' + selection.trait : '')
                    : (selection.trait ?? '길만 막는 울타리 · 강화하면 녹채')}
                </p>
              </div>
              <button type="button" onClick={onClose} className={styles.closeBtn}>
                닫기
              </button>
            </div>

            <div className={styles.selectionActions}>
              <button
                type="button"
                onClick={onUpgrade}
                disabled={selection.nextCost === null || stats.gold < selection.nextCost}
                className={styles.upgradeBtn}
              >
                {selection.nextCost === null
                  ? BUILDS[kind].upgradable
                    ? '최대 레벨'
                    : '강화 없음'
                  : '강화 ' + selection.nextCost}
              </button>
              <button type="button" onClick={onSell} className={styles.sellBtn}>
                해체 +{selection.refund}
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
