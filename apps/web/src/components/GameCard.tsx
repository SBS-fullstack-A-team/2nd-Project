import { Link } from 'react-router';
import { CATEGORY_LABEL, type GameMeta } from '../games/registry';
import { useThemeStyles } from '../lib/theme';
import classicStyles from './GameCard.classic.module.css';
import xpStyles from './GameCard.xp.module.css';
import win98Styles from './GameCard.win98.module.css';
import win7Styles from './GameCard.win7.module.css';
import win11Styles from './GameCard.win11.module.css';

/** 메인 화면의 게임 카드 */
export function GameCard({ game }: { game: GameMeta }) {
  const styles = useThemeStyles({
    classic: classicStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  });
  return (
    <Link to={`/games/${game.id}`} className={styles.card}>
      <img className={styles.thumbnail} src={game.thumbnail} alt="" />
      <div className={styles.body}>
        <span className={styles.category}>{CATEGORY_LABEL[game.category]}</span>
        <h2 className={styles.name}>{game.name}</h2>
        <p className={styles.description}>{game.description}</p>
      </div>
    </Link>
  );
}

/** 아직 게임이 등록되지 않은 카드 칸 — "준비 중" 표시 (눌러도 이동하지 않는다) */
export function ComingSoonCard({ card, owner }: { card: number; owner: string }) {
  const styles = useThemeStyles({
    classic: classicStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  });
  return (
    <div className={`${styles.card} ${styles.comingSoon}`}>
      <div className={`${styles.thumbnail} ${styles.placeholder}`} aria-hidden="true">
        <span className={styles.placeholderIcon}>🚧</span>
        <span>CARD {card}</span>
      </div>
      <div className={styles.body}>
        <span className={styles.category}>
          카드 {card} · 담당 {owner}
        </span>
        <h2 className={styles.name}>준비 중</h2>
        <p className={styles.description}>새 게임을 만들고 있어요. 조금만 기다려 주세요!</p>
      </div>
    </div>
  );
}
