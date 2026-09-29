// 힌트 퀴즈 — 축구선수 문제 생성 스크립트 (위키데이터 → seeds/hint-quiz-football.sql)
//
// 데이터 출처: 위키데이터 (https://www.wikidata.org, CC0 — 자유 이용)
// 위키백과 문서 수(sitelinks)가 많은 = 유명한 선수 순으로, 한국어 이름이 있고
// 포지션·신장·생년·국적·소속팀 이력이 모두 있는 선수만 골라 힌트 5개를 만든다.
// 선발: 한국 선수 몫(KOREA_TARGET) + 나머지는 전 세계 유명한 순 (한 나라 최대 COUNTRY_CAP 명)
//
// 실행: node apps/api/seeds/scripts/hint-quiz-football.mjs [인원수=1000]
// → apps/api/seeds/hint-quiz-football.sql 을 덮어쓴다. 결과를 검토한 뒤 커밋할 것.
// ※ Node 로 실행하는 개발용 스크립트 (Workers 코드 아님)
import { writeFileSync } from 'node:fs';

const TARGET = Number(process.argv[2] ?? 1000);
const CANDIDATE_LIMIT = Math.ceil(TARGET * 2.2);
/** 한국 선수 몫 — 전 세계 순위로만 뽑으면 한국 선수가 거의 들어가지 않는다 */
const KOREA_TARGET = Math.round(TARGET * 0.2);
const KOREA_CANDIDATE_LIMIT = KOREA_TARGET * 2;
/** 한국 외 한 나라에서 뽑는 최대 인원 — 특정 나라(예: 일본)가 목록을 채우지 않게 */
const COUNTRY_CAP = Math.round(TARGET * 0.07);
const KOREA = '대한민국';
const BATCH_SIZE = 100;
const INSERT_CHUNK = 100; // D1 은 SQL 문 하나가 100KB 를 넘으면 안 되므로 나눠서 INSERT
const OUT_FILE = new URL('../hint-quiz-football.sql', import.meta.url);
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'simsim-arcade-seed/1.0 (https://github.com/SBS-fullstack-A-team/simsim-arcade)';

/** 직접 만든 문제(seeds/hint-quiz.sql)에 이미 있는 선수 — 중복 생성하지 않는다 */
const HANDMADE = new Set([
  '손흥민',
  '리오넬 메시',
  '크리스티아누 호날두',
  '박지성',
  '차범근',
  '킬리안 음바페',
  '엘링 홀란',
  '김민재',
]);

const QUESTION = '이 축구선수는 누구일까요?';

async function sparql(query, attempt = 1) {
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
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

// 1) 후보: 축구선수(Q937857) 중 유명한 순, 한국어 이름·포지션·신장·생년이 있는 사람
async function fetchCandidates() {
  const rows = await sparql(`
    SELECT ?p ?links WHERE {
      ?p wdt:P106 wd:Q937857; wikibase:sitelinks ?links.
      FILTER(?links >= 25)
      ?p wdt:P413 []; wdt:P2048 []; wdt:P569 [].
      FILTER EXISTS { ?p rdfs:label ?ko FILTER(LANG(?ko) = "ko") }
    }
    ORDER BY DESC(?links)
    LIMIT ${CANDIDATE_LIMIT}`);
  return rows.map((r) => ({ id: qid(r.p), links: Number(r.links) }));
}

// 1-2) 후보: 한국 선수 (대표팀 국적 또는 국적이 대한민국 Q884)
async function fetchKoreanCandidates() {
  const rows = await sparql(`
    SELECT DISTINCT ?p ?links WHERE {
      ?p wdt:P106 wd:Q937857; wikibase:sitelinks ?links.
      { ?p wdt:P1532 wd:Q884 } UNION { ?p wdt:P27 wd:Q884 }
      ?p wdt:P413 []; wdt:P2048 []; wdt:P569 [].
      FILTER EXISTS { ?p rdfs:label ?ko FILTER(LANG(?ko) = "ko") }
    }
    ORDER BY DESC(?links)
    LIMIT ${KOREA_CANDIDATE_LIMIT}`);
  return rows.map((r) => ({ id: qid(r.p), links: Number(r.links) }));
}

// 2) 상세: 이름·신장·생년·국적
async function fetchBasics(values) {
  return sparql(`
    SELECT ?p ?ko ?en ?height ?birth ?sportCountryKo ?citizenKo WHERE {
      VALUES ?p { ${values} }
      ?p rdfs:label ?ko FILTER(LANG(?ko) = "ko")
      OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en) = "en") }
      OPTIONAL { ?p p:P2048/psn:P2048/wikibase:quantityAmount ?height }
      OPTIONAL { ?p wdt:P569 ?birth }
      OPTIONAL { ?p wdt:P1532 ?sc. ?sc rdfs:label ?sportCountryKo FILTER(LANG(?sportCountryKo) = "ko") }
      OPTIONAL { ?p wdt:P27 ?cz. ?cz rdfs:label ?citizenKo FILTER(LANG(?citizenKo) = "ko") }
    }`);
}

// 3) 상세: 포지션 (영문 이름으로 4가지로 분류)
async function fetchPositions(values) {
  return sparql(`
    SELECT ?p ?posEn WHERE {
      VALUES ?p { ${values} }
      ?p p:P413 ?st. ?st ps:P413 ?pos.
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      ?pos rdfs:label ?posEn FILTER(LANG(?posEn) = "en")
    }`);
}

// 4) 상세: 소속팀 이력 (국가대표팀 제외, 팀의 유명도 포함)
// ※ wdt:P54 는 '현재 소속팀'에 우선 순위가 붙어 있으면 그 팀만 돌려주므로, 모든 기록(p:/ps:)을 읽는다
async function fetchTeams(values) {
  return sparql(`
    SELECT ?p ?team ?teamKo ?teamEn ?teamLinks WHERE {
      VALUES ?p { ${values} }
      ?p p:P54 ?st. ?st ps:P54 ?team.
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      ?team wikibase:sitelinks ?teamLinks.
      FILTER NOT EXISTS { ?team wdt:P31/wdt:P279* wd:Q6979593 }
      OPTIONAL { ?team rdfs:label ?teamKo FILTER(LANG(?teamKo) = "ko") }
      OPTIONAL { ?team rdfs:label ?teamEn FILTER(LANG(?teamEn) = "en") }
    }`);
}

// 5) 상세: 한국어 별칭 (정답으로 함께 인정)
async function fetchAliases(values) {
  return sparql(`
    SELECT ?p ?alias WHERE {
      VALUES ?p { ${values} }
      ?p skos:altLabel ?alias FILTER(LANG(?alias) = "ko")
    }`);
}

const POSITION_ORDER = ['골키퍼', '수비수', '미드필더', '공격수'];

function positionBucket(en) {
  const s = en.toLowerCase();
  if (s.includes('goalkeeper')) return '골키퍼';
  if (/back|defender|sweeper|libero/.test(s)) return '수비수';
  if (/midfield|playmaker/.test(s)) return '미드필더';
  if (/forward|striker|winger|attacker/.test(s)) return '공격수';
  return null;
}

// 청소년·올림픽 대표, 2군·유소년팀 등은 대표 소속팀에서 뺀다
const EXCLUDED_TEAM =
  /national|under-|\bu-?\d{2}\b|olympic|reserves?\b|\bb\b|youth|academy|\bii\b/i;

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/** 위키데이터의 공식 국가명 → 흔히 쓰는 이름 */
const COUNTRY_NAME = {
  '네덜란드 왕국': '네덜란드',
  '그레이트브리튼 북아일랜드 연합왕국': '영국',
  미합중국: '미국',
  중화인민공화국: '중국',
  중화민국: '대만',
  조선민주주의인민공화국: '북한',
  '소비에트 사회주의 공화국 연방': '소련',
  '유고슬라비아 사회주의 연방공화국': '유고슬라비아',
  '유고슬라비아 연방 공화국': '유고슬라비아',
  '유고슬라비아 왕국': '유고슬라비아',
  '독일 민주 공화국': '동독',
  '벨기에 왕국': '벨기에',
  '덴마크 왕국': '덴마크',
  '노르웨이 왕국': '노르웨이',
  '스웨덴 왕국': '스웨덴',
  '스페인 왕국': '스페인',
};
const countryName = (name) => COUNTRY_NAME[name] ?? name;

async function collectDetails(candidates) {
  const players = new Map(candidates.map((c) => [c.id, { ...c, positions: [], teams: new Map() }]));
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const values = batch.map((c) => `wd:${c.id}`).join(' ');
    console.log(`  상세 조회 ${i + 1}~${i + batch.length} / ${candidates.length}`);

    const [basics, positions, teams, aliases] = [
      await fetchBasics(values),
      await fetchPositions(values),
      await fetchTeams(values),
      await fetchAliases(values),
    ];

    for (const r of basics) {
      const p = players.get(qid(r.p));
      p.ko ??= r.ko;
      p.en ??= r.en;
      if (r.height && !p.height) p.height = Number(r.height);
      if (r.birth && !p.birth) p.birth = r.birth.slice(0, 4);
      p.sportCountries = uniq([...(p.sportCountries ?? []), r.sportCountryKo]);
      p.citizenships = uniq([...(p.citizenships ?? []), r.citizenKo]);
    }
    for (const r of positions) {
      const bucket = positionBucket(r.posEn);
      if (bucket) players.get(qid(r.p)).positions.push(bucket);
    }
    for (const r of teams) {
      const name = r.teamKo ?? r.teamEn;
      if (!name || EXCLUDED_TEAM.test(r.teamEn ?? '') || EXCLUDED_TEAM.test(name)) continue;
      players
        .get(qid(r.p))
        .teams.set(qid(r.team), { name, hasKo: Boolean(r.teamKo), links: Number(r.teamLinks) });
    }
    for (const r of aliases) {
      const p = players.get(qid(r.p));
      p.aliases = uniq([...(p.aliases ?? []), r.alias]);
    }
  }
  return [...players.values()];
}

/** 선수 1명 → 힌트 5개 (막연한 것 → 구체적인 것). 정보가 모자라면 null */
function toQuestion(p) {
  const positions = POSITION_ORDER.filter((b) => p.positions.includes(b));
  const heightCm = p.height ? Math.round(p.height * 100) : 0;
  const countries = uniq(
    (p.sportCountries.length ? p.sportCountries : p.citizenships).map(countryName),
  ).slice(0, 2);
  // 한국어 이름이 있는 팀을 먼저, 그 안에서는 유명한 팀 순
  const clubs = [...p.teams.values()]
    .sort((a, b) => Number(b.hasKo) - Number(a.hasKo) || b.links - a.links)
    .slice(0, 2)
    .map((t) => t.name);

  if (!p.ko || positions.length === 0 || countries.length === 0 || clubs.length === 0) return null;
  if (heightCm < 150 || heightCm > 210 || !p.birth) return null;

  return {
    answer: p.ko,
    en: p.en,
    koAliases: p.aliases ?? [],
    meta: {
      category: '축구선수',
      hints: [
        { label: '포지션', value: positions.join(' / ') },
        { label: '신장', value: `${heightCm}cm` },
        { label: '출생', value: `${p.birth}년` },
        { label: '국적', value: countries.join(' / ') },
        { label: '대표 소속팀', value: clubs.join(', ') },
      ],
      source: 'wikidata',
      wikidata: p.id,
    },
  };
}

const lastToken = (name) => name.trim().split(/\s+/).at(-1);
const isCleanAlias = (s) => s.length >= 2 && s.length <= 20 && /^[가-힣a-zA-Z .'-]+$/.test(s);

/** 정답으로 함께 인정할 이름: 영문 이름, 한국어 별칭, (겹치지 않는) 성 */
function addAliases(questions) {
  const count = (list) => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const answers = new Set(questions.map((q) => q.answer));
  const koLastCount = count(questions.map((q) => lastToken(q.answer)));
  const enLastCount = count(
    questions.filter((q) => q.en).map((q) => lastToken(q.en).toLowerCase()),
  );

  for (const q of questions) {
    const candidates = [q.en, ...q.koAliases];
    const koLast = lastToken(q.answer);
    if (koLast !== q.answer && koLastCount.get(koLast) === 1) candidates.push(koLast);
    // 영문 성은 한국어 이름에 띄어쓰기가 있는 서양식 이름일 때만 (예: Messi)
    // 한국식 이름(기성용 → Ki Sung-yueng)은 영문 끝 단어가 성이 아니라 이름이다
    if (q.en && koLast !== q.answer) {
      const enLast = lastToken(q.en).toLowerCase();
      if (enLastCount.get(enLast) === 1) candidates.push(enLast);
    }
    // 다른 선수의 정답과 같은 별칭은 쓰지 않는다
    const aliases = uniq(candidates)
      .filter(isCleanAlias)
      .filter((a) => a !== q.answer && !answers.has(a));
    if (aliases.length > 0) q.meta.aliases = aliases;
  }
}

const sq = (s) => s.replaceAll("'", "''");

function toSql(questions) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `-- 힌트 퀴즈 — 축구선수 문제 ${questions.length}개 (자동 생성, 직접 수정하지 말 것)`,
    '-- 출처: 위키데이터 (https://www.wikidata.org, CC0) — 유명한 순 + 한국어 이름이 있는 선수',
    `-- 생성: node apps/api/seeds/scripts/hint-quiz-football.mjs (${today})`,
    '-- 이 파일의 문제만 지우고 다시 넣는다 (meta.source = wikidata). 직접 만든 문제는 hint-quiz.sql',
    '',
    "INSERT OR IGNORE INTO game (id, name, category) VALUES ('hint-quiz', '힌트 퀴즈', 'quiz');",
    '',
    "DELETE FROM quiz_item WHERE game_id = 'hint-quiz' AND json_extract(meta, '$.source') = 'wikidata';",
  ];
  for (let i = 0; i < questions.length; i += INSERT_CHUNK) {
    const rows = questions
      .slice(i, i + INSERT_CHUNK)
      .map(
        (q) =>
          `  ('hint-quiz', '${sq(QUESTION)}', '${sq(q.answer)}', '${sq(JSON.stringify(q.meta))}')`,
      );
    lines.push(
      '',
      'INSERT INTO quiz_item (game_id, question, answer, meta) VALUES',
      `${rows.join(',\n')};`,
    );
  }
  return `${lines.join('\n')}\n`;
}

console.log(
  `▶ 후보 조회 (전 세계 최대 ${CANDIDATE_LIMIT}명 + 한국 최대 ${KOREA_CANDIDATE_LIMIT}명)`,
);
const merged = new Map();
for (const c of [...(await fetchCandidates()), ...(await fetchKoreanCandidates())])
  merged.set(c.id, c);
const candidates = [...merged.values()];
console.log(`  후보 ${candidates.length}명`);

console.log('▶ 상세 조회');
const players = await collectDetails(candidates);

// 힌트를 만들 수 있는 선수만, 유명한 순으로 (정답 이름이 겹치면 더 유명한 쪽만)
const seen = new Set(HANDMADE);
const pool = [];
for (const p of players.sort((a, b) => b.links - a.links)) {
  const q = toQuestion(p);
  if (!q || seen.has(q.answer)) continue;
  seen.add(q.answer);
  pool.push({ q, links: p.links });
}
const isKorean = ({ q }) => q.meta.hints[3].value.split(' / ').includes(KOREA);

// 한국 선수 몫을 먼저 채우고, 나머지는 나라별 상한을 지키며 유명한 순으로
const picked = new Set(pool.filter(isKorean).slice(0, KOREA_TARGET));
const perCountry = new Map();
for (const item of pool) {
  if (picked.size >= TARGET) break;
  if (picked.has(item) || isKorean(item)) continue;
  const country = item.q.meta.hints[3].value.split(' / ')[0];
  if ((perCountry.get(country) ?? 0) >= COUNTRY_CAP) continue;
  perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
  picked.add(item);
}
const questions = pool.filter((item) => picked.has(item)).map((item) => item.q);
addAliases(questions);

writeFileSync(OUT_FILE, toSql(questions));
const koreans = questions.filter((q) => isKorean({ q })).length;
console.log(
  `\n✅ ${questions.length}명 생성 (한국 선수 ${koreans}명) → seeds/hint-quiz-football.sql`,
);
if (questions.length < TARGET)
  console.warn(`⚠️ 목표 ${TARGET}명보다 적습니다. CANDIDATE_LIMIT 를 늘려 보세요.`);
