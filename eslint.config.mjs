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
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
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
    // Node context for build config and Vercel serverless functions
    files: ['vite.config.ts', 'api/**/*.ts', 'api/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // ICC files use @ts-nocheck pending full type migration
    files: ['apps/icc/**/*.ts'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off' },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
];
