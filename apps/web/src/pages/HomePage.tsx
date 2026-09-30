import { ComingSoonCard, GameCard } from '../components/GameCard';
import { Window } from '../components/Window';
import { GAME_CARD_SLOTS, GAMES } from '../games/registry';
import { useTheme } from '../lib/theme';
import classicStyles from './HomePage.classic.module.css';
import xpStyles from './HomePage.xp.module.css';
import win98Styles from './HomePage.win98.module.css';

/** 메인 화면 — registry 에 등록된 게임을 카드로 보여준다 */
export function HomePage() {
  const { theme } = useTheme();
  const styles = { classic: classicStyles, xp: xpStyles, win98: win98Styles }[theme];

  const hero = (
    <section className={styles.hero}>
      <h1 className={styles.title}>심심할 땐, 한 판!</h1>
      <p className={styles.subtitle}>퀴즈부터 추억의 게임까지. 점수를 올리고 랭킹에 도전하세요.</p>
    </section>
  );
  // 카드 칸 번호 순서대로 등록된 게임을 넣고, 비어 있는 칸은 "준비 중" 으로 채운다.
  // 카드 번호가 없는 게임(샘플 등)은 카드 칸 뒤에 둔다.
  const slotCards = new Set(GAME_CARD_SLOTS.map((slot) => slot.card));
  const extraGames = GAMES.filter((game) => game.card === undefined || !slotCards.has(game.card));
  const comingSoonCount = GAME_CARD_SLOTS.filter(
    (slot) => !GAMES.some((game) => game.card === slot.card),
  ).length;

  const grid = (
    <ul className={styles.grid}>
      {GAME_CARD_SLOTS.map((slot) => {
        const game = GAMES.find((g) => g.card === slot.card);
        return (
          <li key={`card-${slot.card}`}>
            {game ? (
              <GameCard game={game} />
            ) : (
              <ComingSoonCard card={slot.card} owner={slot.owner} />
            )}
          </li>
        );
      })}
      {extraGames.map((game) => (
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
    <Window title="심심오락실" icon="🕹️" bodyClassName={styles.body}>
      {hero}
      <div className={styles.panel}>
        <p className={styles.count}>
          게임 {GAMES.length}개{comingSoonCount > 0 && ` · 준비 중 ${comingSoonCount}개`}
        </p>
        {grid}
      </div>
    </Window>
  );
}
