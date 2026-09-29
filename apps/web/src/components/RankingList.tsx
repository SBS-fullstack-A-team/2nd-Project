import { RANKING_DEFAULT_LIMIT } from '@simsim/shared';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useThemeStyles } from '../lib/theme';
import classicStyles from './RankingList.classic.module.css';
import xpStyles from './RankingList.xp.module.css';
import win98Styles from './RankingList.win98.module.css';

interface RankingListProps {
  gameId: string;
  limit?: number;
  /** 강조할 기록 id (방금 등록한 내 점수) */
  highlightId?: number;
  /** 값이 바뀌면 랭킹을 다시 불러온다 */
  refreshKey?: number | string;
}

/** 공통 랭킹 목록 */
export function RankingList({
  gameId,
  limit = RANKING_DEFAULT_LIMIT,
  highlightId,
  refreshKey = 0,
}: RankingListProps) {
  const styles = useThemeStyles({ classic: classicStyles, xp: xpStyles, win98: win98Styles });
  const ranking = useFetch(`${gameId}:${limit}:${refreshKey}`, () => api.getRanking(gameId, limit));

  if (ranking.status === 'loading') return <p className={styles.message}>랭킹 불러오는 중…</p>;
  if (ranking.status === 'error') return <p className={styles.message}>{ranking.error}</p>;
  if (ranking.data.items.length === 0) {
    return <p className={styles.message}>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>;
  }

  return (
    <ol className={styles.list}>
      {ranking.data.items.map((entry) => (
        <li
          key={entry.id}
          className={`${styles.item} ${entry.id === highlightId ? styles.mine : ''}`}
        >
          <span className={styles.rank}>{entry.rank}</span>
          <span className={styles.nickname}>{entry.nickname}</span>
          <span className={styles.score}>{entry.score}점</span>
        </li>
      ))}
    </ol>
  );
}
