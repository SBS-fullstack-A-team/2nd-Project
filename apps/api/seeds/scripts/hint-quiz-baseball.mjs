// 힌트 퀴즈 — 야구선수(KBO) 문제 생성 스크립트 (위키데이터 + 위키백과 조회수 → seeds/hint-quiz-baseball.sql)
//
// 데이터 출처
// - 선수·힌트(국적·생년·포지션·소속팀·출신 학교): 위키데이터 (https://www.wikidata.org, CC0 — 자유 이용)
// - 인기도: 한국어 위키백과 최근 1년 문서 조회수 (Wikimedia Pageviews API, CC0)
//
// 선발: KBO 리그 팀에서 뛴 야구선수 중 한국어 위키백과 조회수가 많은 = 요즘 관심이 많은 선수 순으로,
// 포지션·생년·소속팀이 있는 선수만 골라 힌트 5~6개를 만든다. (게임이 마지막에 '이름 초성' 힌트를 붙인다)
// 비율: 레전드(LEGEND_BORN_BEFORE 년 이전 출생) 최대 LEGEND_TARGET 명, 나머지는 요즘 선수
//
// 실행: node apps/api/seeds/scripts/hint-quiz-baseball.mjs [인원수=300]
// → apps/api/seeds/hint-quiz-baseball.sql 을 덮어쓴다. 결과를 검토한 뒤 커밋할 것.
// ※ Node 로 실행하는 개발용 스크립트 (Workers 코드 아님)
import { writeFileSync } from 'node:fs';

const TARGET = Number(process.argv[2] ?? 300);
/** 상세 정보를 받아 볼 조회수 상위 선수 수 (정보가 모자란 선수를 빼도 목표를 채울 만큼) */
const DETAIL_POOL = Math.ceil(TARGET * 1.6);
/** 레전드 기준 출생 연도와 최대 인원 — 요즘 선수 위주로 */
const LEGEND_BORN_BEFORE = 1985;
const LEGEND_TARGET = Math.round(TARGET * 0.1);
const KBO_LEAGUE = 'Q625168';
const BASEBALL_PLAYER = 'Q10871364';
const CATEGORY = '야구선수';
/** 문제 하나의 최소 힌트 수 (게임이 '이름 초성' 힌트를 하나 더 붙인다) */
const MIN_HINTS = 5;
const BATCH_SIZE = 100;
const PAGEVIEW_CONCURRENCY = 3; // 많이 보내면 429 (요청 과다) 로 거절된다
const INSERT_CHUNK = 100; // D1 은 SQL 문 하나가 100KB 를 넘으면 안 되므로 나눠서 INSERT
const OUT_FILE = new URL('../hint-quiz-baseball.sql', import.meta.url);
const ENDPOINT = 'https://query.wikidata.org/sparql';
const PAGEVIEWS =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ko.wikipedia/all-access/user';
const USER_AGENT = 'simsim-arcade-seed/1.0 (https://github.com/SBS-fullstack-A-team/simsim-arcade)';

const QUESTION = '이 야구선수는 누구일까요?';

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

// 1) 후보: KBO 리그 팀에서 뛴 야구선수 중 한국어 위키백과 문서가 있는 사람
async function fetchCandidates() {
  const rows = await sparql(`
    SELECT DISTINCT ?p ?title WHERE {
      ?p wdt:P106 wd:${BASEBALL_PLAYER}; wdt:P54 ?team.
      ?team wdt:P118 wd:${KBO_LEAGUE}.
      ?article schema:about ?p; schema:isPartOf <https://ko.wikipedia.org/>; schema:name ?title.
    }`);
  return rows.map((r) => ({ id: qid(r.p), title: r.title }));
}

// 2) 인기도: 한국어 위키백과 최근 12개월 조회수 합
function lastTwelveMonths() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // 지난달 말일
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
  return [ymd(start), ymd(end)];
}

async function fetchPageviews(title, [start, end], attempt = 1) {
  const url = `${PAGEVIEWS}/${encodeURIComponent(title.replaceAll(' ', '_'))}/monthly/${start}/${end}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return 0; // 기간 안에 조회 기록이 없음
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 8) throw new Error(`조회수 요청 실패 (${res.status})`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 5;
    await new Promise((r) => setTimeout(r, wait * 1000));
    return fetchPageviews(title, [start, end], attempt + 1);
  }
  if (!res.ok) throw new Error(`조회수 요청 실패 (${res.status}): ${title}`);
  const json = await res.json();
  return json.items.reduce((sum, item) => sum + item.views, 0);
}

async function addPageviews(candidates) {
  const range = lastTwelveMonths();
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const c = candidates[next++];
      c.views = await fetchPageviews(c.title, range);
      if (next % 200 === 0) console.log(`  조회수 ${next} / ${candidates.length}`);
    }
  };
  await Promise.all(Array.from({ length: PAGEVIEW_CONCURRENCY }, worker));
  console.log(`  조회 기간 ${range[0]}~${range[1]}`);
}

// 3) 상세: 이름·생년·국적·신장
async function fetchBasics(values) {
  return sparql(`
    SELECT ?p ?ko ?en ?birth ?countryKo WHERE {
      VALUES ?p { ${values} }
      ?p rdfs:label ?ko FILTER(LANG(?ko) = "ko")
      OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en) = "en") }
      OPTIONAL { ?p wdt:P569 ?birth }
      OPTIONAL { ?p wdt:P27 ?c. ?c rdfs:label ?countryKo FILTER(LANG(?countryKo) = "ko") }
    }`);
}

// 4) 상세: 포지션 (영문 이름으로 분류)
async function fetchPositions(values) {
  return sparql(`
    SELECT ?p ?posEn WHERE {
      VALUES ?p { ${values} }
      ?p p:P413 ?st. ?st ps:P413 ?pos.
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      ?pos rdfs:label ?posEn FILTER(LANG(?posEn) = "en")
    }`);
}

// 5) 상세: 소속팀 이력 (시작 연도로 최근 팀을 고른다, 국가대표팀 제외)
async function fetchTeams(values) {
  return sparql(`
    SELECT ?p ?team ?teamKo ?teamEn ?start ?kbo WHERE {
      VALUES ?p { ${values} }
      ?p p:P54 ?st. ?st ps:P54 ?team.
      FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
      OPTIONAL { ?st pq:P580 ?start }
      OPTIONAL { ?team wdt:P118 ?league FILTER(?league = wd:${KBO_LEAGUE}) BIND(true AS ?kbo) }
      OPTIONAL { ?team rdfs:label ?teamKo FILTER(LANG(?teamKo) = "ko") }
      OPTIONAL { ?team rdfs:label ?teamEn FILTER(LANG(?teamEn) = "en") }
    }`);
}

// 6) 상세: 출신 학교, 한국어 별칭
async function fetchSchools(values) {
  return sparql(`
    SELECT ?p ?schoolKo WHERE {
      VALUES ?p { ${values} }
      ?p wdt:P69 ?s. ?s rdfs:label ?schoolKo FILTER(LANG(?schoolKo) = "ko")
    }`);
}
async function fetchAliases(values) {
  return sparql(`
    SELECT ?p ?alias WHERE {
      VALUES ?p { ${values} }
      ?p skos:altLabel ?alias FILTER(LANG(?alias) = "ko")
    }`);
}

const POSITION_ORDER = ['투수', '포수', '내야수', '외야수', '지명타자'];

function positionBucket(en) {
  const s = en.toLowerCase();
  if (s.includes('pitcher')) return '투수';
  if (s.includes('catcher')) return '포수';
  if (/baseman|shortstop|infielder/.test(s)) return '내야수';
  if (/outfielder|fielder/.test(s)) return '외야수';
  if (s.includes('designated hitter')) return '지명타자';
  return null;
}

// 국가대표·청소년팀 등은 소속팀에서 뺀다
const EXCLUDED_TEAM = /national|대표|under-|\bu-?\d{2}\b|olympic/i;

async function collectDetails(candidates) {
  const players = new Map(
    candidates.map((c) => [c.id, { ...c, positions: [], teams: new Map(), schools: [] }]),
  );
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const values = batch.map((c) => `wd:${c.id}`).join(' ');
    console.log(`  상세 조회 ${i + 1}~${i + batch.length} / ${candidates.length}`);

    const [basics, positions, teams, schools, aliases] = [
      await fetchBasics(values),
      await fetchPositions(values),
      await fetchTeams(values),
      await fetchSchools(values),
      await fetchAliases(values),
    ];
    for (const r of basics) {
      const p = players.get(qid(r.p));
      p.ko ??= r.ko;
      p.en ??= r.en;
      if (r.birth && !p.birth) p.birth = r.birth.slice(0, 4);
      p.countries = uniq([...(p.countries ?? []), r.countryKo]);
    }
    for (const r of positions) {
      const bucket = positionBucket(r.posEn);
      if (bucket) players.get(qid(r.p)).positions.push(bucket);
    }
    for (const r of teams) {
      const name = r.teamKo ?? r.teamEn;
      if (!name || EXCLUDED_TEAM.test(r.teamEn ?? '') || EXCLUDED_TEAM.test(name)) continue;
      const team = players.get(qid(r.p)).teams;
      const prev = team.get(qid(r.team));
      const start = r.start ? Number(r.start.slice(0, 4)) : 0;
      team.set(qid(r.team), {
        name,
        kbo: Boolean(r.kbo) || Boolean(prev?.kbo),
        start: Math.max(start, prev?.start ?? 0),
      });
    }
    for (const r of schools) {
      const p = players.get(qid(r.p));
      p.schools = uniq([...p.schools, r.schoolKo]);
    }
    for (const r of aliases) {
      const p = players.get(qid(r.p));
      p.aliases = uniq([...(p.aliases ?? []), r.alias]);
    }
  }
  return [...players.values()];
}

/** 위키데이터의 공식 국가명 → 흔히 쓰는 이름 */
const COUNTRY_NAME = {
  미합중국: '미국',
  '도미니카 공화국': '도미니카 공화국',
  '베네수엘라 볼리바르 공화국': '베네수엘라',
  중화민국: '대만',
  중화인민공화국: '중국',
};
const countryName = (name) => COUNTRY_NAME[name] ?? name;

/** 선수 1명 → 힌트 5~6개 (국적 → 출생 → 포지션 → 소속팀 → 출신 학교 → 다른 소속팀). 정보가 모자라면 null */
function toQuestion(p) {
  const positions = POSITION_ORDER.filter((b) => p.positions.includes(b));
  const countries = uniq(p.countries.map(countryName)).slice(0, 2);
  // 최근에 들어간 팀 순 (시작 연도가 없으면 뒤로) — KBO 팀을 대표 소속팀으로
  const teams = [...p.teams.values()].sort((a, b) => b.start - a.start);
  const mainTeam = teams.find((t) => t.kbo);
  const otherTeams = teams.filter((t) => t !== mainTeam).slice(0, 2);
  // 고등학교·대학교만, 고등학교를 먼저 (초·중학교는 너무 세세해서 뺀다)
  const schools = p.schools
    .filter((s) => /고등학교|대학교|고교/.test(s))
    .sort((a, b) => Number(/고등학교/.test(b)) - Number(/고등학교/.test(a)))
    .slice(0, 2);

  if (!p.ko || !p.birth || positions.length === 0 || !mainTeam || countries.length === 0)
    return null;
  // 동명이인 구분 괄호는 정답에서 뺀다 (예: '김도영 (야구 선수)' → '김도영')
  const answer = p.ko.replace(/\s*\(.*?\)\s*/g, ' ').trim();

  const hints = [
    { label: '국적', value: countries.join(' / ') },
    { label: '출생 연도', value: `${p.birth}년` },
    { label: '포지션', value: positions.join(' / ') },
    { label: 'KBO 소속팀', value: mainTeam.name },
    ...(schools.length ? [{ label: '출신 학교', value: schools.join(', ') }] : []),
    ...(otherTeams.length
      ? [{ label: '다른 소속팀', value: otherTeams.map((t) => t.name).join(', ') }]
      : []),
  ];
  if (hints.length < MIN_HINTS) return null;

  return {
    answer,
    en: p.en,
    koAliases: p.aliases ?? [],
    meta: {
      category: CATEGORY,
      hints,
      source: 'wikidata',
      wikidata: p.id,
    },
  };
}

const lastToken = (name) => name.trim().split(/\s+/).at(-1);
const isCleanAlias = (s) => s.length >= 2 && s.length <= 20 && /^[가-힣a-zA-Z .'-]+$/.test(s);

/** 정답으로 함께 인정할 이름: 한국어 별칭, 외국 선수는 영문 이름과 (겹치지 않는) 성 */
function addAliases(questions) {
  const answers = new Set(questions.map((q) => q.answer));
  const lastCount = new Map();
  for (const q of questions) {
    const last = lastToken(q.answer);
    lastCount.set(last, (lastCount.get(last) ?? 0) + 1);
  }
  for (const q of questions) {
    const foreign = /\s/.test(q.answer);
    const candidates = [...q.koAliases];
    if (foreign) {
      candidates.push(q.en);
      const last = lastToken(q.answer);
      if (lastCount.get(last) === 1) candidates.push(last);
    }
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
    `-- 힌트 퀴즈 — 야구선수(KBO) 문제 ${questions.length}개 (자동 생성, 직접 수정하지 말 것)`,
    '-- 출처: 위키데이터 (https://www.wikidata.org, CC0), 인기도: 한국어 위키백과 조회수',
    `-- 생성: node apps/api/seeds/scripts/hint-quiz-baseball.mjs (${today})`,
    `-- 이 파일의 문제만 지우고 다시 넣는다 (meta.source = wikidata, category = ${CATEGORY})`,
    '',
    "INSERT OR IGNORE INTO game (id, name, category) VALUES ('hint-quiz', '힌트 퀴즈', 'quiz');",
    '',
    `DELETE FROM quiz_item WHERE game_id = 'hint-quiz' AND json_extract(meta, '$.source') = 'wikidata' AND json_extract(meta, '$.category') = '${CATEGORY}';`,
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

console.log('▶ 후보 조회 (KBO 리그 팀에서 뛴 야구선수)');
const candidates = await fetchCandidates();
console.log(`  후보 ${candidates.length}명`);

console.log('▶ 한국어 위키백과 조회수');
await addPageviews(candidates);
candidates.sort((a, b) => b.views - a.views);

console.log('▶ 상세 조회');
const players = await collectDetails(candidates.slice(0, DETAIL_POOL));

// 힌트를 만들 수 있는 선수만, 조회수 순으로 (정답 이름이 겹치면 조회수 많은 쪽만, 레전드는 상한까지)
const seen = new Set();
const questions = [];
let legends = 0;
for (const p of players.sort((a, b) => b.views - a.views)) {
  if (questions.length >= TARGET) break;
  const q = toQuestion(p);
  if (!q || seen.has(q.answer)) continue;
  const legend = Number(p.birth) < LEGEND_BORN_BEFORE;
  if (legend && legends >= LEGEND_TARGET) continue;
  if (legend) legends++;
  seen.add(q.answer);
  questions.push(q);
}
addAliases(questions);

writeFileSync(OUT_FILE, toSql(questions));
console.log(`\n✅ ${questions.length}명 생성 (레전드 ${legends}명) → seeds/hint-quiz-baseball.sql`);
console.log(
  `  조회수 상위: ${questions
    .slice(0, 20)
    .map((q) => q.answer)
    .join(', ')}`,
);
if (questions.length < TARGET)
  console.warn(`⚠️ 목표 ${TARGET}명보다 적습니다. DETAIL_POOL 을 늘려 보세요.`);
