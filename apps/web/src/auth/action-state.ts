export type AuthActionState = {
  code?: string
  message?: string
  fields?: Record<string, string>
}
export function actionStateFromError(error: unknown): AuthActionState {
  if (
    error instanceof Error &&
    /credential|invalid password/i.test(error.message)
  )
    return {
      code: 'invalid_credentials',
      message: 'Unable to sign in with those credentials.',
    }
  if (error instanceof Error && /blocked/i.test(error.message))
    return {
      code: 'authentication_blocked',
      message: 'This sign-in cannot continue.',
    }
  return {
    code: 'service_unavailable',
    message: 'Authentication is temporarily unavailable. Please try again.',
  }
}
