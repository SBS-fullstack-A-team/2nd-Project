import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 로컬 개발: /api 요청을 wrangler dev(API 서버)로 전달한다.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
