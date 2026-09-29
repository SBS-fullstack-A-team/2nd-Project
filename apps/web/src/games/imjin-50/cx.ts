/** 여러 CSS 모듈 클래스명을 안전하게 합친다 (falsy 값은 걸러낸다). */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
