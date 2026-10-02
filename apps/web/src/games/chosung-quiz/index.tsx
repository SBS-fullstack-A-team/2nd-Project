import { useRef, useState, type FormEvent } from 'react';
import type { ChosungQuizMeta, GameProps, QuizItem } from '@simsim/shared';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { Timer } from '../../components/Timer';
import { isCorrectAnswer } from './chosung';
import { clearBonus, comboBonus, correctPoints } from './scoring';
import {
  CATEGORIES,
  CLEAR_BONUS_PER_SEC,
  COMBO_BONUS_MAX,
  COMBO_BONUS_STEP,
  GAME_ID,
  POINTS_PER_CORRECT,
  POINTS_WITH_HINT,
  QUESTION_COUNT,
  TIME_LIMIT_SEC,
} from './config';
import styles from './ChosungQuiz.module.css';

/** 분야 선택값 — ALL 이면 모든 분야를 섞어서 낸다 */
const ALL = '전체';

/**
 * 초성 퀴즈 — 분야 선택 → 문제 불러오기 → 제한시간 내 답 입력 → 점수 계산 → onFinish(점수)
 * 정답 100점(힌트 보면 50점) + 연속 정답 보너스, 시간 안에 전부 맞히면 남은 시간 보너스.
 * 점수 등록과 랭킹 표시는 공통 GamePage 가 처리한다.
 */
export default function ChosungQuiz({ onFinish }: GameProps) {
  const [category, setCategory] = useState<string | null>(null);

  if (!category) return <Setup onSelect={setCategory} />;
  return <QuizLoader category={category} onFinish={onFinish} />;
}

/** 시작 화면 — 규칙 안내 + 분야 선택 (고르면 바로 시작) */
function Setup({ onSelect }: { onSelect: (category: string) => void }) {
  return (
    <div className={styles.ready}>
      <p className={styles.readyTitle}>초성만 보고 단어를 맞혀 보세요!</p>
      <ul className={styles.rules}>
        <li>
          제한시간 <strong>{TIME_LIMIT_SEC}초</strong> 동안 최대{' '}
          <strong>{QUESTION_COUNT}문제</strong>
        </li>
        <li>
          정답 <strong>{POINTS_PER_CORRECT}점</strong>, 힌트를 보고 맞히면 {POINTS_WITH_HINT}점
        </li>
        <li>
          🔥 연속 정답 보너스 +{COMBO_BONUS_STEP}점씩 (최대 +{COMBO_BONUS_MAX}) — 틀리거나 패스하면
          끊겨요
        </li>
        <li>
          🎉 시간 안에 <strong>전부</strong> 맞히면 남은 시간 1초당 +{CLEAR_BONUS_PER_SEC}점
        </li>
      </ul>

      <p className={styles.pickTitle}>분야를 고르면 바로 시작해요</p>
      <div className={styles.categories}>
        <button
          type="button"
          className={`${styles.categoryButton} ${styles.categoryAll}`}
          onClick={() => onSelect(ALL)}
        >
          <span className={styles.categoryIcon} aria-hidden="true">
            🎲
          </span>
          <strong>전부 섞어서</strong>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.categoryButton}
            onClick={() => onSelect(c.id)}
          >
            <span className={styles.categoryIcon} aria-hidden="true">
              {c.icon}
            </span>
            <strong>{c.id}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 고른 분야의 문제를 불러온다 (전체면 분야 구분 없이) */
function QuizLoader({ category, onFinish }: { category: string; onFinish: GameProps['onFinish'] }) {
  const filter = category === ALL ? undefined : category;
  const questions = useFetch(`${GAME_ID}:${category}`, () =>
    api.getQuestions<ChosungQuizMeta>(GAME_ID, QUESTION_COUNT, filter),
  );

  if (questions.status === 'loading') {
    return <p className={styles.message}>문제를 불러오는 중…</p>;
  }
  if (questions.status === 'error') {
    return <p className={styles.message}>문제를 불러오지 못했어요. ({questions.error})</p>;
  }
  if (questions.data.items.length === 0) {
    return <p className={styles.message}>등록된 문제가 없어요.</p>;
  }
  return <QuizPlay items={questions.data.items} onFinish={onFinish} />;
}

type Phase = 'playing' | 'done';
type Feedback = { type: 'correct' | 'wrong' | 'pass'; text: string };
/** 정답 시 카드 위로 떠오르는 획득 점수 — id 가 바뀔 때마다 애니메이션을 다시 시작한다 */
type Gain = { id: number; points: number };

function QuizPlay({
  items,
  onFinish,
}: {
  items: QuizItem<ChosungQuizMeta>[];
  onFinish: GameProps['onFinish'];
}) {
  const [phase, setPhase] = useState<Phase>('playing');
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  /** 지금까지 연속으로 맞힌 횟수 */
  const [combo, setCombo] = useState(0);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [gain, setGain] = useState<Gain | null>(null);
  const [shaking, setShaking] = useState(false);
  // 게임을 시작한 시각 — 올클리어 시 남은 시간 계산용 (처음 한 번만 정한다)
  const [startedAt] = useState(() => Date.now());
  const finishedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];

  // onFinish 는 한 판에 한 번만 호출한다 (시간 종료와 마지막 문제가 겹치는 경우 대비)
  function finish(finalScore: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setScore(finalScore);
    setPhase('done');
    onFinish(finalScore);
  }

  function goNext(nextScore: number, nextCorrectCount: number) {
    if (index + 1 >= items.length) {
      // 모든 문제를 맞혔으면 남은 시간만큼 보너스
      const allCorrect = nextCorrectCount === items.length;
      const remainingSec = TIME_LIMIT_SEC - (Date.now() - startedAt) / 1000;
      const bonus = allCorrect ? clearBonus(remainingSec) : 0;
      if (bonus > 0) {
        setFeedback({ type: 'correct', text: `🎉 올클리어! 남은 시간 보너스 +${bonus}점` });
      }
      finish(nextScore + bonus);
      return;
    }
    setScore(nextScore);
    setIndex(index + 1);
    setInput('');
    setShowHint(false);
    inputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item || phase !== 'playing' || !input.trim()) return;

    if (isCorrectAnswer(input, item)) {
      const nextCombo = combo + 1;
      const points = correctPoints(showHint, nextCombo);
      const bonus = comboBonus(nextCombo);
      setCombo(nextCombo);
      setCorrectCount(correctCount + 1);
      setGain({ id: (gain?.id ?? 0) + 1, points });
      setFeedback({
        type: 'correct',
        text: `정답! "${item.answer}" +${points}점${bonus > 0 ? ` (🔥 ${nextCombo}연속 +${bonus})` : ''}`,
      });
      goNext(score + points, correctCount + 1);
    } else {
      setCombo(0);
      setFeedback({ type: 'wrong', text: '땡! 다시 생각해 보세요' });
      setShaking(true);
      setInput('');
      inputRef.current?.focus();
    }
  }

  function handlePass() {
    if (!item || phase !== 'playing') return;
    setCombo(0);
    setFeedback({ type: 'pass', text: `패스! 정답은 "${item.answer}"` });
    goNext(score, correctCount);
  }

  function handleHint() {
    setShowHint(true);
    inputRef.current?.focus();
  }

  if (phase === 'done' || !item) {
    return (
      <div className={styles.done}>
        <p className={styles.doneTitle}>게임 종료!</p>
        <p>
          {items.length}문제 중 <strong>{correctCount}개</strong> 정답 · <strong>{score}점</strong>
        </p>
        {feedback && (
          <p className={`${styles.feedback} ${styles[feedback.type]}`}>{feedback.text}</p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.play}>
      <div className={styles.hud}>
        <span>
          문제 {index + 1} / {items.length}
        </span>
        <span className={`${styles.combo} ${combo >= 2 ? styles.comboOn : ''}`}>
          {combo >= 2 ? `🔥 ${combo}연속` : ' '}
        </span>
        <span className={styles.score}>{score}점</span>
      </div>

      <Timer
        seconds={TIME_LIMIT_SEC}
        running={phase === 'playing'}
        onExpire={() => {
          setFeedback({ type: 'pass', text: `⏰ 시간 종료! 마지막 정답은 "${item.answer}"` });
          finish(score);
        }}
      />

      <div className={styles.card}>
        {gain && (
          <span key={gain.id} className={styles.gain} aria-hidden="true">
            +{gain.points}
          </span>
        )}
        <span className={styles.category}>{item.meta.category}</span>
        <ChosungTiles text={item.question} />
        {item.meta.hint &&
          (showHint ? (
            <p className={styles.hint}>💡 {item.meta.hint}</p>
          ) : (
            <button type="button" className={styles.hintButton} onClick={handleHint}>
              힌트 보기 (맞히면 {POINTS_WITH_HINT}점)
            </button>
          ))}
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={`${styles.input} ${shaking ? styles.shake : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onAnimationEnd={() => setShaking(false)}
          placeholder="정답 입력"
          aria-label="정답"
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="btn btn-primary">
          확인
        </button>
        <button type="button" className="btn" onClick={handlePass}>
          패스
        </button>
      </form>

      <p
        className={`${styles.feedback} ${feedback ? styles[feedback.type] : ''}`}
        aria-live="polite"
      >
        {feedback?.text ?? ' '}
      </p>
    </div>
  );
}

/** 초성을 글자 타일로 보여 준다. 띄어쓰기(속담 등)마다 묶음을 나누고, 길면 타일을 줄인다. */
function ChosungTiles({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const letters = words.join('').length;
  const size = letters > 14 ? styles.tilesXs : letters > 6 ? styles.tilesSm : '';

  return (
    <p className={`${styles.tiles} ${size}`} aria-label={`초성 ${text}`}>
      {words.map((word, w) => (
        <span key={w} className={styles.word}>
          {[...word].map((ch, i) => (
            <span key={i} className={styles.tile}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
