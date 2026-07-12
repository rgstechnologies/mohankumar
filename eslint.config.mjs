import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';

/**
 * One lint config for the whole monorepo.
 *
 * Deliberately not type-aware (no `projectService`): type-aware linting doubles
 * CI time, and `tsc --noEmit` already runs on every PR, so the type errors are
 * caught anyway. This config exists to catch the things the compiler will not —
 * unused code, floating state, bad hook usage.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/prisma/migrations/**',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Unused code is how a stripped-down codebase quietly grows dead weight
      // again. Allow a leading underscore for deliberately-ignored bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `any` defeats the point of the money types. Warn, don't block.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  // ---- Web (React) ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      // App Router only — this rule looks for a legacy pages/ directory.
      '@next/next/no-html-link-for-pages': 'off',
      'react-hooks/rules-of-hooks': 'error',
      // A stale dependency array is the classic "why is my total wrong" bug.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ---- Tests + scripts ----
  {
    files: ['**/*.spec.ts', '**/test/**', '**/prisma/seed.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
