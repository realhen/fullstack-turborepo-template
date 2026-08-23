import { createApiClient } from './index.js'

/** Server-only client factory for Server Components and Route Handlers. */
export function createServerApiClient(
  baseUrl = process.env.API_URL,
  requestFetch: typeof globalThis.fetch = globalThis.fetch,
) {
  return createApiClient({
    baseUrl: baseUrl ?? 'http://localhost:3001',
    fetch: requestFetch,
  })
}
