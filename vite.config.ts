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
        // Cover the shipped browser scripts that tests now import directly,
        // not a parallel TS copy. See utils/logger.js for the export shim.
        include: ['services/**/*.js', 'utils/**/*.js', 'lib/**/*.js'],
        exclude: ['**/*.test.js', '**/*.test.ts'],
      },
    },
  })
);
