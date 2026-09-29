import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { NICKNAME_MAX_LENGTH, type SubmitScoreResponse } from '@simsim/shared';
import { api, getErrorMessage } from '../lib/api';
import { RankingList } from './RankingList';
import { isDesktopTheme, useTheme } from '../lib/theme';
import { Window } from './Window';
import classicStyles from './ResultModal.classic.module.css';
import xpStyles from './ResultModal.xp.module.css';
import win98Styles from './ResultModal.win98.module.css';

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
    // 저장 실패는 무시 (시크릿 모드 등)
  }
}

interface ResultModalProps {
  gameId: string;
  gameName: string;
  score: number;
  onRetry: () => void;
}

/** 공통 결과창 — 점수 표시 → 닉네임 입력 후 점수 등록 → 랭킹 표시 */
export function ResultModal({ gameId, gameName, score, onRetry }: ResultModalProps) {
  const [nickname, setNickname] = useState(loadNickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmitScoreResponse | null>(null);
  const { theme } = useTheme();
  const styles = { classic: classicStyles, xp: xpStyles, win98: win98Styles }[theme];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('닉네임을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.submitScore(gameId, { nickname: trimmed, score });
      saveNickname(trimmed);
      setSubmitted(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <>
      <h2 id="result-title" className={styles.title}>
        게임 종료!
      </h2>
      <p className={styles.score}>
        <strong>{score}</strong>점
      </p>

      {submitted ? (
        <p className={styles.registered}>🎉 {submitted.rank}위로 등록됐어요!</p>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={`닉네임 (최대 ${NICKNAME_MAX_LENGTH}자)`}
            aria-label="닉네임"
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '등록 중…' : '점수 등록'}
          </button>
        </form>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <h3 className={styles.rankingTitle}>랭킹 TOP 10</h3>
      <div className={styles.ranking}>
        <RankingList gameId={gameId} highlightId={submitted?.id} refreshKey={submitted?.id ?? 0} />
      </div>

      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          다시 하기
        </button>
        <Link to="/" className="btn">
          다른 게임
        </Link>
      </div>
    </>
  );

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="result-title">
        {isDesktopTheme(theme) ? (
          <Window title={gameName} icon="🏁" bodyClassName={styles.body}>
            {content}
          </Window>
        ) : (
          <>
            <p className={classicStyles.gameName}>{gameName}</p>
            {content}
          </>
        )}
      </div>
    </div>
  );
}
