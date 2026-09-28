import { GameCard } from '../components/GameCard';
import { GAMES } from '../games/registry';
import styles from './HomePage.module.css';

/** 메인 화면 — registry 에 등록된 게임을 카드로 보여준다 */
export function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.title}>심심할 땐, 한 판!</h1>
        <p className={styles.subtitle}>
          퀴즈부터 추억의 게임까지. 점수를 올리고 랭킹에 도전하세요.
        </p>
      </section>
      <ul className={styles.grid}>
        {GAMES.map((game) => (
          <li key={game.id}>
            <GameCard game={game} />
          </li>
        ))}
      </ul>
    </>
  );
}
