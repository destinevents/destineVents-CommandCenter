import { defineConfig } from 'vite';
import { mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({}),
  defineVitestConfig({
    test: {
      globals: true,
      environment: 'node',
      coverage: {
        provider: 'v8',
        include: ['services/**/*.ts', 'utils/**/*.ts', 'config/**/*.ts'],
        exclude: ['**/*.test.ts'],
      },
    },
  })
);
