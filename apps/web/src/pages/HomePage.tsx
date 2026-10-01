import { GameCard } from '../components/GameCard';
import { Window } from '../components/Window';
import { GAMES_BY_CARD } from '../games/registry';
import { useTheme } from '../lib/theme';
import classicStyles from './HomePage.classic.module.css';
import xpStyles from './HomePage.xp.module.css';
import win98Styles from './HomePage.win98.module.css';
import win7Styles from './HomePage.win7.module.css';
import win11Styles from './HomePage.win11.module.css';

/** 메인 화면 — registry 에 등록된 게임을 카드로 보여준다 */
export function HomePage() {
  const { theme } = useTheme();
  const styles = {
    classic: classicStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  }[theme];

  const hero = (
    <section className={styles.hero}>
      <h1 className={styles.title}>심심할 땐, 한 판!</h1>
      <p className={styles.subtitle}>퀴즈부터 추억의 게임까지. 점수를 올리고 랭킹에 도전하세요.</p>
    </section>
  );
  // 등록된 게임만 카드 번호 순서대로 보여 준다 (아직 만들지 않은 카드 번호는 숨김)
  const grid = (
    <ul className={styles.grid}>
      {GAMES_BY_CARD.map((game) => (
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

  // 바탕화면 테마 — 탐색기 창 안에 안내 영역 + 파일 목록처럼 보여준다
  return (
    <Window title="심심오락실" icon="🕹️" bodyClassName={styles.body}>
      {hero}
      <div className={styles.panel}>
        <p className={styles.count}>게임 {GAMES_BY_CARD.length}개</p>
        {grid}
      </div>
    </Window>
  );
}
