import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Response } from 'express'
import { getRequestId } from './request-context'

type ErrorBody = {
  error: {
    code: string
    message: string
    requestId?: string
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR
    const requestId = getRequestId()
    const message = getPublicMessage(exception, status)

    const body: ErrorBody = {
      error: {
        code: statusToCode(status),
        message,
        ...(requestId ? { requestId } : {}),
      },
    }

    if (status >= 500) {
      console.error(
        JSON.stringify({
          event: 'unhandled_http_exception',
          requestId,
          status,
          ...(exception instanceof Error
            ? { errorName: exception.name, stack: exception.stack }
            : {}),
        }),
      )
    }

    response.status(status).json(body)
  }
}

function getPublicMessage(exception: unknown, status: number): string {
  if (status >= 500) return 'An unexpected error occurred'
  if (!(exception instanceof HttpException)) return 'Request failed'

  const body = exception.getResponse()
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body && 'message' in body) {
    const message = body.message
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.join('; ')
  }
  return exception.message
}

function statusToCode(status: number): string {
  const known: Record<number, string> = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    409: 'conflict',
    422: 'unprocessable_entity',
    429: 'rate_limited',
  }
  return known[status] ?? (status >= 500 ? 'internal_error' : 'request_failed')
}

