// 힌트 퀴즈 — 나라 문제 생성 스크립트 (위키데이터 → seeds/hint-quiz-country.sql)
//
// 데이터 출처: 위키데이터 (https://www.wikidata.org, CC0 — 자유 이용)
// 유엔 회원국 193개 + 바티칸·팔레스타인 중 직접 만든 문제(seeds/hint-quiz.sql)에 있는 나라를 빼고
// 힌트 6개를 만든다: 대륙 → 인구 → 면적 → 이웃 나라 → 공용어 → 수도 (없거나 나라 이름과 겹치면 통화)
// 힌트에 나라 이름이 들어가면 ○ 로 가린다 (예: 프랑스어 → ○○○어)
// (게임이 마지막에 '이름 초성' 힌트를 자동으로 하나 더 붙인다)
//
// 실행: node apps/api/seeds/scripts/hint-quiz-country.mjs
// → apps/api/seeds/hint-quiz-country.sql 을 덮어쓴다. 결과를 검토한 뒤 커밋할 것.
// ※ Node 로 실행하는 개발용 스크립트 (Workers 코드 아님)
import { writeFileSync } from 'node:fs';

const CATEGORY = '나라';
const QUESTION = '이 나라는 어디일까요?';
const OUT_FILE = new URL('../hint-quiz-country.sql', import.meta.url);
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'simsim-arcade-seed/1.0 (https://github.com/SBS-fullstack-A-team/simsim-arcade)';

/** 직접 만든 문제(seeds/hint-quiz.sql)에 이미 있는 나라 — 중복 생성하지 않는다 */
const HANDMADE = new Set([
  '이집트',
  '일본',
  '브라질',
  '이탈리아',
  '오스트레일리아',
  '프랑스',
  '인도',
  '캐나다',
]);

/** 유엔 회원국 중 위키데이터의 회원 항목에 ISO 코드가 붙어 있지 않아 따로 넣는 나라 */
const EXTRA_COUNTRIES = ['Q35', 'Q218']; // 덴마크, 루마니아
/** 지금은 유엔 회원국이 아니지만 위키데이터 회원 기록이 남아 있는 나라 */
const FORMER_MEMBER = 'Q865'; // 중화민국
/** 유엔 옵서버 */
const OBSERVERS = ['Q237', 'Q219060']; // 바티칸, 팔레스타인

/** 위키데이터 공식 이름 → 흔히 쓰는 이름 */
const NAME = {
  조선민주주의인민공화국: '북한',
  중화인민공화국: '중국',
  '네덜란드 왕국': '네덜란드',
  '바티칸 시국': '바티칸',
};
/** 함께 인정할 이름 (위키데이터 별칭에 더해서) */
const EXTRA_ALIASES = {
  대한민국: ['한국', '남한'],
  북한: ['조선민주주의인민공화국', '조선'],
  중국: ['중화인민공화국'],
  미국: ['미합중국', 'usa', 'us'],
  영국: ['uk'],
  남아프리카_공화국: ['남아공'],
  오스트레일리아: ['호주'],
  바티칸: ['바티칸 시국'],
};
/** 공용어 — 위키데이터에 대표 언어가 빠져 있는 나라 */
const LANGUAGES = {
  미국: ['영어'],
};
/** 수도 — 수도가 여럿이거나 이름을 다듬어야 하는 나라. null 이면 수도 대신 통화를 힌트로 쓴다 (수도 논란) */
const CAPITAL = {
  대한민국: '서울',
  일본: '도쿄',
  북한: '평양',
  중국: '베이징',
  쿠웨이트: '쿠웨이트시티',
  인도네시아: '자카르타',
  말레이시아: '쿠알라룸푸르',
  파키스탄: '이슬라마바드',
  '남아프리카 공화국': '프리토리아 (행정 수도)',
  스리랑카: '스리자야와르데네푸라코테',
  예멘: '사나',
  볼리비아: '수크레 (헌법상 수도)',
  베냉: '포르토노보',
  에스와티니: '음바바네',
  네덜란드: '암스테르담',
  이스라엘: null,
  팔레스타인: null,
  '적도 기니': null,
  나우루: null,
};

async function sparql(query, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`위키데이터 요청 실패 (${res.status})`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 10;
    console.warn(`  … ${res.status} 응답, ${wait}초 후 재시도 (${attempt}/5)`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return sparql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`위키데이터 요청 실패 (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.results.bindings.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])),
  );
}

const qid = (uri) => uri.replace('http://www.wikidata.org/entity/', '');
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// 1) 나라 목록: 현재 유엔 회원국(ISO 코드 있음) + 따로 넣는 나라
async function fetchCountries() {
  const values = [...EXTRA_COUNTRIES, ...OBSERVERS].map((id) => `wd:${id}`).join(' ');
  const rows = await sparql(`
    SELECT DISTINCT ?c ?ko ?en WHERE {
      { ?c wdt:P463 wd:Q1065; wdt:P297 [] } UNION { VALUES ?c { ${values} } }
      FILTER NOT EXISTS { ?c wdt:P576 [] }
      FILTER(?c != wd:${FORMER_MEMBER})
      ?c rdfs:label ?ko FILTER(LANG(?ko) = "ko")
      OPTIONAL { ?c rdfs:label ?en FILTER(LANG(?en) = "en") }
    }`);
  return rows.map((r) => ({ id: qid(r.c), wdName: r.ko, en: r.en, name: NAME[r.ko] ?? r.ko }));
}

// 2) 상세: 대륙·인구·면적·수도·공용어·통화·국경·별칭
async function fetchDetails(values) {
  const [basic, borders, languages, capitals, currencies, aliases] = [
    await sparql(`
      SELECT ?c ?contKo ?pop ?popAny ?area WHERE {
        VALUES ?c { ${values} }
        OPTIONAL { ?c wdt:P30 ?cont. ?cont rdfs:label ?contKo FILTER(LANG(?contKo) = "ko") }
        OPTIONAL { ?c p:P1082 ?ps. ?ps ps:P1082 ?pop; wikibase:rank wikibase:PreferredRank }
        OPTIONAL { ?c wdt:P1082 ?popAny }
        OPTIONAL { ?c p:P2046/psn:P2046/wikibase:quantityAmount ?area }
      }`),
    await sparql(`
      SELECT ?c ?n WHERE { VALUES ?c { ${values} } ?c wdt:P47 ?n }`),
    await sparql(`
      SELECT ?c ?langKo ?rank WHERE {
        VALUES ?c { ${values} }
        ?c p:P37 ?ls. ?ls ps:P37 ?l; wikibase:rank ?rank.
        FILTER(?rank != wikibase:DeprecatedRank)
        ?l rdfs:label ?langKo FILTER(LANG(?langKo) = "ko")
      }`),
    await sparql(`
      SELECT ?c ?capKo WHERE {
        VALUES ?c { ${values} }
        ?c p:P36 ?cs. ?cs ps:P36 ?cap. FILTER NOT EXISTS { ?cs pq:P582 [] }
        ?cap rdfs:label ?capKo FILTER(LANG(?capKo) = "ko")
      }`),
    await sparql(`
      SELECT ?c ?curKo WHERE {
        VALUES ?c { ${values} }
        ?c p:P38 ?st. ?st ps:P38 ?cur. FILTER NOT EXISTS { ?st pq:P582 [] }
        ?cur rdfs:label ?curKo FILTER(LANG(?curKo) = "ko")
      }`),
    await sparql(`
      SELECT ?c ?alias WHERE {
        VALUES ?c { ${values} }
        ?c skos:altLabel ?alias FILTER(LANG(?alias) = "ko")
      }`),
  ];
  return { basic, borders, languages, capitals, currencies, aliases };
}

/** 14,000,000 → '약 1,400만 명', 1,400,000,000 → '약 14억 명' */
function formatPopulation(n) {
  if (n >= 1e8) return `약 ${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, '')}억 명`;
  if (n >= 1e4) return `약 ${Math.round(n / 1e4).toLocaleString('ko-KR')}만 명`;
  return `약 ${Math.round(n / 100) * 100}명`;
}
/** 면적 + 이 목록 안에서의 순위 */
function formatArea(km2, rank, total) {
  const value =
    km2 >= 1e4
      ? `약 ${Math.round(km2 / 1e4).toLocaleString('ko-KR')}만 km²`
      : km2 >= 10
        ? `약 ${Math.round(km2).toLocaleString('ko-KR')} km²`
        : `약 ${Number(km2.toFixed(2))} km²`;
  return `${value} (${total}개국 중 ${rank}위)`;
}

/** 힌트 글자에서 나라 이름(과 별칭)을 ○ 로 가린다 — '프랑스어' → '○○○어' */
function mask(text, names) {
  let out = text;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (name.length < 2) continue;
    out = out.replaceAll(name, '○'.repeat(name.length));
  }
  return out;
}

const isCleanAlias = (s) => s.length >= 2 && s.length <= 20 && /^[가-힣a-zA-Z .'-]+$/.test(s);
const sq = (s) => s.replaceAll("'", "''");

function toSql(questions) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `-- 힌트 퀴즈 — 나라 문제 ${questions.length}개 (자동 생성, 직접 수정하지 말 것)`,
    '-- 출처: 위키데이터 (https://www.wikidata.org, CC0) — 유엔 회원국 + 바티칸·팔레스타인',
    `-- 생성: node apps/api/seeds/scripts/hint-quiz-country.mjs (${today})`,
    `-- 이 파일의 문제만 지우고 다시 넣는다 (meta.source = wikidata, category = ${CATEGORY}). 직접 만든 문제는 hint-quiz.sql`,
    '',
    "INSERT OR IGNORE INTO game (id, name, category) VALUES ('hint-quiz', '힌트 퀴즈', 'quiz');",
    '',
    `DELETE FROM quiz_item WHERE game_id = 'hint-quiz' AND json_extract(meta, '$.source') = 'wikidata' AND json_extract(meta, '$.category') = '${CATEGORY}';`,
    '',
    'INSERT INTO quiz_item (game_id, question, answer, meta) VALUES',
    `${questions
      .map(
        (q) =>
          `  ('hint-quiz', '${sq(QUESTION)}', '${sq(q.answer)}', '${sq(JSON.stringify(q.meta))}')`,
      )
      .join(',\n')};`,
  ];
  return `${lines.join('\n')}\n`;
}

console.log('▶ 나라 목록');
const countries = await fetchCountries();
console.log(`  ${countries.length}개`);

console.log('▶ 상세 조회');
const byId = new Map(
  countries.map((c) => [
    c.id,
    { ...c, conts: [], borders: [], languages: [], capitals: [], currencies: [], aliases: [] },
  ]),
);
const d = await fetchDetails(countries.map((c) => `wd:${c.id}`).join(' '));
for (const r of d.basic) {
  const c = byId.get(qid(r.c));
  c.conts = uniq([...c.conts, r.contKo]);
  if (r.pop) c.pop = Math.max(c.pop ?? 0, Number(r.pop));
  // 대표(preferred) 인구 값이 없는 나라는 다른 인구 값 중 가장 큰 것
  if (r.popAny) c.popAny = Math.max(c.popAny ?? 0, Number(r.popAny));
  // 면적은 SI 단위(m²)로 정규화된 값이라 km² 로 바꾼다
  if (r.area) c.area = Math.max(c.area ?? 0, Number(r.area) / 1e6);
}
for (const r of d.borders) {
  const c = byId.get(qid(r.c));
  const n = byId.get(qid(r.n));
  if (n) c.borders = uniq([...c.borders, n.name]);
}
// 공용어는 대표(preferred)로 표시된 언어를 먼저 (미국: 영어)
for (const r of d.languages)
  byId
    .get(qid(r.c))
    .languages.push({ name: r.langKo, preferred: r.rank.endsWith('PreferredRank') });
for (const r of d.capitals) {
  const c = byId.get(qid(r.c));
  c.capitals = uniq([...c.capitals, r.capKo]);
}
for (const c of byId.values()) c.pop ??= c.popAny;
for (const r of d.currencies) byId.get(qid(r.c)).currencies.push(r.curKo);
for (const r of d.aliases) byId.get(qid(r.c)).aliases.push(r.alias);

const all = [...byId.values()];
const byArea = [...all].filter((c) => c.area).sort((a, b) => b.area - a.area);

const questions = [];
const skipped = [];
for (const c of all.sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
  if (HANDMADE.has(c.name)) continue;
  const continent = c.conts.find((x) => x !== '유라시아');
  const capital =
    c.name in CAPITAL ? CAPITAL[c.name] : c.capitals.length === 1 ? c.capitals[0] : undefined;
  if (!continent || !c.pop || !c.area || capital === undefined) {
    skipped.push(
      `${c.name} (대륙 ${continent ?? '-'}, 인구 ${c.pop ?? '-'}, 면적 ${c.area ?? '-'}, 수도 ${c.capitals.join('/') || '-'})`,
    );
    continue;
  }
  const names = uniq([
    c.name,
    c.wdName,
    ...(EXTRA_ALIASES[c.name.replaceAll(' ', '_')] ?? []),
    ...c.aliases,
  ]);
  const languages =
    LANGUAGES[c.name] ??
    uniq(
      [...c.languages].sort((a, b) => Number(b.preferred) - Number(a.preferred)).map((l) => l.name),
    ).slice(0, 3);
  // 수도 이름에 나라 이름이 들어 있으면(싱가포르, 바티칸) 수도 대신 통화를 힌트로 쓴다
  const capitalHint = capital && mask(capital, names) === capital ? capital : null;
  const hints = [
    { label: '대륙', value: continent },
    { label: '인구', value: formatPopulation(c.pop) },
    { label: '면적', value: formatArea(c.area, byArea.indexOf(c) + 1, byArea.length) },
    {
      // 위키데이터는 바다 건너 가까운 나라도 이웃으로 넣는다 (대한민국 ↔ 일본)
      label: '이웃 나라',
      value: c.borders.length
        ? c.borders.slice(0, 4).join(', ') + (c.borders.length > 4 ? ' 등' : '')
        : '없음',
    },
    ...(languages.length ? [{ label: '공용어', value: languages.join(', ') }] : []),
    capitalHint
      ? { label: '수도', value: capitalHint }
      : { label: '통화', value: uniq(c.currencies).join(', ') || '-' },
    // 대륙 이름은 가리지 않는다 (미국 별칭 '아메리카' → 북○○○○ 방지)
  ].map((h) => (h.label === '대륙' ? h : { ...h, value: mask(h.value, names) }));

  // '남아프리카 공화국' → '남아프리카' (도미니카·콩고처럼 같은 줄임말의 나라가 둘이면 뺀다)
  const short = c.name.replace(/\s*(공화국|연방)$/, '');
  const shortAlias =
    short !== c.name && !all.some((o) => o !== c && o.name.startsWith(short)) ? short : null;
  const aliases = uniq([...names, shortAlias, c.en?.toLowerCase().replaceAll(' ', '')])
    .filter(isCleanAlias)
    .filter((a) => a !== c.name);
  questions.push({
    answer: c.name,
    meta: {
      category: CATEGORY,
      hints,
      ...(aliases.length ? { aliases } : {}),
      source: 'wikidata',
      wikidata: c.id,
    },
  });
}

writeFileSync(OUT_FILE, toSql(questions));
console.log(`\n✅ ${questions.length}개 생성 → seeds/hint-quiz-country.sql`);
if (skipped.length)
  console.warn(`⚠️ 정보가 모자라 뺀 나라 ${skipped.length}개:\n  ${skipped.join('\n  ')}`);
