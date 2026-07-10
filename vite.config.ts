import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

// Every page is a Vite module entry — the migration is complete; nothing is
// served as a classic script anymore.
export default mergeConfig(
  defineConfig({
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
        include: ['shared/**/*.js', 'shared/**/*.ts', 'apps/**/*.js'],
        exclude: ['**/*.test.js', '**/*.test.ts', 'shared/types.ts'],
      },
    },
  })
);
