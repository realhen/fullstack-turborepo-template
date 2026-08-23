import { unwrap, type ApiHealth } from '@repo/api-client'
import { createServerApiClient } from '@repo/api-client/server'

export type { ApiHealth }

export async function getApiHealth(): Promise<ApiHealth | null> {
  try {
    const result = await createServerApiClient().GET('/api/v1/health', {
      fetchOptions: {
        cache: 'no-store',
        signal: AbortSignal.timeout(2_000),
      },
    })
    return unwrap(result)
  } catch {
    return null
  }
}
