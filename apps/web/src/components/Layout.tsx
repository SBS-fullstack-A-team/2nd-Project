import { useEffect, useState } from 'react';
import { Link, Outlet, useMatch } from 'react-router';
import { findGame } from '../games/registry';
import { useTheme } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';
import classicStyles from './Layout.classic.module.css';
import xpStyles from './Layout.xp.module.css';

export function Layout() {
  const { theme } = useTheme();
  return theme === 'xp' ? <XpLayout /> : <ClassicLayout />;
}

/** 클래식 — 상단 헤더 + 본문 + 하단 푸터 */
function ClassicLayout() {
  const styles = classicStyles;
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          🕹️ 심심오락실
        </Link>
        <ThemeToggle className="btn" />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>© simsim-arcade</footer>
    </div>
  );
}

/** XP — 바탕화면 + 하단 작업 표시줄 (시작 버튼 · 열린 창 · 테마 전환 · 시계) */
function XpLayout() {
  const styles = xpStyles;
  const gameMatch = useMatch('/games/:gameId');
  const game = findGame(gameMatch?.params.gameId);

  return (
    <div className={styles.desktop}>
      <main className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.taskbar}>
        <Link to="/" className={styles.start}>
          <span aria-hidden="true">🕹️</span>
          <span>시작</span>
        </Link>
        <div className={styles.tasks}>
          <Link to="/" className={`${styles.task} ${game ? '' : styles.taskActive}`}>
            🕹️ 심심오락실
          </Link>
          {game && (
            <span className={`${styles.task} ${styles.taskActive}`} aria-current="page">
              🎮 {game.name}
            </span>
          )}
        </div>
        <div className={styles.tray}>
          <ThemeToggle className={styles.trayButton} />
          <Clock />
        </div>
      </footer>
    </div>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

/** 작업 표시줄 오른쪽 알림 영역 시계 */
function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 10_000);
    return () => clearInterval(id);
  }, []);

  return <span>{time}</span>;
}
