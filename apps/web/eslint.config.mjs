import { nextConfig } from '@repo/eslint-config/next'

export default [
  ...nextConfig,
  {
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Use @repo/api-client instead of calling backend fetch directly.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Use @repo/api-client instead of axios for backend requests.',
            },
          ],
          patterns: [
            {
              group: ['axios/*'],
              message: 'Use @repo/api-client instead of axios for backend requests.',
            },
          ],
        },
      ],
    },
  },
]
