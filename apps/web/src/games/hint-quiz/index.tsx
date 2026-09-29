import { useRef, useState, type FormEvent } from 'react';
import type { GameProps, HintQuizMeta, QuizItem } from '@simsim/shared';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { Timer } from '../../components/Timer';
import { matchAnswer } from './answer';
import { initialsHint } from './initials';
import {
  CATEGORIES,
  GAME_ID,
  HINT_TIME_SEC,
  MAX_HINTS,
  POINTS_BY_HINT,
  QUESTION_COUNT,
} from './config';
import styles from './HintQuiz.module.css';

/**
 * 힌트 퀴즈 — 장르를 고르면 그 장르 문제만 나오고, 힌트가 하나씩 열린다.
 * 적은 힌트로 맞힐수록 높은 점수.
 * 장르 선택 → 문제 불러오기 → 힌트 공개(시간 경과·오답·직접 요청) → 정답 입력 → onFinish(점수)
 * 점수 등록과 랭킹 표시는 공통 GamePage 가 처리한다.
 */
export default function HintQuiz({ onFinish }: GameProps) {
  const [category, setCategory] = useState<string | null>(null);

  if (!category) return <CategorySelect onSelect={setCategory} />;
  return <QuizLoader category={category} onFinish={onFinish} />;
}

/** 시작 화면 — 규칙 안내 + 장르 선택 */
function CategorySelect({ onSelect }: { onSelect: (category: string) => void }) {
  return (
    <div className={styles.ready}>
      <p className={styles.readyTitle}>힌트를 보고 정답을 맞혀 보세요!</p>
      <ul className={styles.rules}>
        <li>
          <strong>{QUESTION_COUNT}문제</strong>, 문제마다 힌트가 최대 <strong>{MAX_HINTS}개</strong>{' '}
          하나씩 열려요
        </li>
        <li>적은 힌트로 맞힐수록 높은 점수 ({POINTS_BY_HINT.join(' → ')}점)</li>
        <li>
          힌트 하나당 <strong>{HINT_TIME_SEC}초</strong>, 시간이 지나거나 틀리면 다음 힌트가 열려요
        </li>
        <li>마지막 힌트는 이름 초성! 못 맞히면 정답을 보여줘요</li>
      </ul>
      <p className={styles.pickTitle}>장르를 고르면 바로 시작해요</p>
      <div className={styles.categories}>
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={styles.categoryButton}
            onClick={() => onSelect(c.id)}
            autoFocus={i === 0}
          >
            <span className={styles.categoryIcon} aria-hidden="true">
              {c.icon}
            </span>
            <strong>{c.id}</strong>
            <span className={styles.categoryDesc}>{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 고른 장르의 문제만 불러온다 */
function QuizLoader({ category, onFinish }: { category: string; onFinish: GameProps['onFinish'] }) {
  const questions = useFetch(`${GAME_ID}:${category}`, () =>
    api.getQuestions<HintQuizMeta>(GAME_ID, QUESTION_COUNT, category),
  );

  if (questions.status === 'loading') {
    return <p className={styles.message}>{category} 문제를 불러오는 중…</p>;
  }
  if (questions.status === 'error') {
    return <p className={styles.message}>문제를 불러오지 못했어요. ({questions.error})</p>;
  }
  const items = questions.data.items.filter((item) => item.meta.hints?.length > 0);
  if (items.length === 0) {
    return <p className={styles.message}>{category} 장르에 등록된 문제가 없어요.</p>;
  }
  return <QuizPlay items={items} onFinish={onFinish} />;
}

type Phase = 'playing' | 'done';
type Feedback = { type: 'correct' | 'wrong' | 'pass'; text: string };

function QuizPlay({
  items,
  onFinish,
}: {
  items: QuizItem<HintQuizMeta>[];
  onFinish: GameProps['onFinish'];
}) {
  const [phase, setPhase] = useState<Phase>('playing');
  const [index, setIndex] = useState(0);
  /** 지금 열려 있는 힌트 개수 (1부터) */
  const [revealed, setRevealed] = useState(1);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [shaking, setShaking] = useState(false);
  /** 이번 문제를 못 맞혀서 정답을 보여주는 중 — '다음 문제' 를 눌러야 넘어간다 */
  const [missed, setMissed] = useState(false);
  const finishedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];
  // 문제 힌트 뒤에 '이름 초성' 힌트를 자동으로 붙인다
  const hints = item ? [...item.meta.hints.slice(0, MAX_HINTS - 1), initialsHint(item.answer)] : [];
  const isLastQuestion = index + 1 >= items.length;
  const isLastHint = revealed >= hints.length;
  const pointsNow = POINTS_BY_HINT[revealed - 1] ?? 0;

  // onFinish 는 한 판에 한 번만 호출한다
  function finish(finalScore: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    onFinish(finalScore);
  }

  function goNext(nextScore: number) {
    if (index + 1 >= items.length) {
      finish(nextScore);
      return;
    }
    setIndex(index + 1);
    setRevealed(1);
    setMissed(false);
    setInput('');
    inputRef.current?.focus();
  }

  /** 이번 문제 실패(0점) — 정답을 보여주고 '다음 문제' 를 기다린다 */
  function miss(text: string) {
    setMissed(true);
    setFeedback({ type: 'pass', text });
  }

  /** 다음 힌트를 연다. 이미 마지막 힌트였다면 이 문제는 실패로 처리한다. */
  function revealNext(reason: 'timeout' | 'wrong' | 'request') {
    if (!item || phase !== 'playing' || missed) return;
    if (!isLastHint) {
      setRevealed(revealed + 1);
      if (reason === 'timeout')
        setFeedback({ type: 'pass', text: '⏰ 시간 초과! 다음 힌트가 열렸어요' });
      if (reason === 'wrong') setFeedback({ type: 'wrong', text: '땡! 힌트가 하나 더 열려요' });
      if (reason === 'request') setFeedback(null);
      return;
    }
    miss(reason === 'timeout' ? '⏰ 시간 초과! 아쉬워요' : '땡! 힌트를 다 썼어요');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item || phase !== 'playing' || missed || !input.trim()) return;

    const match = matchAnswer(input, item);
    if (match !== 'wrong') {
      const next = score + pointsNow;
      setScore(next);
      // 이름 일부·비슷한 표기로 맞힌 경우 정확한 이름을 함께 알려 준다
      const label = match === 'exact' ? '정답!' : '정답 처리!';
      setFeedback({
        type: 'correct',
        text: `${label} "${item.answer}" — 힌트 ${revealed}개로 +${pointsNow}점`,
      });
      goNext(next);
    } else {
      setShaking(true);
      setInput('');
      inputRef.current?.focus();
      revealNext('wrong');
    }
  }

  function handlePass() {
    if (!item || phase !== 'playing' || missed) return;
    miss('패스했어요');
  }

  function handleNextQuestion() {
    setFeedback(null);
    goNext(score);
  }

  if (phase === 'done' || !item) {
    return <p className={styles.message}>게임 종료!</p>;
  }

  return (
    <div className={styles.play}>
      <div className={styles.hud}>
        <span>
          문제 {index + 1} / {items.length}
        </span>
        <span className={styles.score}>{score}점</span>
      </div>

      {/* 힌트가 열릴 때마다 key 가 바뀌어 타이머가 처음부터 다시 돈다. 정답 공개 중에는 멈춘다 */}
      {!missed && (
        <Timer
          key={`${index}-${revealed}`}
          seconds={HINT_TIME_SEC}
          onExpire={() => revealNext('timeout')}
        />
      )}

      <div className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.category}>{item.meta.category}</span>
          <span className={styles.worth}>{missed ? '0점' : `지금 맞히면 +${pointsNow}점`}</span>
        </div>
        <p className={styles.question}>{item.question}</p>
        <ol className={styles.hints}>
          {hints.map((hint, i) =>
            i < revealed || missed ? (
              <li key={i} className={`${styles.hint} ${styles.open}`}>
                <span className={styles.hintNo}>{i + 1}</span>
                <span className={styles.hintLabel}>{hint.label}</span>
                <span className={styles.hintValue}>{hint.value}</span>
              </li>
            ) : (
              <li
                key={i}
                className={`${styles.hint} ${styles.locked}`}
                aria-label={`힌트 ${i + 1} 잠김`}
              >
                <span className={styles.hintNo}>{i + 1}</span>
                <span className={styles.hintLabel}>🔒 힌트 {i + 1}</span>
              </li>
            ),
          )}
        </ol>
      </div>

      {missed ? (
        <div className={styles.reveal}>
          <p className={styles.revealLabel}>정답</p>
          <p className={styles.revealAnswer}>{item.answer}</p>
          <button type="button" className="btn btn-primary" onClick={handleNextQuestion} autoFocus>
            {isLastQuestion ? '결과 보기' : '다음 문제 →'}
          </button>
        </div>
      ) : (
        <>
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
          </form>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn"
              onClick={() => revealNext('request')}
              disabled={isLastHint}
            >
              다음 힌트 ({POINTS_BY_HINT[revealed] ?? 0}점으로)
            </button>
            <button type="button" className="btn" onClick={handlePass}>
              패스
            </button>
          </div>
        </>
      )}

      <p
        className={`${styles.feedback} ${feedback ? styles[feedback.type] : ''}`}
        aria-live="polite"
      >
        {feedback?.text ?? ' '}
      </p>
    </div>
  );
}
