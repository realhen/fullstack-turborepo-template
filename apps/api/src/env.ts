import { z } from 'zod'

const envSchema = z.object({
  CORS_ORIGIN: z.string().url().optional(),
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
