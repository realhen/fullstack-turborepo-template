import { z } from 'zod'

const envSchema = z.object({
  CORS_ORIGIN: z.string().url().optional(),
  ENABLE_SWAGGER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
})

export type Environment = z.infer<typeof envSchema>

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return envSchema.parse(config)
}
