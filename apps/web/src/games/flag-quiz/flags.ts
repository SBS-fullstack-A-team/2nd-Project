/**
 * 국기 그림 URL — flags/<code>.svg (flag-icons, MIT — flags/LICENSE)
 * 파일마다 따로 빌드되어 화면에 나올 때만 내려받는다 (작은 파일은 코드에 바로 들어간다)
 */
const FLAG_URLS = import.meta.glob<string>('./flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function flagUrl(code: string): string {
  return FLAG_URLS[`./flags/${code}.svg`] ?? '';
}
