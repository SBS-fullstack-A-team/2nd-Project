// 힌트 퀴즈 — 축구선수 문제 생성 스크립트 (위키데이터 → seeds/hint-quiz-football.sql)
//
// 데이터 출처: 위키데이터 (https://www.wikidata.org, CC0 — 자유 이용)
// 위키백과 문서 수(sitelinks)가 많은 = 유명한 선수 순으로, 한국어 이름이 있고
// 포지션·신장·생년·국적·소속팀 이력이 모두 있는 선수만 골라 힌트 5~6개를 만든다.
// (게임이 마지막에 '이름 초성' 힌트를 자동으로 하나 더 붙인다)
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

/**
 * 정답 표기 보정 (위키데이터 ID → 국내 통용 표기) — 재수집해도 유지된다
 * 기준: 국내 중계·주요 언론에서 가장 흔히 쓰는 표기. 풀네임이 긴 브라질 선수 등은 흔히 부르는 이름으로.
 * 위키데이터 한국어 이름(외래어 표기법 기준인 경우가 많음)은 별칭으로 남겨 계속 정답으로 인정한다.
 * aliases: 함께 인정할 이름 (선택)
 */
const NAME_FIX = {
  Q763465: { answer: '하칸 찰하놀루' }, // 칼하노글루
  Q26517: { answer: '루이스 수아레스' }, // 루이스 알베르토 수아레스
  Q17163: { answer: '요한 크루이프' }, // 크라위프
  Q1255625: { answer: '사무엘 에투' }, // 사뮈엘 에토오
  Q41244: { answer: '안드리 셰브첸코' }, // 셰우첸코
  Q79983: { answer: '조세 무리뉴', aliases: ['주제 무리뉴'] }, // 조제 모리뉴
  Q17500: { answer: '사비 에르난데스', aliases: ['차비'] }, // 차비 에르난데스
  Q208104: { answer: '사비 알론소' }, // 샤비 알론소
  Q22951255: { answer: '마커스 래시포드' }, // 래쉬포드
  Q172720: { answer: '다니 알베스' }, // 다니 아우베스
  Q429039: { answer: '호베르투 카를로스', aliases: ['로베르토 카를로스'] }, // 호베르투 카를루스
  Q210453: { answer: '티아구 실바' }, // 치아구 시우바
  Q124086: { answer: '베슬리 스네이더' }, // 베슬러이 스네이더르
  Q311872: { answer: '필리페 쿠티뉴' }, // 필리피 쿠티뉴
  Q47526: { answer: '지코' }, // 코임브라 지코
  Q173972: { answer: '루드 굴리트' }, // 뤼트 휠릿
  Q133903: { answer: '버질 판데이크', aliases: ['버질 반 다이크', '판 다이크', '반 다이크'] },
  Q46347: { answer: '파트리크 비에이라' }, // 비에라
  Q26069: { answer: '클라스 얀 훈텔라르' }, // 클라스얀 휜텔라르
  Q165125: { answer: '하비에르 에르난데스', aliases: ['치차리토'] }, // … 발카사르
  Q192635: { answer: '로날드 쿠만' }, // 로날트 쿠만
  Q1894: { answer: '멤피스 데파이' }, // 더파이
  Q222789: { answer: '루이스 엔리케' }, // … 마르티네스 가르시아
  Q4979316: { answer: '브루노 페르난데스' }, // 브루누 페르난드스
  Q13308: { answer: '사무엘 움티티' }, // 사뮈엘 윔티티
  Q31981: { answer: '다비드 알라바' }, // 다비트 알라바
  Q70550: { answer: '페르 메르테사커' }, // 페어 메르테자커
  Q62786: { answer: '헐크', aliases: ['훌크'] }, // 지바니우두 비에이라 지 소자
  Q228616: { answer: '마르타' }, // 마르타 비에이라 다 시우바
  Q312772: { answer: '프레드' }, // 프레데리쿠 샤베스 게지스
  Q182459: { answer: '줄리우 세자르' }, // … 소아리스 이스핀돌라
  Q184177: { answer: '토마스 베르마엘렌' }, // 페르마엘런
  Q27569376: { answer: '트렌트 알렉산더아놀드' }, // 알렉산더아널드
  Q102331: { answer: '소크라테스' }, // 소크라치스
  Q19497: { answer: '오스카' }, // 오스카르 두스 산투스 임보아바 주니오르
  Q138075: { answer: '알렉산드레 파투' }, // 알레샨드리 파투
  Q233510: { answer: '알렉스 모건' }, // 앨릭스 모건
  Q327456: { answer: '하킴 지예흐' }, // 지예시
  Q514427: { answer: '그라니트 샤카' }, // 자카
  Q179773: { answer: '페드로 로드리게스', aliases: ['페드로'] }, // … 레데스마
  Q16056053: { answer: '잭 그릴리시' }, // 그릴리쉬
  Q28861547: { answer: '하피냐' }, // 하파에우 지아스 벨롤리
  Q19708656: { answer: '가브리엘 제주스' }, // 가브리에우 제주스
  Q6413296: { answer: '킹슬리 코망' }, // 킹슬레 코망
  Q44073: { answer: '비셴테 리자라쥐' }, // 리사라수
  Q170452: { answer: '아드리아누' }, // 아드리아누 레이치 히베이루
  Q185115: { answer: '에드가 다비즈' }, // 엣하르 다비츠
  Q177686: { answer: '마이콘' }, // 마이콩 도글라스 시제난두
  Q175296: { answer: '하울 메이렐레스' }, // 메이렐르스
  Q42728914: { answer: '호드리구' }, // 호드리구 고이스
  Q437329: { answer: '다닐루' }, // 다닐루 루이스 다 시우바
  Q17074511: { answer: '에데르송' }, // 이데르송 모라이스
  Q62657: { answer: '네투' }, // 노르베르투 무라라 네투
  Q484772: { answer: '안데르송' }, // 안데르송 루이스 지 아브레우 올리베이라
  Q666506: { answer: '리카르도 로드리게스' }, // 리카르도 이반 로드리게스 아라야
  Q33297140: { answer: '알렉시스 맥알리스터' }, // 알렉시스 마크 아이스테르
  Q39230: { answer: '마르퀴뉴스' }, // 마르쿠스 아오아스 코헤아
  Q309532: { answer: '에리크 막심 추포모팅' }, // 에리크 막생 슈포 모탱
  Q599675: { answer: '은완코 카누' }, // 느왕쿼 카누
  Q14947422: { answer: '엑토르 베예린' }, // 헥토르 벨레린
  Q194149: { answer: '알렉스 옥슬레이드체임벌린' }, // 앨릭스 …
  Q96396963: { answer: '누누 멘데스' }, // 누누 멘드스
  Q30134278: { answer: '소보슬러이 도미니크', aliases: ['도미니크 소보슬러이'] },
  Q1029982: { answer: '페테르 보스' }, // 페터르 보스즈
  Q27694: { answer: '엠레 찬' }, // 엠레 잔
  Q14640027: { answer: '요나탄 타' }, // 조나탕 타
  Q694014: { answer: '슈코드란 무스타피' }, // 스코드란 무스타피
  Q171295: { answer: '파벨 네드베드' }, // 네드베트
  Q170328: { answer: '에릭 칸토나' }, // 에리크 캉토나
  Q1935: { answer: '에릭 아비달' }, // 에리크 아비달
  Q386876: { answer: '엠마누엘 아데바요르' }, // 에마뉘엘 아데바요르
  Q260725: { answer: '메건 라피노' }, // 메건 러피노
  Q201381: { answer: '뱅상 콤파니' }, // 콩파니
  Q54094: { answer: '사미 케디라' }, // 자미 케디라
  Q16499882: { answer: '르로이 자네', aliases: ['리로이 자네'] },
  Q187396: { answer: '아이두르 구드욘센' }, // 에이뒤르 그뷔드욘센
  Q59105: { answer: '길피 시구르드손' }, // 길비 시귀르드손
  Q244790: { answer: '파블로 사발레타' }, // 자발레타
  Q108111889: { answer: '가비', aliases: ['파블로 가비'] },
  Q213427: { answer: '에런 램지', aliases: ['애런 램지'] },
  Q310598: { answer: '다나카 마르쿠스 툴리오', aliases: ['툴리오'] },
  Q312454: { answer: '파울루 호베르투 파우캉', aliases: ['파우캉'] },
};

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

/** 선수 1명 → 힌트 5~6개 (국적 → 출생 → 포지션 → 소속팀 → 신장 → 다른 소속팀). 정보가 모자라면 null */
function toQuestion(p) {
  const positions = POSITION_ORDER.filter((b) => p.positions.includes(b));
  const heightCm = p.height ? Math.round(p.height * 100) : 0;
  const countries = uniq(
    (p.sportCountries.length ? p.sportCountries : p.citizenships).map(countryName),
  ).slice(0, 2);
  // 한국어 이름이 있는 팀을 먼저, 그 안에서는 유명한 팀 순
  const clubs = [...p.teams.values()]
    .sort((a, b) => Number(b.hasKo) - Number(a.hasKo) || b.links - a.links)
    .slice(0, 3)
    .map((t) => t.name);

  if (!p.ko || positions.length === 0 || countries.length === 0 || clubs.length === 0) return null;
  // 동명이인 구분 괄호는 정답에서 뺀다 (예: '이종호 (축구 선수)' → '이종호')
  const wikidataName = p.ko.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const fix = NAME_FIX[p.id];
  const answer = fix?.answer ?? wikidataName;
  if (heightCm < 150 || heightCm > 210 || !p.birth) return null;

  return {
    answer,
    en: p.en && stripDiacritics(p.en),
    // 보정한 경우 위키데이터 이름도 별칭으로 남긴다
    koAliases: [...(fix?.aliases ?? []), ...(fix ? [wikidataName] : []), ...(p.aliases ?? [])],
    meta: {
      category: '축구선수',
      hints: [
        { label: '국적', value: countries.join(' / ') },
        { label: '출생 연도', value: `${p.birth}년` },
        { label: '포지션', value: positions.join(' / ') },
        { label: '소속팀', value: clubs[0] },
        { label: '신장', value: `${heightCm}cm` },
        ...(clubs.length > 1 ? [{ label: '다른 소속팀', value: clubs.slice(1).join(', ') }] : []),
      ],
      source: 'wikidata',
      wikidata: p.id,
    },
  };
}

const lastToken = (name) => name.trim().split(/\s+/).at(-1);

/** 라틴 문자의 발음 기호를 뗀다 (Çalhanoğlu → Calhanoglu). 한글은 건드리지 않는다 — answer.ts 와 같은 규칙 */
const LATIN_SPECIAL = {
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
const stripDiacritics = (s) =>
  s.replace(
    /[\u00c0-\u024f\u1e00-\u1eff]/g,
    (ch) => LATIN_SPECIAL[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );
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
const countriesOf = (q) => q.meta.hints.find((h) => h.label === '국적').value.split(' / ');
const isKorean = ({ q }) => countriesOf(q).includes(KOREA);

// 한국 선수 몫을 먼저 채우고, 나머지는 나라별 상한을 지키며 유명한 순으로
const picked = new Set(pool.filter(isKorean).slice(0, KOREA_TARGET));
const perCountry = new Map();
for (const item of pool) {
  if (picked.size >= TARGET) break;
  if (picked.has(item) || isKorean(item)) continue;
  const country = countriesOf(item.q)[0];
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
