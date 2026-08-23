import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export type RequestContext = {
  requestId: string
}

const requestContext = new AsyncLocalStorage<RequestContext>()

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint()
  const suppliedRequestId = request.header('x-request-id')
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID()

  response.setHeader('x-request-id', requestId)
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    console.log(
      JSON.stringify({
        durationMs: Math.round(durationMs * 100) / 100,
        event: 'http_request_completed',
        method: request.method,
        path: request.path,
        requestId,
        service: 'api',
        statusCode: response.statusCode,
        timestamp: new Date().toISOString(),
      }),
    )
  })
  requestContext.run({ requestId }, next)
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId
}
