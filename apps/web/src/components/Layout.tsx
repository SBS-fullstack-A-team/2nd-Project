import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useMatch } from 'react-router';
import { findGame } from '../games/registry';
import { useTheme } from '../lib/theme';
import { StartMenu } from './StartMenu';
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
        <nav className={styles.nav}>
          <Link to="/qna" className="btn">
            Q&amp;A
          </Link>
          <ThemeToggle className="btn" />
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>© simsim-arcade</footer>
    </div>
  );
}

/** XP — 바탕화면 + 하단 작업 표시줄 (시작 메뉴 · 열린 창 · 시계) */
function XpLayout() {
  const styles = xpStyles;
  const { pathname } = useLocation();
  const gameMatch = useMatch('/games/:gameId');
  const game = findGame(gameMatch?.params.gameId);
  const isQna = pathname === '/qna';

  const [menuOpen, setMenuOpen] = useState(false);
  const startAreaRef = useRef<HTMLDivElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);

  // 메뉴가 열려 있을 때 바깥을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!startAreaRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        startButtonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={styles.desktop}>
      <main className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.taskbar}>
        <div ref={startAreaRef} className={styles.startArea}>
          <button
            ref={startButtonRef}
            type="button"
            className={`${styles.start} ${menuOpen ? styles.startOpen : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="start-menu"
          >
            <span aria-hidden="true">🕹️</span>
            <span>시작</span>
          </button>
          {menuOpen && <StartMenu id="start-menu" onClose={() => setMenuOpen(false)} />}
        </div>
        <div className={styles.tasks}>
          <Link to="/" className={`${styles.task} ${pathname === '/' ? styles.taskActive : ''}`}>
            🕹️ 심심오락실
          </Link>
          {game && (
            <span className={`${styles.task} ${styles.taskActive}`} aria-current="page">
              🎮 {game.name}
            </span>
          )}
          {isQna && (
            <span className={`${styles.task} ${styles.taskActive}`} aria-current="page">
              ❓ Q&amp;A
            </span>
          )}
        </div>
        <div className={styles.tray}>
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
