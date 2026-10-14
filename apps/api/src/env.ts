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
    DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1)
      .optional(),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).optional(),
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_MIGRATION_URL: z.string().min(1).optional(),
    PGDATABASE: z.string().min(1).optional(),
    PGHOST: z.string().min(1).optional(),
    PGPASSWORD: z.string().min(1).optional(),
    PGPORT: z.coerce.number().int().min(1).optional(),
    PGSSLMODE: z
      .enum(['disable', 'require', 'verify-ca', 'verify-full'])
      .optional(),
    PGSSLROOTCERT: z.string().min(1).optional(),
    PGUSER: z.string().min(1).optional(),
    AUTH_MODE: z.enum(['disabled', 'local', 'oidc']).default('disabled'),
    AUTH_LOCAL_TOKEN: z.string().optional(),
    AUTH_LOCAL_SUBJECT: z.string().min(1).default('local-developer'),
    AUTH_LOCAL_EMAIL: z.string().email().optional(),
    AUTH_LOCAL_SCOPES: z.string().default('profile:read'),
    AUTH_LOCAL_PROJECT_ID: z
      .string()
      .uuid()
      .default('00000000-0000-4000-8000-000000000002'),
    AUTH_LOCAL_PROJECT_NAME: z.string().min(1).default('Local project'),
    AUTH_LOCAL_ORGANIZATION_ID: z
      .string()
      .uuid()
      .default('00000000-0000-4000-8000-000000000001'),
    AUTH_LOCAL_ORGANIZATION_NAME: z
      .string()
      .min(1)
      .default('Local organization'),
    AUTH_LOCAL_ORGANIZATION_SLUG: z.string().min(1).default('local-org'),
    AUTH_ISSUER: z.string().url().optional(),
    AUTH_AUDIENCE: z.string().min(1).optional(),
    AUTH_CLIENT_ID: z.string().min(1).optional(),
    AUTH_JWKS_URI: z.string().url().optional(),
    BILLING_PROVIDER: z
      .enum(['disabled', 'local', 'stripe'])
      .default('disabled'),
    LOCAL_BILLING_WEBHOOK_SECRET: z.string().min(16).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_STARTER_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional(),
    WORKER_SECRET: z.string().min(16).optional(),
  })
  .superRefine((value, context) => {
    const oidcConfigured = [
      value.AUTH_ISSUER,
      value.AUTH_JWKS_URI,
      value.AUTH_AUDIENCE,
      value.AUTH_CLIENT_ID,
    ].some(Boolean)
    if (value.AUTH_MODE !== 'oidc' && oidcConfigured) {
      context.addIssue({
        code: 'custom',
        message: 'OIDC variables require AUTH_MODE=oidc.',
        path: ['AUTH_MODE'],
      })
    }

    if (value.NODE_ENV === 'production' && value.AUTH_MODE === 'local') {
      context.addIssue({
        code: 'custom',
        message:
          'AUTH_MODE=local is forbidden in production. Use AUTH_MODE=oidc.',
        path: ['AUTH_MODE'],
      })
    }

    if (
      value.NODE_ENV === 'production' &&
      !value.DATABASE_URL &&
      !(value.PGHOST && value.PGUSER && value.PGPASSWORD && value.PGDATABASE)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'DATABASE_URL or complete PGHOST/PGUSER/PGPASSWORD/PGDATABASE configuration is required in production.',
        path: ['DATABASE_URL'],
      })
    }

    if (value.NODE_ENV === 'production' && value.BILLING_PROVIDER === 'local') {
      context.addIssue({
        code: 'custom',
        message:
          'BILLING_PROVIDER=local is forbidden in production. Use disabled or stripe.',
        path: ['BILLING_PROVIDER'],
      })
    }

    if (value.BILLING_PROVIDER === 'stripe') {
      for (const key of [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_STARTER_MONTHLY',
        'STRIPE_PRICE_PRO_MONTHLY',
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when BILLING_PROVIDER=stripe.`,
            path: [key],
          })
        }
      }
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
      if (value.NODE_ENV === 'production') {
        for (const key of ['AUTH_ISSUER', 'AUTH_JWKS_URI'] as const) {
          if (value[key] && new URL(value[key]).protocol !== 'https:') {
            context.addIssue({
              code: 'custom',
              message: `${key} must use HTTPS in production.`,
              path: [key],
            })
          }
        }
      }
    }
  })

export type Environment = z.infer<typeof envSchema>

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return envSchema.parse(config)
}
