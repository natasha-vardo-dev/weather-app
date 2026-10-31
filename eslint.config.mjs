// One flat config for the whole monorepo: the packages share TypeScript
// settings, and React rules apply only to the client.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', '**/coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Unused arguments are fine when prefixed with `_` (interface implementations, fakes).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    files: ['server/**/*.ts', '**/*.config.ts', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['client/src/**/*.{ts,tsx}', 'client/tests/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The plugin's recommended set: the rules of hooks, and the rules that keep components
      // pure functions of props and state (no setState in effects that only follow other
      // values, no refs or Date.now() read during render), which the React Compiler relies on.
      // Turned on with React 19; the compiler itself is not used yet.
      ...reactHooks.configs['recommended-latest'].rules,
      // A missing dependency is a bug more often than not, so it fails the build (the preset
      // only warns). Intentional omissions are marked inline with a reason.
      'react-hooks/exhaustive-deps': 'error',
      // Warnings in the preset: errors here, so CI does not let them through unseen.
      'react-hooks/incompatible-library': 'error',
      'react-hooks/unsupported-syntax': 'error',
    },
  },

  {
    // The push service worker is plain JS loaded with importScripts.
    files: ['client/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },
);
