import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const unusedVariablesRule = [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^(_|CandidateSelection$)',
    caughtErrorsIgnorePattern: '^_',
    destructuredArrayIgnorePattern: '^_',
  },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'docs/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': unusedVariablesRule,
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
);
