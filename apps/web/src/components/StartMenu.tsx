import { Link } from 'react-router';
import { GAMES } from '../games/registry';
import { THEMES, THEME_ICON, THEME_LABEL, useTheme, useThemeStyles } from '../lib/theme';
import xpStyles from './StartMenu.xp.module.css';
import win98Styles from './StartMenu.win98.module.css';

const REPO_URL = 'https://github.com/SBS-fullstack-A-team/simsim-arcade';

// 카드 번호 순서대로, 카드 번호가 없는 게임(샘플 등)은 뒤에
const MENU_GAMES = [...GAMES].sort(
  (a, b) => (a.card ?? Number.MAX_SAFE_INTEGER) - (b.card ?? Number.MAX_SAFE_INTEGER),
);

interface StartMenuProps {
  id: string;
  /** 메뉴 항목을 누르면 호출된다 — 메뉴를 닫는다 */
  onClose: () => void;
}

/** 시작 메뉴 (XP·98) — 게임 목록, 바로가기, 테마 선택 */
export function StartMenu({ id, onClose }: StartMenuProps) {
  const { theme, setTheme } = useTheme();
  const styles = useThemeStyles({ classic: xpStyles, xp: xpStyles, win98: win98Styles });

  return (
    <div id={id} className={styles.menu}>
      {/* 98 스타일의 세로 배너 (XP 스타일에서는 숨김) */}
      <div className={styles.banner} aria-hidden="true">
        심심오락실 <strong>98</strong>
      </div>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.avatar} aria-hidden="true">
            🕹️
          </span>
          <span className={styles.userName}>심심오락실</span>
        </div>

        <div className={styles.columns}>
          <nav className={styles.left} aria-label="게임">
            <p className={styles.sectionTitle}>게임</p>
            <ul className={styles.list}>
              {MENU_GAMES.map((game) => (
                <li key={game.id}>
                  <Link to={`/games/${game.id}`} className={styles.gameItem} onClick={onClose}>
                    <img className={styles.gameThumb} src={game.thumbnail} alt="" />
                    <span className={styles.gameText}>
                      <strong>{game.name}</strong>
                      <span className={styles.gameDesc}>{game.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.right} aria-label="바로가기">
            <ul className={styles.list}>
              <li>
                <Link to="/" className={styles.placeItem} onClick={onClose}>
                  <span aria-hidden="true">🏠</span> 게임 목록
                </Link>
              </li>
              <li>
                <Link to="/qna" className={styles.placeItem} onClick={onClose}>
                  <span aria-hidden="true">❓</span> Q&amp;A · 도움말
                </Link>
              </li>
              <li className={styles.separator} aria-hidden="true" />
              <li>
                <a
                  href={REPO_URL}
                  className={styles.placeItem}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onClose}
                >
                  <span aria-hidden="true">📁</span> 프로젝트 소개 (GitHub)
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerLabel}>🎨 테마</span>
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.footerButton} ${t === theme ? styles.footerCurrent : ''}`}
              aria-pressed={t === theme}
              onClick={() => {
                setTheme(t);
                onClose();
              }}
            >
              <span aria-hidden="true">{THEME_ICON[t]}</span> {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
