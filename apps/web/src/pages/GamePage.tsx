import { Suspense, useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RankingList } from '../components/RankingList';
import { ResultModal } from '../components/ResultModal';
import { findGame, type GameMeta } from '../games/registry';
import { NotFoundPage } from './NotFoundPage';
import styles from './GamePage.module.css';

/** 게임 실행 페이지 (/games/:gameId) — registry 에서 게임을 찾아 실행한다 */
export function GamePage() {
  const { gameId } = useParams();
  const game = findGame(gameId);

  if (!game) return <NotFoundPage message="존재하지 않는 게임이에요." />;
  // 다른 게임으로 이동하면 상태를 초기화하기 위해 key 로 새로 마운트한다
  return <GameRunner key={game.id} game={game} />;
}

function GameRunner({ game }: { game: GameMeta }) {
  // round 가 바뀌면 게임 컴포넌트를 새로 마운트해서 처음부터 다시 시작한다
  const [round, setRound] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const Game = game.component;

  const handleFinish = useCallback((score: number) => {
    setFinalScore((prev) => prev ?? score);
  }, []);

  function handleRetry() {
    setFinalScore(null);
    setRound((r) => r + 1);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to="/" className={styles.back}>
          ← 게임 목록
        </Link>
        <h1 className={styles.title}>{game.name}</h1>
        <p className={styles.description}>{game.description}</p>
      </div>

      <div className={styles.content}>
        <section className={styles.stage}>
          <ErrorBoundary fallback={<p>게임을 불러오지 못했어요. 새로고침해 주세요.</p>}>
            <Suspense fallback={<p>게임을 불러오는 중…</p>}>
              <Game key={round} onFinish={handleFinish} />
            </Suspense>
          </ErrorBoundary>
        </section>

        <aside className={styles.side}>
          <h2 className={styles.sideTitle}>랭킹</h2>
          <RankingList gameId={game.id} refreshKey={round} />
        </aside>
      </div>

      {finalScore !== null && (
        <ResultModal
          gameId={game.id}
          gameName={game.name}
          score={finalScore}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
