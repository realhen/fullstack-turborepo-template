import { createApiClient } from './index.js'

/** Browser client. API origin is intentionally opt-in to avoid leaking internal URLs. */
export function createBrowserApiClient(baseUrl = process.env.NEXT_PUBLIC_API_URL) {
  if (!baseUrl) throw new Error('NEXT_PUBLIC_API_URL is required for browser API calls')
  return createApiClient({ baseUrl })
}
