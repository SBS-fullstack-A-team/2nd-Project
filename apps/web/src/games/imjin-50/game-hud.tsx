import { TOTAL_WAVES, isBossWave } from './engine/config';
import type { Snapshot } from './engine/engine';
import { cx } from './cx';
import styles from './Imjin50.module.css';

function Chip({
  label,
  value,
  tone,
  pulse = false,
}: {
  label: string;
  value: string;
  tone: string | undefined;
  pulse?: boolean;
}) {
  return (
    <div className={styles.chip}>
      <p className={styles.chipLabel}>{label}</p>
      <p className={cx(styles.chipValue, tone, pulse && styles.pulse)}>{value}</p>
    </div>
  );
}

export function GameHud({ stats }: { stats: Snapshot }) {
  const cleared =
    stats.waveTotal > 0 ? 1 - stats.remaining / stats.waveTotal : stats.phase === 'break' ? 0 : 1;

  return (
    <header className={styles.hud}>
      <div className={styles.hudGrid}>
        <Chip
          label="성문"
          value={String(stats.lives)}
          tone={
            stats.lives > 10
              ? styles.tonePaper
              : stats.lives > 4
                ? styles.toneAmber
                : styles.toneRose
          }
          pulse={stats.lives > 0 && stats.lives <= 4}
        />
        <Chip label="군자금" value={String(stats.gold)} tone={styles.toneAmber} />
        <Chip
          label="파도"
          value={stats.wave + '/' + TOTAL_WAVES}
          tone={isBossWave(stats.wave) ? styles.toneRose : styles.toneCore}
        />
        <Chip label="점수" value={stats.score.toLocaleString('ko-KR')} tone={styles.tonePaper} />
      </div>

      <div className={styles.progressRow}>
        <div className={styles.progressTrack}>
          <div
            className={cx(styles.progressFill, stats.phase === 'wave' && styles.progressFillWave)}
            style={{ width: Math.round(Math.max(0, Math.min(1, cleared)) * 100) + '%' }}
          />
        </div>
        {stats.combo > 1 ? (
          <span className={styles.progressNoteAmber}>연쇄 x{stats.comboMul.toFixed(1)}</span>
        ) : (
          <span className={styles.progressNote}>경로 {stats.routeLength}칸</span>
        )}
      </div>
    </header>
  );
}
