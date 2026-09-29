import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NICKNAME_MAX_LENGTH, type GameProps, type SubmitScoreResponse } from '@simsim/shared';
import { api, getErrorMessage } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import {
  BLADES,
  GAME_ID,
  HOW_TO_PLAY,
  QUESTS,
  RANKING_SIZE,
  type BladeDef,
  type BladeId,
} from './config';
import { FruitSlicerEngine } from './engine';
import { QuestManager, type QuestSnapshot } from './QuestManager';
import styles from './FruitSlicer.module.css';

type MenuView = 'main' | 'blades' | 'quests' | 'howto';

type Screen =
  | { name: 'menu'; view: MenuView }
  | { name: 'playing' }
  | { name: 'nameEntry'; score: number }
  | { name: 'ranking'; score: number | null; submitted: SubmitScoreResponse | null };

interface Toast {
  id: number;
  blade: BladeDef;
}

/**
 * 과일 슬라이서 — Canvas 로 그리는 Fruit Ninja 스타일 게임.
 * 게임 오버 시 게임 안에서 이름을 받아 서버 랭킹(공통 점수 API)에 등록하고 TOP 5 를 보여준다.
 * 그래서 공통 결과창과 중복되지 않도록 onFinish 는 호출하지 않는다.
 */
export default function FruitSlicer(_props: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FruitSlicerEngine | null>(null);
  const [quests] = useState(() => new QuestManager());
  const [snapshot, setSnapshot] = useState<QuestSnapshot>(() => quests.snapshot());
  const [screen, setScreen] = useState<Screen>({ name: 'menu', view: 'main' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timers = new Set<number>();
    let toastId = 0;
    let engine: FruitSlicerEngine;
    try {
      engine = new FruitSlicerEngine(canvas, quests, {
        onUnlock: (blades) => {
          setSnapshot(quests.snapshot());
          const added = blades.map((blade) => ({ id: ++toastId, blade }));
          setToasts((prev) => [...prev, ...added]);
          const timer = window.setTimeout(() => {
            timers.delete(timer);
            setToasts((prev) => prev.filter((t) => !added.includes(t)));
          }, 3000);
          timers.add(timer);
        },
        onGameOver: (score) => {
          setSnapshot(quests.snapshot());
          setScreen({ name: 'nameEntry', score });
        },
      });
    } catch (err) {
      // 이펙트 안에서 바로 setState 하지 않도록 다음 틱으로 미룬다
      queueMicrotask(() => setEngineError(getErrorMessage(err)));
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      for (const t of timers) window.clearTimeout(t);
      quests.save();
    };
  }, [quests]);

  function startGame() {
    engineRef.current?.start();
    setScreen({ name: 'playing' });
  }

  function goMenu(view: MenuView = 'main') {
    engineRef.current?.idle();
    setSnapshot(quests.snapshot());
    setScreen({ name: 'menu', view });
  }

  function selectBlade(id: BladeId) {
    if (!quests.select(id)) return;
    engineRef.current?.setBlade(id);
    setSnapshot(quests.snapshot());
  }

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="과일 슬라이서 게임 화면" />

        {engineError && (
          <div className={styles.overlay}>
            <p className={styles.panelText}>게임 화면을 만들 수 없어요. ({engineError})</p>
          </div>
        )}

        {screen.name === 'menu' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              {screen.view === 'main' && (
                <MainMenu
                  snapshot={snapshot}
                  onStart={startGame}
                  onNavigate={goMenu}
                  onRanking={() => setScreen({ name: 'ranking', score: null, submitted: null })}
                />
              )}
              {screen.view === 'blades' && (
                <BladeInventory snapshot={snapshot} onSelect={selectBlade} />
              )}
              {screen.view === 'quests' && <QuestList snapshot={snapshot} />}
              {screen.view === 'howto' && <HowToPlay />}
              {screen.view !== 'main' && (
                <button
                  type="button"
                  className={`btn ${styles.backButton}`}
                  onClick={() => goMenu()}
                >
                  ← 메뉴로
                </button>
              )}
            </div>
          </div>
        )}

        {screen.name === 'nameEntry' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <NameEntry
                score={screen.score}
                isBest={screen.score > 0 && screen.score >= snapshot.stats.highScore}
                onDone={(submitted) =>
                  setScreen({ name: 'ranking', score: screen.score, submitted })
                }
              />
            </div>
          </div>
        )}

        {screen.name === 'ranking' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <RankingBoard score={screen.score} submitted={screen.submitted} />
              <div className={styles.actions}>
                {screen.score !== null && (
                  <button type="button" className="btn btn-primary" onClick={startGame}>
                    다시 하기
                  </button>
                )}
                <button type="button" className="btn" onClick={() => goMenu()}>
                  메뉴로
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.toasts} aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={styles.toast}>
              <span className={styles.toastSwatch} style={{ background: t.blade.preview }} />
              <span>
                🔓 새 검 해금! <strong>{t.blade.name}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 메뉴 화면들 ---------------- */

function MainMenu({
  snapshot,
  onStart,
  onNavigate,
  onRanking,
}: {
  snapshot: QuestSnapshot;
  onStart: () => void;
  onNavigate: (view: MenuView) => void;
  onRanking: () => void;
}) {
  const blade = BLADES.find((b) => b.id === snapshot.selected) ?? BLADES[0]!;
  return (
    <>
      <p className={styles.logo}>
        <span>FRUIT</span> SLICER
      </p>
      <p className={styles.panelText}>날아오는 과일을 베고, 폭탄은 피하세요!</p>
      <dl className={styles.statRow}>
        <div>
          <dt>내 최고 점수</dt>
          <dd>{snapshot.stats.highScore}</dd>
        </div>
        <div>
          <dt>장착한 검</dt>
          <dd>
            <span className={styles.inlineSwatch} style={{ background: blade.preview }} />
            {blade.name}
          </dd>
        </div>
        <div>
          <dt>해금한 검</dt>
          <dd>
            {snapshot.unlocked.size} / {BLADES.length}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className={`btn btn-primary ${styles.startButton}`}
        onClick={onStart}
        autoFocus
      >
        게임 시작
      </button>
      <div className={styles.menuGrid}>
        <button type="button" className="btn" onClick={() => onNavigate('blades')}>
          🗡️ 검 선택
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('quests')}>
          📜 퀘스트
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('howto')}>
          ❓ 게임 방법
        </button>
        <button type="button" className="btn" onClick={onRanking}>
          🏆 랭킹 TOP {RANKING_SIZE}
        </button>
      </div>
    </>
  );
}

function BladeInventory({
  snapshot,
  onSelect,
}: {
  snapshot: QuestSnapshot;
  onSelect: (id: BladeId) => void;
}) {
  return (
    <>
      <h2 className={styles.panelTitle}>검 선택</h2>
      <ul className={styles.bladeList}>
        {BLADES.map((blade) => {
          const unlocked = snapshot.unlocked.has(blade.id);
          const selected = snapshot.selected === blade.id;
          const quest = QUESTS.find((q) => q.reward === blade.id);
          return (
            <li key={blade.id}>
              <button
                type="button"
                className={`${styles.bladeItem} ${selected ? styles.bladeSelected : ''}`}
                disabled={!unlocked}
                aria-pressed={selected}
                onClick={() => onSelect(blade.id)}
              >
                <span className={styles.bladeSwatch} style={{ background: blade.preview }} />
                <span className={styles.bladeInfo}>
                  <strong>
                    {unlocked ? '' : '🔒 '}
                    {blade.name}
                  </strong>
                  <small>
                    {unlocked ? blade.description : `해금 조건: ${quest?.title ?? '-'}`}
                  </small>
                </span>
                {selected && <span className={styles.equipped}>장착중</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function QuestList({ snapshot }: { snapshot: QuestSnapshot }) {
  return (
    <>
      <h2 className={styles.panelTitle}>퀘스트</h2>
      <ul className={styles.questList}>
        {QUESTS.map((quest) => {
          const value = Math.min(quest.progress(snapshot.stats), quest.goal);
          const done = snapshot.unlocked.has(quest.reward);
          const reward = BLADES.find((b) => b.id === quest.reward);
          return (
            <li key={quest.id} className={done ? styles.questDone : ''}>
              <div className={styles.questHead}>
                <strong>{quest.title}</strong>
                <span>{done ? '✅ 완료' : `${value} / ${quest.goal}`}</span>
              </div>
              <div
                className={styles.progress}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={quest.goal}
                aria-valuenow={done ? quest.goal : value}
              >
                <div style={{ width: `${((done ? quest.goal : value) / quest.goal) * 100}%` }} />
              </div>
              <small>보상: {reward?.name}</small>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function HowToPlay() {
  return (
    <>
      <h2 className={styles.panelTitle}>게임 방법</h2>
      <ul className={styles.howto}>
        {HOW_TO_PLAY.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/* ---------------- 게임 오버: 이름 입력 → 서버 랭킹 등록 ---------------- */

/** 공통 결과창과 같은 키를 써서 한 번 입력한 닉네임을 다른 게임에서도 채워 준다 */
const NICKNAME_STORAGE_KEY = 'simsim:nickname';

function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNickname(nickname: string) {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // 저장 실패는 무시
  }
}

function NameEntry({
  score,
  isBest,
  onDone,
}: {
  score: number;
  isBest: boolean;
  onDone: (submitted: SubmitScoreResponse | null) => void;
}) {
  const [nickname, setNickname] = useState(loadNickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('이름을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.submitScore(GAME_ID, { nickname: trimmed, score });
      saveNickname(trimmed);
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className={styles.gameOver}>GAME OVER</p>
      <p className={styles.finalScore}>
        <strong>{score}</strong>점
      </p>
      {isBest && <p className={styles.newBest}>🎉 내 최고 기록 달성!</p>}
      <form className={styles.nameForm} onSubmit={handleSubmit}>
        <label htmlFor="fruit-slicer-name" className={styles.panelText}>
          랭킹에 올릴 이름을 입력하세요
        </label>
        <div className={styles.nameRow}>
          <input
            id="fruit-slicer-name"
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={`이름 (최대 ${NICKNAME_MAX_LENGTH}자)`}
            autoComplete="nickname"
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '등록 중…' : '등록'}
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
      <button type="button" className={styles.linkButton} onClick={() => onDone(null)}>
        등록하지 않고 랭킹 보기
      </button>
    </>
  );
}

/* ---------------- TOP 5 랭킹 (서버 — 모든 기기에서 같은 순위) ---------------- */

const MEDALS = ['🥇', '🥈', '🥉'];

/** 서버의 UTC 'YYYY-MM-DD HH:MM:SS' → 보는 사람 기준 날짜 */
function formatDate(createdAt: string): string {
  const date = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return createdAt.slice(0, 10);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function RankingBoard({
  score,
  submitted,
}: {
  score: number | null;
  submitted: SubmitScoreResponse | null;
}) {
  const ranking = useFetch(`${GAME_ID}-top-${submitted?.id ?? 'view'}`, () =>
    api.getRanking(GAME_ID, RANKING_SIZE),
  );

  return (
    <>
      <h2 className={styles.panelTitle}>🏆 랭킹 TOP {RANKING_SIZE}</h2>
      {score !== null && (
        <p className={styles.panelText}>
          이번 점수 <strong>{score}점</strong>
          {submitted && ` · 전체 ${submitted.rank}위`}
        </p>
      )}
      {ranking.status === 'loading' && <p className={styles.panelText}>랭킹을 불러오는 중…</p>}
      {ranking.status === 'error' && (
        <p className={styles.error}>랭킹을 불러오지 못했어요. ({ranking.error})</p>
      )}
      {ranking.status === 'success' &&
        (ranking.data.items.length === 0 ? (
          <p className={styles.panelText}>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>
        ) : (
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">이름</th>
                <th scope="col">점수</th>
                <th scope="col">날짜</th>
              </tr>
            </thead>
            <tbody>
              {ranking.data.items.map((entry) => (
                <tr key={entry.id} className={entry.id === submitted?.id ? styles.mine : ''}>
                  <td>{MEDALS[entry.rank - 1] ?? entry.rank}</td>
                  <td className={styles.rankName}>{entry.nickname}</td>
                  <td>{entry.score}</td>
                  <td>{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </>
  );
}
