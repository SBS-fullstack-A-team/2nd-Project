import { GameCard } from '../components/GameCard';
import { Window } from '../components/Window';
import { GAMES } from '../games/registry';
import { useTheme } from '../lib/theme';
import classicStyles from './HomePage.classic.module.css';
import xpStyles from './HomePage.xp.module.css';

/** 메인 화면 — registry 에 등록된 게임을 카드로 보여준다 */
export function HomePage() {
  const { theme } = useTheme();
  const styles = theme === 'xp' ? xpStyles : classicStyles;

  const hero = (
    <section className={styles.hero}>
      <h1 className={styles.title}>심심할 땐, 한 판!</h1>
      <p className={styles.subtitle}>퀴즈부터 추억의 게임까지. 점수를 올리고 랭킹에 도전하세요.</p>
    </section>
  );
  const grid = (
    <ul className={styles.grid}>
      {GAMES.map((game) => (
        <li key={game.id}>
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  );

  if (theme === 'classic') {
    return (
      <>
        {hero}
        {grid}
      </>
    );
  }

  // XP — 탐색기 창 안에 안내 영역 + 파일 목록처럼 보여준다
  return (
    <Window title="심심오락실" icon="🕹️" bodyClassName={xpStyles.body}>
      {hero}
      <div className={xpStyles.panel}>
        <p className={xpStyles.count}>게임 {GAMES.length}개</p>
        {grid}
      </div>
    </Window>
  );
}
