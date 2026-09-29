import { Link } from 'react-router';
import { Window } from '../components/Window';
import { useTheme } from '../lib/theme';

export function NotFoundPage({ message = '페이지를 찾을 수 없어요.' }: { message?: string }) {
  const { theme } = useTheme();

  const content = (
    <div style={{ textAlign: 'center', padding: '64px 0' }}>
      <p style={{ fontSize: '3rem', margin: 0 }}>👾</p>
      <h1>{message}</h1>
      <Link to="/" className="btn btn-primary">
        메인으로
      </Link>
    </div>
  );

  if (theme === 'classic') return content;

  return (
    <Window title="오류" icon="⚠️">
      {content}
    </Window>
  );
}
