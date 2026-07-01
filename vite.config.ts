import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['services/**/*.ts', 'utils/**/*.ts', 'config/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
