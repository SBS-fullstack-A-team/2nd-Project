import { Link, Outlet } from 'react-router';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          🕹️ 심심오락실
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>© simsim-arcade</footer>
    </div>
  );
}
