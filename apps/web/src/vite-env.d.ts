/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소. 비우면 같은 출처(/api)로 요청한다 (로컬은 Vite 프록시 사용). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
