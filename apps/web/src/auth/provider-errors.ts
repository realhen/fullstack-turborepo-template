export type PublicAuthError = {
  code: 'invalid_credentials' | 'validation_error' | 'service_unavailable'
  message: string
  fields?: Record<string, string>
  cause?: string
}
export function publicAuthError(error: unknown): PublicAuthError {
  if (
    error instanceof Error &&
    /invalid|password|not found/i.test(error.message)
  )
    return {
      code: 'invalid_credentials',
      message: 'Unable to sign in with those credentials.',
    }
  if (error instanceof Error && /validation/i.test(error.message))
    return {
      code: 'validation_error',
      message: 'Please correct the highlighted fields.',
    }
  return {
    code: 'service_unavailable',
    message: 'Authentication is temporarily unavailable. Please try again.',
    cause: error instanceof Error ? error.name : 'unknown',
  }
}
