import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export const baseConfig = tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/.turbo/**',
      '**/cdk.out/**',
      '**/coverage/**',
      '**/dist/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
)

