import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BUILDS, BUILD_ORDER, START_LIVES, TOTAL_WAVES } from './engine/config';
import type { RunResult, Snapshot } from './engine/engine';
import { formatElapsed } from './format';
import { BUILD_COLOR } from './config';
import { BuildGlyph } from './build-glyph';
import { cx } from './cx';
import { IntroBackdrop } from './intro-backdrop';
import { WeaponCodex } from './weapon-codex';
import styles from './Imjin50.module.css';

export function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className={styles.introFrame}>
      <IntroBackdrop />
      <div className={styles.introScroll}>
        <div className={styles.sheetInner}>
          <p className={styles.introKicker}>1592년 · 작전 개요</p>
          <h1 className={styles.introTitle}>임진 50</h1>
          <p className={styles.introBody}>
            부산포가 무너진 뒤 왜군은 파죽지세로 북진해 한양과 평양을 차례로 삼켰습니다. 임금은 몸을
            피했고, 이 땅을 지키던 장수들은 하나둘 쓰러졌습니다.
          </p>
          <p className={styles.introBody}>
            이제 남은 장수는 당신 한 사람뿐입니다. 왜군의 마지막 대군이 이 성을 향해 상륙하고
            있습니다.
          </p>
          <p className={styles.introStakes}>
            이 성문이 열리는 순간, 조선은 이 전쟁에서 패합니다. 쉰 차례 밀려오는 왜군의 공세를
            끝까지 막아 내십시오.
          </p>

          <div className={styles.introPanel}>
            <p className={styles.introSection}>군령</p>
            <ol className={styles.ruleList}>
              <li>
                왜군은 바닷가 상륙 지점에서 들어와 一·二·三·四 군기를 차례로 지나 성문으로 향합니다.
              </li>
              <li>
                빈 칸을 눌러 목책과 무기를 세웁니다. 세운 것은 모두 벽이 되니, 길을 길게 접을수록
                왜군은 오래 헤매고 우리는 오래 싸울 수 있습니다.
              </li>
              <li>길을 완전히 막을 수는 없습니다. 통로는 반드시 한 줄 남아야 합니다.</li>
              <li>
                척후병은 목책을 넘어 곧장 달려옵니다. 미로만 믿지 말고 궁수대와 화차로 맞서십시오.
              </li>
            </ol>

            <p className={styles.introSection}>군기고</p>
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
              성문의 버틸 힘은 {START_LIVES}입니다. 왜군이 성문을 뚫을 때마다 깎이고, 갑주를 두른
              사무라이와 왜장은 한 번에 크게 깎습니다. {TOTAL_WAVES}차례의 공세 사이 정비 시간에
              군사를 미리 소집하면 남은 초만큼 군자금과 점수를 더 받습니다. 왜군의 공세는 누구에게나
              똑같이 밀려옵니다.
            </p>

            <button type="button" onClick={onStart} className={styles.primaryBtn}>
              최후의 방어 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 결말 장면이 떠 있는 시간. 그 뒤엔 자동으로 결과창(점수 등록·랭킹)으로 넘어간다. */
const ENDING_SECONDS = 7;

/** 성문이 무너지거나 쉰 차례의 공세를 다 막았을 때, 공통 결과창에 앞서 보여주는 결말. */
export function EndingOverlay({ result, onProceed }: { result: RunResult; onProceed: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onProceed, ENDING_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [onProceed]);

  const won = result.victory;
  const held = won ? TOTAL_WAVES : Math.max(0, result.wave - 1);

  return (
    <div
      className={cx(styles.sheet, styles.sheetCenter, won ? styles.endingWon : styles.endingLost)}
    >
      <div className={styles.endingInner}>
        <p className={styles.introKicker}>{won ? '1592년 · 완전 방어' : '1592년 · 성문 함락'}</p>
        <h2 className={styles.endingTitle}>
          {won ? '조선을 지켜 냈습니다' : '조선이 무너졌습니다'}
        </h2>
        <p className={styles.endingBody}>
          {won
            ? '쉰 차례의 공세가 모두 이 성벽 앞에서 꺾였습니다. 왜군은 바다로 물러가고, 조선은 다시 일어설 시간을 얻었습니다.'
            : `마지막 성문이 제${result.wave}차 공세에 열렸습니다. 왜군이 성 안으로 쏟아져 들어오고, 이 전쟁은 여기서 끝이 납니다.`}
        </p>

        <dl className={styles.endingStats}>
          <div>
            <dt>막아 낸 공세</dt>
            <dd>
              {held}/{TOTAL_WAVES}
            </dd>
          </div>
          <div>
            <dt>격파</dt>
            <dd>{result.kills.toLocaleString('ko-KR')}</dd>
          </div>
          <div>
            <dt>교전 시간</dt>
            <dd>{formatElapsed(result.durationMs)}</dd>
          </div>
          <div>
            <dt>점수</dt>
            <dd>{result.score.toLocaleString('ko-KR')}</dd>
          </div>
        </dl>

        <button type="button" onClick={onProceed} className={styles.primaryBtn}>
          전과 기록하기
        </button>
        <p className={styles.endingHint}>잠시 뒤 결과 화면으로 넘어갑니다</p>
      </div>
    </div>
  );
}

export function PauseOverlay({
  stats,
  onResume,
  onRestart,
}: {
  stats: Snapshot;
  onResume: () => void;
  onRestart: () => void;
}) {
  const [view, setView] = useState<'menu' | 'codex'>('menu');

  if (view === 'codex') {
    return (
      <div key="codex" className={styles.sheet}>
        <div className={styles.sheetInner}>
          <div className={styles.codexBar}>
            <button type="button" onClick={() => setView('menu')} className={styles.barBtn}>
              ← 돌아가기
            </button>
            <button type="button" onClick={onResume} className={styles.barBtnPrimary}>
              이어서 방어
            </button>
          </div>
          <h2 className={styles.codexTitle}>무기·강화 도감</h2>
          <p className={styles.codexIntro}>
            세운 것은 모두 벽이 되어 길을 막습니다. 무기는 강화할 때마다 공격력이 1.7배씩 오르고
            사거리도 넓어집니다.
          </p>
          <WeaponCodex />
        </div>
      </div>
    );
  }

  return (
    <div key="menu" className={cx(styles.sheet, styles.sheetCenter)}>
      <div className={styles.pauseInner}>
        <p className={styles.introKicker}>일시정지</p>
        <h2 className={styles.introTitle}>방어 중단</h2>
        <p className={styles.pauseSummary}>
          공세 {stats.wave}/{TOTAL_WAVES} · 성문 {stats.lives} · 점수{' '}
          {stats.score.toLocaleString('ko-KR')}
        </p>
        <div className={styles.stackedActions}>
          <button type="button" onClick={onResume} className={styles.resumeBtn}>
            이어서 방어
          </button>
          <button type="button" onClick={onRestart} className={styles.stackedBtn}>
            처음부터 다시
          </button>
          <button type="button" onClick={() => setView('codex')} className={styles.stackedBtn}>
            무기·강화 도감
          </button>
          <Link to="/" className={styles.stackedBtn}>
            게임 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
