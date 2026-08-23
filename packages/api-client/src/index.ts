import createClient, { type Client, type ClientOptions } from 'openapi-fetch'
import type { paths } from './generated/schema.js'

export type ApiClient = Client<paths>

type JsonResponse<Operation, Status extends number> = Operation extends {
  responses: infer Responses
}
  ? Responses extends Record<Status, infer Response>
    ? Response extends { content: { 'application/json': infer Body } }
      ? Body
      : never
    : never
  : never

/** Derive response types from generated paths instead of unstable schema names. */
export type ApiGetResponse<
  Path extends keyof paths,
  Status extends number = 200,
> = paths[Path] extends { get?: infer Operation }
  ? JsonResponse<Operation, Status>
  : never

export type ApiHealth = ApiGetResponse<'/api/v1/health'>
export type ApiPrincipal = ApiGetResponse<'/api/v1/me'>
export type ApiProjectMembership =
  ApiGetResponse<'/api/v1/projects/{projectId}'>

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiClientError'
  }
}

export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createClient<paths>(options)
}

export function unwrap<T>(result: {
  data?: T
  error?: unknown
  response: Response
}): T {
  if (result.data !== undefined) return result.data
  throw new ApiClientError(result.response.status, result.error)
}
