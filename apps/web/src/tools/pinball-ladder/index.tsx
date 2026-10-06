import { useEffect, useRef, useState } from 'react';
import { Board } from './board';
import {
  AUTO_DELAY_SEC,
  FILLER_RESULT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPEEDS,
  STEP_MS,
  STEPS_PER_SEC,
} from './config';
import { fillResults, parsePlayers, parseResults } from './entries';
import { newSeed } from './random';
import { BoardRenderer } from './render';
import { playEvent, playFanfare, unlockSound } from './sound';
import styles from './PinballLadder.module.css';

/** 명단·결과는 이 브라우저에만 저장해 둔다 (다음 방송 때 다시 붙여 넣지 않아도 되게) */
const STORAGE_KEY = 'simsim:pinball-ladder';
const SAMPLE = {
  players: '철수\n영희\n민수\n지민\n하늘\n도윤',
  results: '치킨 쏘기\n노래 한 곡\n꽝*4',
};

interface Settings {
  names: string[];
  results: string[];
  hideResults: boolean;
}

interface Saved {
  players: string;
  results: string;
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Saved> | null;
    return {
      players: saved?.players ?? SAMPLE.players,
      results: saved?.results ?? SAMPLE.results,
    };
  } catch {
    return SAMPLE;
  }
}

function save(saved: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 창 등) — 저장 없이 진행
  }
}

/**
 * 핀볼 사다리 — 사다리타기 대신 쓰는 추첨 도구.
 * 참가자 공을 하나씩 떨어뜨리면 핀에 튕기며 아래 결과 칸에 들어가고, 들어간 칸은 닫혀서
 * 참가자와 결과가 1:1 로 짝지어진다. 점수·랭킹은 없다.
 */
export default function PinballLadder() {
  const [saved, setSaved] = useState(load);
  const [hideResults, setHideResults] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  // 바뀔 때마다 추첨판을 새로 마운트한다 (같은 명단으로 다시 = 새 시드)
  const [round, setRound] = useState(0);

  function start(next: Settings) {
    unlockSound();
    save(saved);
    setSettings(next);
    setRound((r) => r + 1);
  }

  if (!settings) {
    return (
      <Setup
        saved={saved}
        onChange={setSaved}
        hideResults={hideResults}
        onHideResults={setHideResults}
        onStart={start}
      />
    );
  }
  return (
    <Play
      key={round}
      settings={settings}
      onRetry={() => start(settings)}
      onEdit={() => setSettings(null)}
    />
  );
}

function Setup({
  saved,
  onChange,
  hideResults,
  onHideResults,
  onStart,
}: {
  saved: Saved;
  onChange: (saved: Saved) => void;
  hideResults: boolean;
  onHideResults: (hide: boolean) => void;
  onStart: (settings: Settings) => void;
}) {
  const { names, total } = parsePlayers(saved.players);
  const rawResults = parseResults(saved.results);
  const tooManyResults = rawResults.length > names.length;
  const results = fillResults(rawResults, names.length);
  const filled = results.length - rawResults.length;
  const canStart = names.length >= MIN_PLAYERS && !tooManyResults;

  return (
    <div className={styles.setup}>
      <div className={styles.column}>
        <label className={styles.label} htmlFor="ladder-players">
          🙋 참가자
        </label>
        <textarea
          id="ladder-players"
          className={styles.textarea}
          value={saved.players}
          onChange={(e) => onChange({ ...saved, players: e.target.value })}
          placeholder="한 줄에 한 명 (쉼표로 구분해도 돼요)"
          spellCheck={false}
        />
        <p className={styles.summary}>
          <strong>{names.length}명</strong>
          {total > MAX_PLAYERS && (
            <span className={styles.warn}>
              {' '}
              — 최대 {MAX_PLAYERS}명이라 {total - MAX_PLAYERS}명은 빠져요
            </span>
          )}
        </p>
      </div>

      <div className={styles.column}>
        <label className={styles.label} htmlFor="ladder-results">
          🎁 결과
        </label>
        <textarea
          id="ladder-results"
          className={styles.textarea}
          value={saved.results}
          onChange={(e) => onChange({ ...saved, results: e.target.value })}
          placeholder={'한 줄에 하나\n꽝*3 → 꽝 3칸'}
          spellCheck={false}
        />
        <p className={styles.summary}>
          <strong>{rawResults.length}칸</strong>
          {tooManyResults ? (
            <span className={styles.warn}>
              {' '}
              — 결과가 참가자보다 많아요. 참가자 수에 맞춰 주세요
            </span>
          ) : (
            filled > 0 && (
              <span>
                {' '}
                + 남는 {filled}칸은 「{FILLER_RESULT}」
              </span>
            )
          )}
        </p>
      </div>

      <div className={styles.side}>
        <ul className={styles.rules}>
          <li>공을 하나씩 떨어뜨리면 핀에 튕기며 아래 칸에 들어가요</li>
          <li>공이 들어간 칸은 닫혀서 사다리처럼 한 칸에 한 명씩!</li>
          <li>
            <code>꽝*3</code> 처럼 쓰면 결과 3칸, 모자란 칸은 꽝으로 채워요
          </li>
          <li>결과 칸 배치는 매 판 무작위로 섞여요</li>
        </ul>

        <p className={styles.label}>결과 보여 주기</p>
        <div className={styles.toggle} role="radiogroup" aria-label="결과 보여 주기">
          {(
            [
              [false, '👀 처음부터 공개'],
              [true, '🙈 들어가면 공개'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={hideResults === value}
              className={`${styles.toggleButton} ${hideResults === value ? styles.selected : ''}`}
              onClick={() => onHideResults(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn btn-primary ${styles.startButton}`}
          disabled={!canStart}
          onClick={() => onStart({ names, results, hideResults })}
        >
          {names.length < MIN_PLAYERS
            ? `참가자가 ${MIN_PLAYERS}명 이상 필요해요`
            : tooManyResults
              ? '결과 칸이 너무 많아요'
              : '🎯 추첨판 만들기'}
        </button>
      </div>
    </div>
  );
}

/** 옆 목록·결과창에 쓰는 화면용 요약 (매 프레임이 아니라 가끔 갱신) */
interface Snapshot {
  matches: { id: number; name: string; color: string; result?: string }[];
  currentId: number | null;
  canDrop: boolean;
  done: boolean;
  showResult: boolean;
}

/** 마지막 공이 들어간 뒤 결과창을 띄우기까지 기다리는 시간 (꽃가루를 보여 준다) */
const RESULT_DELAY_MS = 1800;

function takeSnapshot(board: Board, showResult = false): Snapshot {
  return {
    matches: board.balls.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      result: b.slot !== undefined ? board.slots[b.slot]?.result : undefined,
    })),
    currentId: board.current?.id ?? null,
    canDrop: board.canDrop,
    done: board.done,
    showResult,
  };
}

function Play({
  settings,
  onRetry,
  onEdit,
}: {
  settings: Settings;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const [board] = useState(() => new Board(settings.names, settings.results, newSeed()));
  const [snapshot, setSnapshot] = useState(() => takeSnapshot(board));
  const [speed, setSpeed] = useState<number>(1);
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // 그리기 루프는 한 번만 만들고, 바뀌는 설정은 ref 로 읽는다
  const controls = useRef({ speed, auto, muted });
  useEffect(() => {
    controls.current = { speed, auto, muted };
  }, [speed, auto, muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const renderer = new BoardRenderer(board, settings.hideResults);
    let size = { width: 0, height: 0 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let lastSnapshot = 0;
    let eventCursor = 0;
    let doneAt: number | null = null;
    let snapshotShown = false;

    const loop = (now: number) => {
      // 탭을 오래 비웠다 돌아와도 한꺼번에 몰아서 계산하지 않도록 자른다
      const dt = Math.min(now - last, 100);
      last = now;
      acc += dt * controls.current.speed;
      while (acc >= STEP_MS && !board.done) {
        // 자동 진행 — 앞 공이 들어가고 잠깐 뒤에 다음 공
        if (
          controls.current.auto &&
          board.canDrop &&
          board.step - board.lastLandStep >= AUTO_DELAY_SEC * STEPS_PER_SEC
        ) {
          board.drop();
        }
        board.update();
        acc -= STEP_MS;
      }
      if (board.done) acc = 0;

      const newEvents = board.events.slice(eventCursor);
      eventCursor = board.events.length;
      if (!controls.current.muted) for (const event of newEvents) playEvent(event);

      renderer.frame(ctx, size.width, size.height, dt);

      if (board.done && doneAt === null) {
        doneAt = now;
        if (!controls.current.muted) playFanfare();
      }
      const showResult = doneAt !== null && now - doneAt > RESULT_DELAY_MS;
      if (now - lastSnapshot > 150 || (showResult && !snapshotShown)) {
        lastSnapshot = now;
        snapshotShown = showResult;
        setSnapshot(takeSnapshot(board, showResult));
      }
      // 결과창이 뜬 뒤에도 꽃가루가 다 떨어질 때까지 몇 초 더 그린다
      if (doneAt !== null && now - doneAt > 9000) return;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [board, settings.hideResults]);

  // 떨어지는 사람이 목록에서 보이도록 목록만 스크롤한다 (페이지는 그대로)
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[data-current]');
    if (!list || !item) return;
    const top = item.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 2;
    }
  }, [snapshot.currentId]);

  /** 한 명씩 진행 — 기다리는 공을 떨어뜨린다 */
  function dropNext() {
    board.drop();
    setSnapshot(takeSnapshot(board));
  }

  const landed = snapshot.matches.filter((m) => m.result !== undefined).length;

  return (
    <div className={styles.play}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="핀볼 사다리 추첨판" />
        {snapshot.showResult && (
          <Result matches={snapshot.matches} seed={board.seed} onRetry={onRetry} onEdit={onEdit} />
        )}
      </div>

      <aside className={styles.panel}>
        <div className={styles.controls}>
          <div className={styles.toggle} role="radiogroup" aria-label="진행 방식">
            {(
              [
                [true, '⏩ 자동'],
                [false, '👆 한 명씩'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={auto === value}
                className={`${styles.toggleButton} ${auto === value ? styles.selected : ''}`}
                onClick={() => setAuto(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {!auto && (
            <button
              type="button"
              className={`btn btn-primary ${styles.dropButton}`}
              disabled={!snapshot.canDrop}
              onClick={dropNext}
            >
              {snapshot.done
                ? '모두 들어갔어요'
                : snapshot.canDrop
                  ? `🎯 ${snapshot.matches[landed]?.name ?? ''} 떨어뜨리기`
                  : '굴러가는 중…'}
            </button>
          )}
          <div className={styles.toggle} role="radiogroup" aria-label="배속">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={speed === s}
                className={`${styles.toggleButton} ${speed === s ? styles.selected : ''}`}
                onClick={() => setSpeed(s)}
              >
                ×{s}
              </button>
            ))}
          </div>
          <div className={styles.controlRow}>
            <button type="button" className="btn" onClick={() => setMuted(!muted)}>
              {muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}
            </button>
            <button type="button" className="btn" onClick={onEdit}>
              ✏️ 명단 수정
            </button>
          </div>
        </div>

        <p className={styles.status}>
          {snapshot.done ? '추첨 끝!' : `${landed} / ${snapshot.matches.length}명 결정`}
        </p>
        <ol ref={listRef} className={styles.matches}>
          {snapshot.matches.map((m) => (
            <li
              key={m.id}
              data-current={m.id === snapshot.currentId ? '' : undefined}
              className={`${styles.match} ${m.id === snapshot.currentId ? styles.falling : ''}`}
            >
              <span className={styles.dot} style={{ background: m.color }} />
              <span className={styles.matchName}>{m.name}</span>
              <span className={styles.matchResult}>
                {m.result ?? (m.id === snapshot.currentId ? '⬇️' : '·')}
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Result({
  matches,
  seed,
  onRetry,
  onEdit,
}: {
  matches: Snapshot['matches'];
  seed: number;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // 꽝이 아닌 결과를 위로 올려 보여 준다 (같은 종류끼리는 원래 순서)
  const sorted = [...matches].sort(
    (a, b) => Number(a.result === FILLER_RESULT) - Number(b.result === FILLER_RESULT),
  );

  async function copy() {
    const text = `핀볼 사다리 결과 — ${matches.map((m) => `${m.name}: ${m.result ?? '-'}`).join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.result} role="dialog" aria-label="추첨 결과">
      <p className={styles.resultTitle}>🎯 추첨 결과</p>
      <ul className={styles.resultList}>
        {sorted.map((m) => (
          <li key={m.id} className={m.result === FILLER_RESULT ? styles.miss : ''}>
            <span className={styles.dot} style={{ background: m.color }} />
            <strong>{m.name}</strong>
            <span className={styles.arrow}>→</span>
            <span className={styles.resultValue}>{m.result}</span>
          </li>
        ))}
      </ul>
      <div className={styles.resultActions}>
        <button type="button" className="btn btn-primary" onClick={onRetry} autoFocus>
          🔁 같은 명단으로 다시
        </button>
        <button type="button" className="btn" onClick={onEdit}>
          ✏️ 명단 수정
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? '✅ 복사했어요' : '📋 결과 복사'}
        </button>
      </div>
      <p className={styles.seed}>추첨 번호 #{seed} · 결과 칸 배치와 떨어지는 자리는 매 판 무작위</p>
    </div>
  );
}
