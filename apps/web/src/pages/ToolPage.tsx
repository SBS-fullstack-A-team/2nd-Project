import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Window } from '../components/Window';
import { findTool, type ToolMeta } from '../tools/registry';
import { useTheme } from '../lib/theme';
import { NotFoundPage } from './NotFoundPage';
// 화면 틀은 게임 페이지와 같다 (랭킹 자리만 없다)
import classicStyles from './GamePage.classic.module.css';
import xpStyles from './GamePage.xp.module.css';
import win98Styles from './GamePage.win98.module.css';
import win7Styles from './GamePage.win7.module.css';
import win11Styles from './GamePage.win11.module.css';
import toolStyles from './ToolPage.module.css';

/** 방송 도구 실행 페이지 (/tools/:toolId) — 점수·랭킹 없이 도구만 넓게 보여 준다 */
export function ToolPage() {
  const { toolId } = useParams();
  const tool = findTool(toolId);

  if (!tool) return <NotFoundPage message="존재하지 않는 방송 도구예요." />;
  return <ToolRunner key={tool.id} tool={tool} />;
}

function ToolRunner({ tool }: { tool: ToolMeta }) {
  const Tool = tool.component;
  const navigate = useNavigate();
  const { theme } = useTheme();
  const stageRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Esc 등으로 전체 화면이 풀려도 버튼 상태를 맞춘다
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  }

  const fullscreenButton = (
    <button
      type="button"
      className={`btn ${toolStyles.fullscreenButton}`}
      onClick={toggleFullscreen}
    >
      {fullscreen ? '전체 화면 끄기' : '⛶ 전체 화면'}
    </button>
  );
  const stage = (
    <ErrorBoundary fallback={<p>도구를 불러오지 못했어요. 새로고침해 주세요.</p>}>
      <Suspense fallback={<p>도구를 불러오는 중…</p>}>
        <Tool />
      </Suspense>
    </ErrorBoundary>
  );

  if (theme === 'classic') {
    const styles = classicStyles;
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <Link to="/" className={styles.back}>
            ← 목록으로
          </Link>
          <h1 className={styles.title}>{tool.name}</h1>
          <p className={styles.description}>{tool.description}</p>
        </div>
        <div className={toolStyles.actions}>{fullscreenButton}</div>
        <section ref={stageRef} className={`${styles.stage} ${toolStyles.stage}`}>
          {stage}
        </section>
      </div>
    );
  }

  const styles = { xp: xpStyles, win98: win98Styles, win7: win7Styles, win11: win11Styles }[theme];
  return (
    <div className={styles.page}>
      <Window title={tool.name} icon="📺" onClose={() => navigate('/')}>
        <div className={styles.toolbar}>
          <Link to="/" className="btn">
            ← 목록으로
          </Link>
          <p className={styles.description}>{tool.description}</p>
          {fullscreenButton}
        </div>
        <h1 className={styles.srOnly}>{tool.name}</h1>
        <section ref={stageRef} className={`${styles.screen} ${toolStyles.stage}`}>
          {stage}
        </section>
      </Window>
    </div>
  );
}
