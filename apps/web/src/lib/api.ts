import { createServerApiClient, unwrap, type ApiHealth } from '@repo/api-client'

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
