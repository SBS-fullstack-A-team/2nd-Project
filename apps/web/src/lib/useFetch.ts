import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from './api';

export type FetchState<T> =
  { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: T };

/**
 * 간단한 데이터 조회 훅. key 가 바뀌면 다시 불러온다.
 * (다시 불러오기가 필요하면 key 에 refresh 값을 섞어서 넘긴다)
 */
export function useFetch<T>(key: string, fetcher: () => Promise<T>): FetchState<T> {
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [result, setResult] = useState<{ key: string; state: FetchState<T> } | null>(null);

  useEffect(() => {
    let ignore = false;
    fetcherRef
      .current()
      .then((data) => {
        if (!ignore) setResult({ key, state: { status: 'success', data } });
      })
      .catch((err: unknown) => {
        if (!ignore) setResult({ key, state: { status: 'error', error: getErrorMessage(err) } });
      });
    return () => {
      ignore = true;
    };
  }, [key]);

  // 이전 key 의 결과는 보여주지 않는다
  return result?.key === key ? result.state : { status: 'loading' };
}
