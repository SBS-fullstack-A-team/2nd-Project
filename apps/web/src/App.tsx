import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QnaPage } from './pages/QnaPage';

// 게임별 라우트는 따로 만들지 않는다. /games/:gameId 하나로 registry 에서 찾아 실행한다.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'games/:gameId', element: <GamePage /> },
      { path: 'qna', element: <QnaPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
