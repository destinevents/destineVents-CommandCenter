import { resolve } from 'node:path';
import { cpSync, existsSync } from 'node:fs';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

// ── Migration phase 1 ────────────────────────────────────────────────────────
// Only the auth pages (login/signup/reset) are real Vite module entries so far.
// index.html and intern.html still load classic <script src> files, which Vite
// intentionally leaves untouched — so this plugin copies those trees into dist
// verbatim. As each directory converts to modules (services → icc → hq), it
// disappears from this list.
const CLASSIC_TREES = ['apps', 'shared', 'config', 'assets'];

function copyClassicTrees(): Plugin {
  return {
    name: 'copy-classic-trees',
    apply: 'build',
    closeBundle() {
      for (const dir of CLASSIC_TREES) {
        if (existsSync(dir)) cpSync(dir, `dist/${dir}`, { recursive: true });
      }
    },
  };
}

export default mergeConfig(
  defineConfig({
    plugins: [copyClassicTrees()],
    build: {
      rollupOptions: {
        input: {
          hq: resolve(__dirname, 'index.html'),
          icc: resolve(__dirname, 'intern.html'),
          login: resolve(__dirname, 'login.html'),
          signup: resolve(__dirname, 'signup.html'),
          reset: resolve(__dirname, 'reset-password.html'),
        },
      },
    },
  }),
  defineVitestConfig({
    test: {
      globals: true,
      environment: 'node',
      exclude: ['node_modules/**', 'dist/**'],
      coverage: {
        provider: 'v8',
        // Cover the shipped browser scripts that tests now import directly,
        // not a parallel TS copy. See shared/utils/logger.js for the export shim.
        include: ['shared/services/**/*.js', 'shared/utils/**/*.js', 'shared/business/**/*.js'],
        exclude: ['**/*.test.js', '**/*.test.ts'],
      },
    },
  })
);
