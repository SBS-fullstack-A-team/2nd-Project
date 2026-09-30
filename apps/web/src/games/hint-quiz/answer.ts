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

/** NFD 로 풀리지 않는 라틴 특수 문자 */
const LATIN_SPECIAL: Record<string, string> = {
  ı: 'i',
  ø: 'o',
  Ø: 'O',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
};

/**
 * 라틴 문자의 발음 기호를 뗀다 (Çalhanoğlu → Calhanoglu, Modrić → Modric)
 * ※ 문자열 전체를 NFD 로 바꾸면 한글 음절도 자모로 풀리므로 라틴 문자만 바꾼다
 */
function stripDiacritics(text: string): string {
  return text.replace(
    /[À-ɏḀ-ỿ]/g,
    (ch) => LATIN_SPECIAL[ch] ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  );
}

/** 비교용 정규화: 발음 기호 제거 + 공백·가운뎃점·마침표·하이픈·밑줄 제거 + 소문자 */
export function normalizeAnswer(text: string): string {
  return stripDiacritics(text)
    .replace(/[\s·.\-_'"]/g, '')
    .toLowerCase();
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/**
 * 외래어 표기에서 흔히 섞여 쓰이는 자모를 하나로 모은다.
 * 이중모음은 풀어서 비교한다 — '와' = 우+아 ('쿠르트와' ≈ '쿠르투아')
 */
const SIMILAR_JAMO: Record<string, string> = {
  ㄲ: 'ㄱ',
  ㄸ: 'ㄷ',
  ㅃ: 'ㅂ',
  ㅆ: 'ㅅ',
  ㅉ: 'ㅈ',
  ㅐ: 'ㅔ',
  ㅒ: 'ㅖ',
  ㅘ: 'ㅜㅏ',
  ㅝ: 'ㅜㅓ',
  ㅟ: 'ㅜㅣ',
  ㅙ: 'ㅜㅔ',
  ㅚ: 'ㅜㅔ',
  ㅞ: 'ㅜㅔ',
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
      out.push(...(SIMILAR_JAMO[jamo] ?? jamo));
    }
  }
  return out;
}

/** 편집 거리 (삽입·삭제·교체·이웃한 두 자모 자리바꿈 1회 = 1) */
function editDistance(a: readonly string[], b: readonly string[]): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      // 자리바꿈 — '투아'(ㅌㅜㅇㅏ) ↔ '트와'(ㅌㅇㅜㅏ)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i]![j] = best;
    }
  }
  return at(a.length, b.length);
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

/**
 * 이름의 부분들 (2글자 이상) — '루이스 알베르토 수아레스' → ['루이스', '알베르토', '수아레스']
 * 마지막 단어(성)는 한 글자여도 넣는다 — '요나탄 타' → ['요나탄', '타'], '루크 쇼' → ['루크', '쇼']
 * 앞쪽 한 글자 이름('존', '벤')은 너무 흔해 넣지 않는다
 */
function nameParts(name: string): string[] {
  const parts = name.split(/[\s·-]+/).filter(Boolean);
  return parts.filter(
    (part, i) => part.length >= 2 || (parts.length > 1 && i === parts.length - 1),
  );
}

/**
 * 외국 이름의 부분들 — 본 이름 + 본 이름과 한 부분이라도 겹치는 별칭(같은 사람의 다른 표기)
 * 예: '티보 쿠르투아' + 별칭 '티보 쿠르트와' → ['티보', '쿠르투아', '쿠르트와']
 * 겹치지 않는 별칭(별명)은 쪼개지 않는다 — 호나우지뉴의 '작은 호나우두' → '호나우두' 오인정 방지
 */
function variantNameParts(item: QuizItem<HintQuizMeta>): string[] {
  const main = nameParts(item.answer);
  const mainSet = new Set(main.map(normalizeAnswer));
  const variants = (item.meta.aliases ?? [])
    .map(nameParts)
    .filter((parts) => parts.length > 1 && parts.some((p) => mainSet.has(normalizeAnswer(p))));
  return [...main, ...variants.flat()];
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
    : variantNameParts(item);
  if (parts.some((part) => normalizeAnswer(part) === guess)) return 'partial';

  if (koreanPerson) return 'wrong';
  if (fullNames.some((name) => isSimilar(guess, name))) return 'similar';
  if (parts.some((part) => isSimilar(guess, part))) return 'similar';
  return 'wrong';
}
