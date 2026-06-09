// @ts-check
import js from '@eslint/js';
import n from 'eslint-plugin-n';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'functions/**'],
  },

  // Backend: Node.js ESM
  {
    files: ['backend/**/*.mjs', 'database/**/*.mjs', 'shared/**/*.mjs'],
    plugins: { n },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals['shared-node-browser'],
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-process-exit': 'off',
    },
  },

  // Frontend: Browser ESM
  {
    files: ['frontend/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // Prettier must be last — disables conflicting formatting rules
  prettierConfig,
];
