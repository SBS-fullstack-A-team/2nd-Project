import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QnaPage } from './pages/QnaPage';
import { ToolPage } from './pages/ToolPage';

// 게임·방송 도구별 라우트는 따로 만들지 않는다. /games/:gameId, /tools/:toolId 하나씩으로 registry 에서 찾아 실행한다.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'games/:gameId', element: <GamePage /> },
      { path: 'tools/:toolId', element: <ToolPage /> },
      { path: 'qna', element: <QnaPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
