import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    // Everything is an ES module running in the browser
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Vitest with globals: true
    files: ['**/*.test.js', '**/*.test.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly', it: 'readonly', expect: 'readonly',
        vi: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
      },
    },
  },
  {
    // Node context for build config
    files: ['vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
];
