import { BUILDS, BUILD_ORDER, START_LIVES, TOTAL_WAVES } from './engine/config';
import { BUILD_COLOR } from './config';
import { BuildGlyph } from './build-glyph';
import { cx } from './cx';
import styles from './Imjin50.module.css';

export function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className={styles.sheet}>
      <div className={styles.sheetInner}>
        <p className={styles.introKicker}>1592년 · 작전 개요</p>
        <h1 className={styles.introTitle}>임진 50</h1>
        <p className={styles.introBody}>
          왜군이 남쪽 상륙 지점으로 들어와 1번부터 4번 경유지를 차례로 지나 성문으로 향합니다.
          당신이 세운 목책과 화포는 모두 왜군의 발을 막으므로, 길을 늘리는 것이 곧 방어입니다.
        </p>

        <ol className={styles.ruleList}>
          <li>빈 칸을 눌러 목책과 화포를 세웁니다. 어느 칸이든 세울 수 있습니다.</li>
          <li>길을 완전히 막는 배치는 거부됩니다. 통로는 반드시 한 줄 남습니다.</li>
          <li>척후병은 목책을 넘어 직선으로 움직입니다. 미로만으로는 막지 못합니다.</li>
        </ol>

        <ul className={styles.buildLegend}>
          {BUILD_ORDER.map((kind) => (
            <li key={kind} className={styles.buildLegendItem}>
              <span className={styles.buildLegendIcon} style={{ color: BUILD_COLOR[kind] }}>
                <BuildGlyph kind={kind} size={20} />
              </span>
              <div>
                <p className={styles.buildLegendName}>
                  {BUILDS[kind].name}
                  <span className={styles.buildLegendCost}>{BUILDS[kind].cost}</span>
                </p>
                <p className={styles.buildLegendBlurb}>{BUILDS[kind].blurb}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className={styles.footNote}>
          성문 {START_LIVES}으로 {TOTAL_WAVES}번의 파도를 상대합니다. 정비 시간이 남았을 때 미리
          소집하면 남은 초만큼 군자금과 점수를 더 받습니다. 파도 구성은 모든 플레이어에게
          똑같습니다.
        </p>

        <button type="button" onClick={onStart} className={styles.primaryBtn}>
          방어 시작
        </button>
      </div>
    </div>
  );
}

export function PauseOverlay({
  onResume,
  onRestart,
}: {
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <div className={styles.sheet}>
      <div className={cx(styles.sheetInner, styles.pauseHeading)}>
        <p className={styles.introKicker}>일시정지</p>
        <h2 className={styles.introTitle}>방어 중단</h2>
        <div className={styles.stackedActions}>
          <button type="button" onClick={onResume} className={styles.resumeBtn}>
            이어서 방어
          </button>
          <button type="button" onClick={onRestart} className={styles.stackedBtn}>
            처음부터 다시
          </button>
        </div>
      </div>
    </div>
  );
}
