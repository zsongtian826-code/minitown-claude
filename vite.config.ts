/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages は https://<user>.github.io/minitown-claude/ に置かれる。
// Actions 上(GITHUB_ACTIONS)でだけ base をリポジトリ名にする。
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/minitown-claude/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
