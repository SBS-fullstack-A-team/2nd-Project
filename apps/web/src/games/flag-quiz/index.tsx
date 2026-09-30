import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps } from '@simsim/shared';
import { Timer } from '../../components/Timer';
import {
  CHOICE_COUNT,
  FULL_BONUS_SEC,
  LEVELS,
  MIN_TIME_MULTIPLIER,
  MODES,
  NEXT_DELAY_MS,
  POINTS_PER_QUESTION,
  QUESTION_COUNT,
  QUESTION_TIME_SEC,
  type LevelId,
  type ModeId,
} from './config';
import { flagUrl } from './flags';
import { buildQuestions, choiceLabel, questionPoints } from './quiz';
import styles from './FlagQuiz.module.css';

/**
 * 국기 퀴즈 — 국기를 보고 나라를, 또는 나라를 보고 수도를 4지선다로 맞힌다.
 * 빨리 맞힐수록 높은 점수, 문제마다 제한시간이 있고 시간이 다 되면 0점.
 * 설정(난이도·모드) → 10문제 → onFinish(점수). 점수 등록과 랭킹은 공통 GamePage 가 처리한다.
 */
export default function FlagQuiz({ onFinish }: GameProps) {
  const [level, setLevel] = useState<LevelId>('easy');
  const [mode, setMode] = useState<ModeId | null>(null);

  if (!mode) return <Setup level={level} onLevel={setLevel} onStart={setMode} />;
  return <QuizPlay mode={mode} level={level} onFinish={onFinish} />;
}

/** 시작 화면 — 규칙 안내 + 난이도 + 모드 선택 */
function Setup({
  level,
  onLevel,
  onStart,
}: {
  level: LevelId;
  onLevel: (level: LevelId) => void;
  onStart: (mode: ModeId) => void;
}) {
  return (
    <div className={styles.ready}>
      <p className={styles.readyTitle}>국기와 수도, 얼마나 알고 있나요?</p>
      <ul className={styles.rules}>
        <li>
          {QUESTION_COUNT}문제, 보기 {CHOICE_COUNT}개 중 정답을 골라요 (숫자키 1~{CHOICE_COUNT}도
          돼요)
        </li>
        <li>
          문제당 제한시간 <strong>{QUESTION_TIME_SEC}초</strong> — {FULL_BONUS_SEC}초 안에 맞히면{' '}
          {POINTS_PER_QUESTION}점, 늦을수록 줄어 최소 {POINTS_PER_QUESTION * MIN_TIME_MULTIPLIER}점
        </li>
        <li>틀리거나 시간이 다 되면 그 문제는 0점</li>
      </ul>

      <p className={styles.pickTitle}>난이도</p>
      <div className={styles.levels} role="radiogroup" aria-label="난이도">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            className={`${styles.levelButton} ${level === l.id ? styles.levelSelected : ''}`}
            onClick={() => onLevel(l.id)}
          >
            <strong>{l.label}</strong>
            <span className={styles.levelDesc}>{l.description}</span>
          </button>
        ))}
      </div>

      <p className={styles.pickTitle}>모드를 고르면 바로 시작해요</p>
      <div className={styles.modes}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={styles.modeButton}
            onClick={() => onStart(m.id)}
          >
            <span className={styles.modeIcon} aria-hidden="true">
              {m.icon}
            </span>
            <strong>{m.label}</strong>
            <span className={styles.modeDesc}>{m.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 고른 답 — 나라 코드, 시간 초과면 null */
type Picked = { code: string | null; points: number };

function QuizPlay({
  mode,
  level,
  onFinish,
}: {
  mode: ModeId;
  level: LevelId;
  onFinish: GameProps['onFinish'];
}) {
  const [questions] = useState(() => buildQuestions(mode, level, QUESTION_COUNT));
  const [index, setIndex] = useState(0);
  /** 맞힌 문제 점수 합계 (최종 점수는 난이도 배율을 곱한다) */
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);

  const multiplier = LEVELS.find((l) => l.id === level)?.multiplier ?? 1;
  const question = questions[index];
  const isLast = index + 1 >= questions.length;

  const pick = useCallback(
    (code: string | null) => {
      if (!question || picked) return;
      const correct = code === question.country.code;
      const points = correct ? questionPoints((Date.now() - startedAt) / 1000) : 0;
      setPicked({ code, points });
      setTotal((t) => t + points);
    },
    [question, picked, startedAt],
  );

  // 답을 고르면 정답을 잠깐 보여준 뒤 다음 문제로 (마지막 문제면 끝낸다)
  useEffect(() => {
    if (!picked) return;
    const id = setTimeout(() => {
      if (isLast) {
        // onFinish 는 한 판에 한 번만 호출한다
        if (finishedRef.current) return;
        finishedRef.current = true;
        setDone(true);
        onFinish(Math.round(total * multiplier));
        return;
      }
      setIndex((i) => i + 1);
      setPicked(null);
      setStartedAt(Date.now());
    }, NEXT_DELAY_MS);
    return () => clearTimeout(id);
  }, [picked, isLast, total, multiplier, onFinish]);

  // 숫자키 1~4 로 보기 선택
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = Number(e.key);
      const choice = question?.choices[n - 1];
      if (choice) pick(choice.code);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, pick]);

  if (done || !question) return <p className={styles.message}>게임 종료!</p>;

  const { country } = question;
  const feedback = !picked
    ? null
    : picked.code === country.code
      ? { type: styles.correct, text: `정답! +${picked.points}점` }
      : {
          type: styles.wrong,
          text: `${picked.code === null ? '⏰ 시간 초과!' : '땡!'} 정답은 ${choiceLabel(mode, country)}`,
        };

  return (
    <div className={styles.play}>
      <div className={styles.hud}>
        <span>
          문제 {index + 1} / {questions.length}
        </span>
        <span className={styles.score}>{Math.round(total * multiplier)}점</span>
      </div>
      {/* 문제마다 key 가 바뀌어 타이머가 처음부터 다시 돈다. 답을 고르면 멈춘다 */}
      <Timer
        key={index}
        seconds={QUESTION_TIME_SEC}
        running={!picked}
        onExpire={() => pick(null)}
      />

      <div className={styles.card}>
        {mode === 'flag' ? (
          <>
            <img className={styles.flag} src={flagUrl(country.code)} alt="이 문제의 국기" />
            <p className={styles.question}>이 국기는 어느 나라일까요?</p>
          </>
        ) : (
          <>
            <img
              className={styles.flagSmall}
              src={flagUrl(country.code)}
              alt={`${country.name} 국기`}
            />
            <p className={styles.countryName}>{country.name}</p>
            <p className={styles.question}>이 나라의 수도는 어디일까요?</p>
          </>
        )}
      </div>

      <div className={styles.choices}>
        {question.choices.map((choice, i) => {
          const state = !picked
            ? ''
            : choice.code === country.code
              ? styles.choiceCorrect
              : choice.code === picked.code
                ? styles.choiceWrong
                : styles.choiceDim;
          return (
            <button
              key={choice.code}
              type="button"
              className={`${styles.choice} ${state}`}
              onClick={() => pick(choice.code)}
              disabled={picked !== null}
            >
              <span className={styles.choiceNo}>{i + 1}</span>
              {choiceLabel(mode, choice)}
            </button>
          );
        })}
      </div>

      <p className={`${styles.feedback} ${feedback?.type ?? ''}`} aria-live="polite">
        {feedback?.text ?? ' '}
      </p>
    </div>
  );
}
