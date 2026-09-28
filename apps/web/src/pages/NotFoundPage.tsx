import { Link } from 'react-router';

export function NotFoundPage({ message = '페이지를 찾을 수 없어요.' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 0' }}>
      <p style={{ fontSize: '3rem', margin: 0 }}>👾</p>
      <h1>{message}</h1>
      <Link to="/" className="btn btn-primary">
        메인으로
      </Link>
    </div>
  );
}
