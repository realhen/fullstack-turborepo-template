import { createApiClient } from './index.js'

/** Server-only client factory for Server Components and Route Handlers. */
export function createServerApiClient(baseUrl = process.env.API_URL) {
  return createApiClient({ baseUrl: baseUrl ?? 'http://localhost:3001' })
}
