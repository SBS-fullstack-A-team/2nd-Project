import { Link } from 'react-router';
import { CATEGORY_LABEL, type GameMeta } from '../games/registry';
import { useThemeStyles } from '../lib/theme';
import classicStyles from './GameCard.classic.module.css';
import xpStyles from './GameCard.xp.module.css';

/** 메인 화면의 게임 카드 */
export function GameCard({ game }: { game: GameMeta }) {
  const styles = useThemeStyles({ classic: classicStyles, xp: xpStyles });
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
