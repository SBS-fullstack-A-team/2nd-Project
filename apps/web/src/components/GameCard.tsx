import { Link } from 'react-router';
import { useThemeStyles } from '../lib/theme';
import classicStyles from './GameCard.classic.module.css';
import xpStyles from './GameCard.xp.module.css';
import win98Styles from './GameCard.win98.module.css';
import win7Styles from './GameCard.win7.module.css';
import win11Styles from './GameCard.win11.module.css';

/** 카드에 보여 줄 항목 — 게임(GameMeta)과 방송 도구(ToolMeta) 모두 이 모양을 가진다 */
interface CardItem {
  name: string;
  description: string;
  thumbnail: string;
}

interface GameCardProps {
  item: CardItem;
  /** 눌렀을 때 이동할 주소 (예: /games/hint-quiz, /tools/marble-race) */
  to: string;
  /** 썸네일 아래 분류 표시 (예: 퀴즈, 방송 도구) */
  label: string;
}

/** 메인 화면의 카드 — 게임과 방송 도구가 함께 쓴다 */
export function GameCard({ item, to, label }: GameCardProps) {
  const styles = useThemeStyles({
    classic: classicStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  });
  return (
    <Link to={to} className={styles.card}>
      <img className={styles.thumbnail} src={item.thumbnail} alt="" />
      <div className={styles.body}>
        <span className={styles.category}>{label}</span>
        <h2 className={styles.name}>{item.name}</h2>
        <p className={styles.description}>{item.description}</p>
      </div>
    </Link>
  );
}
