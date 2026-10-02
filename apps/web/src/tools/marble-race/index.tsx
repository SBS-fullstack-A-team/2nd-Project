import { useEffect, useRef, useState } from 'react';
import { MAX_MARBLES, SLOWMO_SPEED, SPEEDS, STEP_MS } from './config';
import { expandEntries, parseEntries } from './entries';
import { Race, type Marble, type RaceMode, type RacePhase } from './race';
import { newSeed } from './random';
import { RaceRenderer, type Follow } from './render';
import { playCountdown, playEvent, playFanfare, unlockSound } from './sound';
import styles from './MarbleRace.module.css';

/** 명단은 이 브라우저에만 저장해 둔다 (다음 방송 때 다시 붙여 넣지 않아도 되게) */
const STORAGE_KEY = 'simsim:marble-race:names';
const SAMPLE = '철수\n영희\n민수*2\n지민\n하늘\n도윤';

interface RaceSettings {
  names: string[];
  mode: RaceMode;
  winners: number;
}

function loadNames(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function saveNames(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 창 등) — 저장 없이 진행
  }
}

/**
 * 구슬 레이스 — 시청자 이름이 적힌 구슬들이 위에서 내려다본 서킷을 달리는 추첨 도구.
 * 명단 입력 → 레이스(물리 시뮬레이션) → 당첨 발표. 점수·랭킹은 없다.
 */
export default function MarbleRace() {
  const [text, setText] = useState(loadNames);
  const [mode, setMode] = useState<RaceMode>('first');
  const [winners, setWinners] = useState(1);
  const [settings, setSettings] = useState<RaceSettings | null>(null);
  // 바뀔 때마다 레이스를 새로 마운트한다 (같은 명단으로 다시 = 새 시드)
  const [round, setRound] = useState(0);

  function start(next: RaceSettings) {
    unlockSound();
    saveNames(text);
    setSettings(next);
    setRound((r) => r + 1);
  }

  if (!settings) {
    return (
      <Setup
        text={text}
        onText={setText}
        mode={mode}
        onMode={setMode}
        winners={winners}
        onWinners={setWinners}
        onStart={start}
      />
    );
  }
  return (
    <RaceView
      key={round}
      settings={settings}
      onRetry={() => start(settings)}
      onEdit={() => setSettings(null)}
    />
  );
}

function Setup({
  text,
  onText,
  mode,
  onMode,
  winners,
  onWinners,
  onStart,
}: {
  text: string;
  onText: (text: string) => void;
  mode: RaceMode;
  onMode: (mode: RaceMode) => void;
  winners: number;
  onWinners: (n: number) => void;
  onStart: (settings: RaceSettings) => void;
}) {
  const { entries, total } = parseEntries(text);
  const names = expandEntries(entries);
  const maxWinners = Math.max(1, names.length - 1);
  const winnerCount = Math.min(winners, maxWinners);
  const canStart = names.length >= 2;

  return (
    <div className={styles.setup}>
      <div className={styles.setupMain}>
        <label className={styles.label} htmlFor="marble-names">
          참가자 명단
        </label>
        <textarea
          id="marble-names"
          className={styles.names}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={'한 줄에 한 명 (쉼표로 구분해도 돼요)\n이름*3 → 구슬 3개'}
          spellCheck={false}
        />
        <p className={styles.summary}>
          참가 <strong>{entries.length}명</strong> · 구슬 <strong>{names.length}개</strong>
          {total > MAX_MARBLES && (
            <span className={styles.warn}>
              {' '}
              — 구슬은 최대 {MAX_MARBLES}개라 {total - MAX_MARBLES}개는 빠져요
            </span>
          )}
        </p>
      </div>

      <div className={styles.setupSide}>
        <ul className={styles.rules}>
          <li>한 줄에 한 명, 쉼표로 구분해도 돼요</li>
          <li>
            <code>이름*3</code> 처럼 쓰면 구슬이 3개 (후원 횟수 등)
          </li>
          <li>트랙·테마·출발 자리는 매 판 무작위로 바뀌어요</li>
          <li>가속 패드·진흙·구멍·범퍼로 역전이 계속 나와요</li>
        </ul>

        <p className={styles.label}>뽑는 방식</p>
        <div className={styles.toggle} role="radiogroup" aria-label="뽑는 방식">
          {(
            [
              ['first', '🏆 먼저 도착'],
              ['last', '🐢 꼴등 뽑기'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={`${styles.toggleButton} ${mode === value ? styles.selected : ''}`}
              onClick={() => onMode(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className={styles.label} htmlFor="marble-winners">
          뽑을 인원
        </label>
        <div className={styles.winners}>
          <input
            id="marble-winners"
            type="number"
            min={1}
            max={maxWinners}
            value={winnerCount}
            onChange={(e) => onWinners(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          <span>명 ({mode === 'first' ? '먼저 도착한 순서' : '마지막까지 남은 순서'})</span>
        </div>

        <button
          type="button"
          className={`btn btn-primary ${styles.startButton}`}
          disabled={!canStart}
          onClick={() => onStart({ names, mode, winners: winnerCount })}
        >
          {canStart ? '🎲 섞어서 출발!' : '구슬이 2개 이상 필요해요'}
        </button>
      </div>
    </div>
  );
}

/** 옆 순위표·결과에 쓰는 화면용 요약 (매 프레임이 아니라 가끔 갱신) */
interface Snapshot {
  phase: RacePhase;
  elapsed: number;
  standings: Pick<Marble, 'id' | 'name' | 'color' | 'rank'>[];
  winners: Pick<Marble, 'id' | 'name' | 'color'>[];
  /** 결승 장면을 잠깐 보여 준 뒤 결과창을 띄운다 */
  showResult: boolean;
}

/** 결승 뒤 결과창을 띄우기까지 기다리는 시간 (결승 장면·축하 효과를 보여 준다) */
const RESULT_DELAY_MS = 1600;

function takeSnapshot(race: Race, showResult = false): Snapshot {
  const pick = ({ id, name, color, rank }: Marble) => ({ id, name, color, rank });
  return {
    phase: race.phase,
    elapsed: race.elapsedSec,
    standings: race.standings().map(pick),
    winners: race.phase === 'done' ? race.winners().map(pick) : [],
    showResult,
  };
}

function RaceView({
  settings,
  onRetry,
  onEdit,
}: {
  settings: RaceSettings;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const [race] = useState(
    () => new Race(settings.names, settings.mode, settings.winners, newSeed()),
  );
  const [snapshot, setSnapshot] = useState(() => takeSnapshot(race));
  const [speed, setSpeed] = useState<number>(1);
  const [follow, setFollow] = useState<Follow>(settings.mode === 'first' ? 'lead' : 'tail');
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 그리기 루프는 한 번만 만들고, 바뀌는 설정은 ref 로 읽는다
  const controls = useRef({ speed, follow, muted });
  useEffect(() => {
    controls.current = { speed, follow, muted };
  }, [speed, follow, muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const renderer = new RaceRenderer(race);
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
    let lastLights = 0;
    let eventCursor = 0;
    let doneAt: number | null = null;
    let snapshotShown = false;

    const loop = (now: number) => {
      // 탭을 오래 비웠다 돌아와도 한꺼번에 몰아서 계산하지 않도록 자른다
      const dt = Math.min(now - last, 100);
      last = now;
      // 결승 직전 접전이면 슬로모션 (계산은 같은 스텝으로 하고 보여 주는 속도만 늦춘다)
      acc += dt * controls.current.speed * (race.dramatic ? SLOWMO_SPEED : 1);
      while (acc >= STEP_MS && race.phase !== 'done') {
        race.update();
        acc -= STEP_MS;
      }
      if (race.phase === 'done') acc = 0;

      // 신호등이 켜질 때마다 삑, 자막이 뜰 때마다 효과음
      const lights = race.phase === 'countdown' ? Math.floor(race.step / 60) + 1 : 4;
      const newEvents = race.events.slice(eventCursor);
      eventCursor = race.events.length;
      if (!controls.current.muted) {
        if (lights !== lastLights && lights <= 3) playCountdown(false);
        for (const event of newEvents) playEvent(event.kind);
      }
      lastLights = lights;

      renderer.frame(ctx, size.width, size.height, dt, controls.current.follow);

      if (race.phase === 'done' && doneAt === null) {
        doneAt = now;
        if (!controls.current.muted) playFanfare();
      }
      const showResult = doneAt !== null && now - doneAt > RESULT_DELAY_MS;
      if (now - lastSnapshot > 200 || (showResult && !snapshotShown)) {
        lastSnapshot = now;
        snapshotShown = showResult;
        setSnapshot(takeSnapshot(race, showResult));
      }
      // 결과창이 뜬 뒤에도 축하 효과가 끝날 때까지 몇 초 더 그린다
      if (doneAt !== null && now - doneAt > 6000) return;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [race]);

  const winnerIds = new Set(snapshot.winners.map((m) => m.id));

  return (
    <div className={styles.race}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="구슬 레이스 화면" />
        {snapshot.showResult && (
          <Result
            mode={race.mode}
            winners={snapshot.winners}
            standings={snapshot.standings}
            seed={race.seed}
            onRetry={onRetry}
            onEdit={onEdit}
          />
        )}
      </div>

      <aside className={styles.side}>
        <div className={styles.controls}>
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
          <div className={styles.toggle} role="radiogroup" aria-label="카메라">
            {(
              [
                ['lead', '선두'],
                ['tail', '꼴찌'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={follow === value}
                className={`${styles.toggleButton} ${follow === value ? styles.selected : ''}`}
                onClick={() => setFollow(value)}
              >
                🎥 {label}
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
          {snapshot.phase === 'countdown'
            ? '곧 출발해요!'
            : snapshot.phase === 'running'
              ? `${Math.floor(snapshot.elapsed)}초 · 도착 ${race.arrivals.length}/${race.marbles.length}`
              : '레이스 끝!'}
        </p>
        <ol className={styles.standings}>
          {snapshot.standings.map((m, i) => (
            <li
              key={m.id}
              className={`${styles.standing} ${winnerIds.has(m.id) ? styles.winnerRow : ''}`}
            >
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.dot} style={{ background: m.color }} />
              <span className={styles.standingName}>{m.name}</span>
              {m.rank !== undefined && snapshot.phase !== 'done' && (
                <span className={styles.arrived}>도착</span>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Result({
  mode,
  winners,
  standings,
  seed,
  onRetry,
  onEdit,
}: {
  mode: RaceMode;
  winners: Snapshot['winners'];
  standings: Snapshot['standings'];
  seed: number;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label = (i: number) =>
    mode === 'first' ? `${i + 1}등` : i === 0 ? '꼴찌' : `뒤에서 ${i + 1}번째`;

  async function copy() {
    const text = `구슬 레이스 결과 — ${winners.map((w, i) => `${label(i)} ${w.name}`).join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.result} role="dialog" aria-label="당첨 결과">
      <p className={styles.resultTitle}>{mode === 'first' ? '🏆 당첨!' : '🐢 꼴등 당첨!'}</p>
      {mode === 'first' && <Podium standings={standings} winnerCount={winners.length} />}
      {/* 먼저 도착 모드에서 3명 이하면 시상대로 충분하다 */}
      {(mode === 'last' || winners.length > 3) && (
        <ol className={styles.resultList}>
          {winners.map((w, i) => (
            <li key={w.id} className={i === 0 ? styles.resultTop : ''}>
              <span className={styles.resultRank}>{label(i)}</span>
              <span className={styles.dot} style={{ background: w.color }} />
              <strong>{w.name}</strong>
            </li>
          ))}
        </ol>
      )}
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
      <p className={styles.seed}>추첨 번호 #{seed} · 트랙과 출발 자리는 매 판 무작위</p>
    </div>
  );
}

/** 시상대 — 1·2·3위 (당첨이 아닌 자리는 흐리게) */
function Podium({
  standings,
  winnerCount,
}: {
  standings: Snapshot['standings'];
  winnerCount: number;
}) {
  const top = standings.slice(0, 3);
  // 2위 · 1위 · 3위 순서로 세운다
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className={styles.podium}>
      {order.map((i) => {
        const m = top[i]!;
        return (
          <div
            key={m.id}
            className={`${styles.podiumSpot} ${styles[`place${i + 1}`]} ${i >= winnerCount ? styles.notWinner : ''}`}
          >
            <span className={styles.podiumMedal}>{['🥇', '🥈', '🥉'][i]}</span>
            <span className={styles.podiumMarble} style={{ background: m.color }} />
            <strong className={styles.podiumName}>{m.name}</strong>
            <div className={styles.podiumBlock}>{i + 1}</div>
          </div>
        );
      })}
    </div>
  );
}
