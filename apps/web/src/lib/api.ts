import { z } from 'zod'

const healthSchema = z.object({
  service: z.literal('api'),
  status: z.literal('ok'),
})

export type ApiHealth = z.infer<typeof healthSchema>

export async function getApiHealth(): Promise<ApiHealth | null> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'

  try {
    const response = await fetch(`${apiUrl}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    })

    if (!response.ok) return null

    return healthSchema.parse(await response.json())
  } catch {
    return null
  }
}

