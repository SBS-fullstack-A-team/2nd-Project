import type { HintQuizMeta, QuizItem } from '@simsim/shared';

/**
 * 정답 판정 — 외래어 표기 차이·오타와 이름 일부만 입력한 경우도 정답으로 인정한다.
 *
 * 1) 정확히 일치: 정답·별칭 (공백·가운뎃점·하이픈·대소문자 무시)
 * 2) 부분 정답: 이름의 한 부분 (예: '리오넬 메시' → '메시', '리오넬')
 *    한국 사람 이름은 성을 뺀 이름 (예: '손흥민' → '흥민')
 * 3) 유사 정답: 자모 단위로 비교해 조금 다른 표기 (예: '음바페' ≈ '음밥페', '베컴' ≈ '배컴')
 *    ※ 한국 사람 이름은 한 글자만 달라도 다른 사람(김민재 ≠ 김민수)이라 유사 정답을 쓰지 않는다
 */

export type AnswerMatch = 'exact' | 'partial' | 'similar' | 'wrong';

/** 비교용 정규화: 공백·가운뎃점·마침표·하이픈·밑줄 제거 + 소문자 */
export function normalizeAnswer(text: string): string {
  return text.replace(/[\s·.\-_'"]/g, '').toLowerCase();
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/** 외래어 표기에서 흔히 섞여 쓰이는 자모를 하나로 모은다 */
const SIMILAR_JAMO: Record<string, string> = {
  ㄲ: 'ㄱ',
  ㄸ: 'ㄷ',
  ㅃ: 'ㅂ',
  ㅆ: 'ㅅ',
  ㅉ: 'ㅈ',
  ㅐ: 'ㅔ',
  ㅒ: 'ㅖ',
  ㅙ: 'ㅞ',
  ㅚ: 'ㅞ',
};

/** 한글을 자모로 풀고 비슷한 자모를 합친다. 'ㅡ'(외래어의 받침 뒤 모음, 예: 홀란'드')는 뺀다 */
function toJamo(text: string): string[] {
  const out: string[] = [];
  for (const ch of normalizeAnswer(text)) {
    const code = ch.charCodeAt(0);
    if (code < HANGUL_START || code > HANGUL_END) {
      out.push(ch);
      continue;
    }
    const offset = code - HANGUL_START;
    const parts = [
      CHO[Math.floor(offset / 588)],
      JUNG[Math.floor((offset % 588) / 28)],
      JONG[offset % 28],
    ];
    for (const jamo of parts) {
      if (!jamo || jamo === 'ㅡ') continue;
      out.push(SIMILAR_JAMO[jamo] ?? jamo);
    }
  }
  return out;
}

/** 편집 거리 (삽입·삭제·교체 1회 = 1) */
function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** 이름 길이(자모 수)에 따라 허용하는 차이 — 짧은 이름은 정확히 맞혀야 한다 */
function allowedDistance(length: number): number {
  if (length < 5) return 0;
  if (length < 9) return 1;
  if (length < 14) return 2;
  return 3;
}

function isSimilar(guess: string, target: string): boolean {
  const a = toJamo(guess);
  const b = toJamo(target);
  if (a.join('') === b.join('')) return true;
  return editDistance(a, b) <= allowedDistance(Math.min(a.length, b.length));
}

const isHangulName = (text: string) => /^[가-힣]+$/.test(text);

/** 한국 사람 이름인지 — 국적 힌트가 대한민국·북한이고 띄어쓰기 없는 한글 이름 */
function isKoreanPersonName(item: QuizItem<HintQuizMeta>): boolean {
  const nationality = item.meta.hints.find((h) => h.label === '국적')?.value ?? '';
  return /대한민국|북한/.test(nationality) && isHangulName(item.answer);
}

/** 이름의 부분들 (2글자 이상) — '루이스 알베르토 수아레스' → ['루이스', '알베르토', '수아레스'] */
function nameParts(name: string): string[] {
  return name.split(/[\s·-]+/).filter((part) => part.length >= 2);
}

export function matchAnswer(input: string, item: QuizItem<HintQuizMeta>): AnswerMatch {
  const guess = normalizeAnswer(input);
  if (!guess) return 'wrong';

  const fullNames = [item.answer, ...(item.meta.aliases ?? [])];
  if (fullNames.some((name) => normalizeAnswer(name) === guess)) return 'exact';

  const koreanPerson = isKoreanPersonName(item);
  const parts = koreanPerson
    ? // 한국 이름: 성(첫 글자)을 뺀 이름 — '손흥민' → '흥민'
      item.answer.length >= 3
      ? [item.answer.slice(1)]
      : []
    : // 부분 정답은 본 이름에서만 (별칭까지 쪼개면 '작은 호나우두' → '호나우두' 같은 오답이 생긴다)
      nameParts(item.answer);
  if (parts.some((part) => normalizeAnswer(part) === guess)) return 'partial';

  if (koreanPerson) return 'wrong';
  if (fullNames.some((name) => isSimilar(guess, name))) return 'similar';
  if (parts.some((part) => isSimilar(guess, part))) return 'similar';
  return 'wrong';
}
