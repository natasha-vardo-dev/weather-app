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
      'react-hooks/rules-of-hooks': 'error',
      // A missing dependency is a bug more often than not, so it fails the build.
      // Intentional omissions are marked inline with a reason.
      'react-hooks/exhaustive-deps': 'error',
      // The plugin's other recommended rules (set-state-in-effect, refs, purity…) check code
      // for the React Compiler, which needs React 19. On React 18 the patterns they flag
      // (resetting state when a key changes, remembering the previous value in a ref) are the
      // documented ones; they are left off until the move to React 19 and the compiler.
    },
  },

  {
    // The push service worker is plain JS loaded with importScripts.
    files: ['client/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },
);
