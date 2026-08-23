import { z } from 'zod'

const envSchema = z
  .object({
    CORS_ORIGIN: z.string().url().optional(),
    ENABLE_SWAGGER: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    AUTH_MODE: z.enum(['disabled', 'local', 'oidc']).default('disabled'),
    AUTH_LOCAL_TOKEN: z.string().optional(),
    AUTH_LOCAL_SUBJECT: z.string().min(1).default('local-developer'),
    AUTH_LOCAL_EMAIL: z.string().email().optional(),
    AUTH_LOCAL_SCOPES: z.string().default('profile:read'),
    AUTH_LOCAL_PROJECT_ID: z.string().min(1).default('local-project'),
    AUTH_LOCAL_PROJECT_NAME: z.string().min(1).default('Local project'),
    AUTH_ISSUER: z.string().url().optional(),
    AUTH_AUDIENCE: z.string().min(1).optional(),
    AUTH_CLIENT_ID: z.string().min(1).optional(),
    AUTH_JWKS_URI: z.string().url().optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.AUTH_MODE === 'local') {
      context.addIssue({
        code: 'custom',
        message:
          'AUTH_MODE=local is forbidden in production. Use AUTH_MODE=oidc.',
        path: ['AUTH_MODE'],
      })
    }

    if (
      value.AUTH_MODE === 'local' &&
      (!value.AUTH_LOCAL_TOKEN || value.AUTH_LOCAL_TOKEN.length < 32)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'AUTH_LOCAL_TOKEN must be at least 32 characters when AUTH_MODE=local.',
        path: ['AUTH_LOCAL_TOKEN'],
      })
    }

    if (value.AUTH_MODE === 'oidc') {
      for (const key of ['AUTH_ISSUER', 'AUTH_JWKS_URI'] as const) {
        if (!value[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when AUTH_MODE=oidc.`,
            path: [key],
          })
        }
      }
      if (!value.AUTH_AUDIENCE && !value.AUTH_CLIENT_ID) {
        context.addIssue({
          code: 'custom',
          message:
            'AUTH_AUDIENCE or AUTH_CLIENT_ID is required when AUTH_MODE=oidc.',
          path: ['AUTH_AUDIENCE'],
        })
      }
    }
  })

export type Environment = z.infer<typeof envSchema>

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return envSchema.parse(config)
}
