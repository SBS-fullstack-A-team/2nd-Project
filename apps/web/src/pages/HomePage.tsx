import { GameCard } from '../components/GameCard';
import { Window } from '../components/Window';
import { CATEGORY_LABEL, GAMES_BY_CARD } from '../games/registry';
import { TOOL_LABEL, TOOLS } from '../tools/registry';
import { useTheme } from '../lib/theme';
import classicStyles from './HomePage.classic.module.css';
import xpStyles from './HomePage.xp.module.css';
import win98Styles from './HomePage.win98.module.css';
import win7Styles from './HomePage.win7.module.css';
import win11Styles from './HomePage.win11.module.css';
import sectionStyles from './HomePage.module.css';

/** 메인 화면 — registry 에 등록된 게임과 방송 도구를 섹션별 카드로 보여준다 */
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
  const gameGrid = (
    <ul className={styles.grid}>
      {GAMES_BY_CARD.map((game) => (
        <li key={game.id}>
          <GameCard item={game} to={`/games/${game.id}`} label={CATEGORY_LABEL[game.category]} />
        </li>
      ))}
    </ul>
  );
  // 방송 도구 — 점수·랭킹 없는 추첨 도구 등. 등록된 도구가 없으면 섹션째 숨긴다
  const toolSection = TOOLS.length > 0 && (
    <section className={sectionStyles.section} aria-labelledby="home-tools">
      <h2 id="home-tools" className={sectionStyles.sectionTitle}>
        📺 {TOOL_LABEL}
        <span className={sectionStyles.sectionNote}>스트리머용 추첨 도구 · 점수·랭킹 없음</span>
      </h2>
      <ul className={styles.grid}>
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <GameCard item={tool} to={`/tools/${tool.id}`} label={TOOL_LABEL} />
          </li>
        ))}
      </ul>
    </section>
  );
  const gameSection = (
    <section className={sectionStyles.section} aria-labelledby="home-games">
      {/* 방송 도구가 있을 때만 "게임" 제목을 붙여 두 섹션을 구분한다 */}
      {TOOLS.length > 0 && (
        <h2 id="home-games" className={sectionStyles.sectionTitle}>
          🎮 게임
        </h2>
      )}
      {gameGrid}
    </section>
  );

  if (theme === 'classic') {
    return (
      <>
        {hero}
        {gameSection}
        {toolSection}
      </>
    );
  }

  // 바탕화면 테마 — 탐색기 창 안에 안내 영역 + 파일 목록처럼 보여준다
  return (
    <Window title="심심오락실" icon="🕹️" bodyClassName={styles.body}>
      {hero}
      <div className={styles.panel}>
        <p className={styles.count}>
          게임 {GAMES_BY_CARD.length}개{TOOLS.length > 0 && ` · ${TOOL_LABEL} ${TOOLS.length}개`}
        </p>
        {gameSection}
        {toolSection}
      </div>
    </Window>
  );
}
