const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/** 한글 이름의 초성만 남긴다 (예: '리오넬 메시' → 'ㄹㅇㄴ ㅁㅅ'). 한글이 아닌 글자는 그대로 */
export function toInitials(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < HANGUL_START || code > HANGUL_END) return ch;
      return INITIALS[Math.floor((code - HANGUL_START) / 588)];
    })
    .join('');
}

/** 마지막 힌트 — '이름 초성 · N글자' (띄어쓰기는 글자 수에서 뺀다) */
export function initialsHint(answer: string) {
  const length = answer.replace(/\s/g, '').length;
  return { label: '이름 초성', value: `${toInitials(answer)} · ${length}글자` };
}
