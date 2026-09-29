import { Link } from 'react-router';
import { GAMES } from '../games/registry';
import { THEME_LABEL, useTheme } from '../lib/theme';
import styles from './StartMenu.module.css';

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

/** XP 시작 메뉴 — 왼쪽 게임 목록, 오른쪽 바로가기, 아래 테마 전환 */
export function StartMenu({ id, onClose }: StartMenuProps) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'xp' ? 'classic' : 'xp';

  return (
    <div id={id} className={styles.menu}>
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
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => {
            toggleTheme();
            onClose();
          }}
        >
          <span className={styles.footerIcon} aria-hidden="true">
            🎨
          </span>
          {THEME_LABEL[nextTheme]} 테마로 바꾸기
        </button>
      </div>
    </div>
  );
}
