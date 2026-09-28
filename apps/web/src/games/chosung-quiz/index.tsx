import { useRef, useState, type FormEvent } from 'react';
import type { ChosungQuizMeta, GameProps, QuizItem } from '@simsim/shared';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { Timer } from '../../components/Timer';
import { isCorrectAnswer } from './chosung';
import { GAME_ID, POINTS_PER_CORRECT, QUESTION_COUNT, TIME_LIMIT_SEC } from './config';
import styles from './ChosungQuiz.module.css';

/**
 * 초성 퀴즈 — 문제 불러오기 → 제한시간 내 답 입력 → 점수 계산 → onFinish(점수)
 * 점수 등록과 랭킹 표시는 공통 GamePage 가 처리한다.
 */
export default function ChosungQuiz({ onFinish }: GameProps) {
  const questions = useFetch(GAME_ID, () =>
    api.getQuestions<ChosungQuizMeta>(GAME_ID, QUESTION_COUNT),
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

type Phase = 'ready' | 'playing' | 'done';
type Feedback = { type: 'correct' | 'wrong' | 'pass'; text: string };

function QuizPlay({
  items,
  onFinish,
}: {
  items: QuizItem<ChosungQuizMeta>[];
  onFinish: GameProps['onFinish'];
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [shaking, setShaking] = useState(false);
  const finishedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];

  // onFinish 는 한 판에 한 번만 호출한다 (시간 종료와 마지막 문제가 겹치는 경우 대비)
  function finish(finalCorrectCount: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    onFinish(finalCorrectCount * POINTS_PER_CORRECT);
  }

  function goNext(nextCorrectCount: number) {
    if (index + 1 >= items.length) {
      finish(nextCorrectCount);
      return;
    }
    setIndex(index + 1);
    setInput('');
    setShowHint(false);
    inputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item || phase !== 'playing' || !input.trim()) return;

    if (isCorrectAnswer(input, item)) {
      const next = correctCount + 1;
      setCorrectCount(next);
      setFeedback({ type: 'correct', text: `정답! "${item.answer}"` });
      goNext(next);
    } else {
      setFeedback({ type: 'wrong', text: '땡! 다시 생각해 보세요' });
      setShaking(true);
      setInput('');
      inputRef.current?.focus();
    }
  }

  function handlePass() {
    if (!item || phase !== 'playing') return;
    setFeedback({ type: 'pass', text: `패스! 정답은 "${item.answer}"` });
    goNext(correctCount);
  }

  if (phase === 'ready') {
    return (
      <div className={styles.ready}>
        <p className={styles.readyTitle}>초성만 보고 단어를 맞혀 보세요!</p>
        <ul className={styles.rules}>
          <li>
            제한시간 <strong>{TIME_LIMIT_SEC}초</strong> 동안 <strong>{items.length}문제</strong>
          </li>
          <li>정답 1개당 {POINTS_PER_CORRECT}점, 모르면 패스</li>
          <li>분류와 힌트를 참고하세요</li>
        </ul>
        <button
          type="button"
          className="btn btn-primary"
          autoFocus
          onClick={() => setPhase('playing')}
        >
          시작하기
        </button>
      </div>
    );
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
        <span className={styles.score}>{correctCount * POINTS_PER_CORRECT}점</span>
      </div>

      <Timer seconds={TIME_LIMIT_SEC} onExpire={() => finish(correctCount)} />

      <div className={styles.card}>
        <span className={styles.category}>{item.meta.category}</span>
        <p className={styles.chosung} aria-label={`초성 ${item.question}`}>
          {item.question}
        </p>
        {item.meta.hint &&
          (showHint ? (
            <p className={styles.hint}>💡 {item.meta.hint}</p>
          ) : (
            <button type="button" className={styles.hintButton} onClick={() => setShowHint(true)}>
              힌트 보기
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
        {feedback?.text ?? ' '}
      </p>
    </div>
  );
}
