import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, RANKING_DEFAULT_LIMIT } from '@simsim/shared';
import { Window } from '../components/Window';
import { useTheme } from '../lib/theme';
import classicStyles from './QnaPage.classic.module.css';
import xpStyles from './QnaPage.xp.module.css';

const ISSUES_URL = 'https://github.com/SBS-fullstack-A-team/simsim-arcade/issues';

interface QnaItem {
  q: string;
  a: ReactNode;
}

const QNA_ITEMS: QnaItem[] = [
  {
    q: '어떻게 플레이하나요?',
    a: (
      <>
        메인 화면(<Link to="/">게임 목록</Link>)에서 원하는 게임 카드를 누르면 바로 시작돼요.
        게임마다 규칙은 시작 화면에 안내되어 있어요.
      </>
    ),
  },
  {
    q: '로그인이나 회원가입이 필요한가요?',
    a: '필요 없어요. 게임이 끝나면 닉네임만 입력해서 점수를 등록하면 돼요. 마지막으로 쓴 닉네임은 이 브라우저에 기억해 둬요.',
  },
  {
    q: '닉네임 규칙이 있나요?',
    a: `${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자까지 쓸 수 있고, 앞뒤 공백은 자동으로 지워져요. 다른 사람을 불쾌하게 하는 닉네임은 삼가 주세요.`,
  },
  {
    q: '랭킹은 어떻게 정해지나요?',
    a: `게임별로 따로 집계되고, 점수가 높은 순서로 상위 ${RANKING_DEFAULT_LIMIT}명을 보여줘요. 점수가 같으면 먼저 등록한 사람이 앞서요.`,
  },
  {
    q: '등록한 점수를 지우거나 고칠 수 있나요?',
    a: (
      <>
        아직은 직접 지울 수 없어요. 꼭 지워야 하는 기록이 있으면 아래 <strong>문의하기</strong>로
        알려 주세요.
      </>
    ),
  },
  {
    q: '"준비 중" 카드는 뭔가요?',
    a: '팀원들이 각자 한 게임씩 만들고 있는 자리예요. 게임이 완성되면 그 칸에 바로 나타나요.',
  },
  {
    q: '화면 디자인을 바꿀 수 있나요?',
    a: 'XP 테마와 클래식 테마가 있어요. XP 테마에서는 왼쪽 아래 [시작] 메뉴 맨 아래에서, 클래식 테마에서는 오른쪽 위 🎨 버튼으로 바꿀 수 있어요. 고른 테마는 다음 방문에도 유지돼요.',
  },
  {
    q: '버그를 발견했거나 제안하고 싶은 게 있어요.',
    a: (
      <>
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">
          GitHub 이슈
        </a>
        에 남겨 주세요. 어떤 게임에서, 어떤 상황에 문제가 생겼는지 적어 주시면 큰 도움이 돼요.
      </>
    ),
  },
];

/** Q&A · 도움말 페이지 (/qna) */
export function QnaPage() {
  const { theme } = useTheme();
  const styles = theme === 'xp' ? xpStyles : classicStyles;

  const content = (
    <>
      <p className={styles.intro}>심심오락실을 이용하면서 자주 묻는 질문을 모았어요.</p>
      <div className={styles.list}>
        {QNA_ITEMS.map((item) => (
          <details key={item.q} className={styles.item}>
            <summary className={styles.question}>
              <span className={styles.mark} aria-hidden="true">
                Q
              </span>
              {item.q}
            </summary>
            <div className={styles.answer}>{item.a}</div>
          </details>
        ))}
      </div>
      <p className={styles.contact}>
        찾는 답이 없나요?{' '}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">
          문의하기 (GitHub 이슈)
        </a>
      </p>
    </>
  );

  if (theme === 'classic') {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Q&amp;A</h1>
        {content}
      </div>
    );
  }

  return (
    <Window title="Q&A · 도움말" icon="❓" bodyClassName={xpStyles.body}>
      <h1 className={xpStyles.title}>무엇을 도와 드릴까요?</h1>
      {content}
    </Window>
  );
}
