import { isRedirectError } from 'next/dist/client/components/redirect-error'

export type AuthActionState = {
  code?: string
  message?: string
  fields?: Record<string, string>
}
export function actionStateFromError(error: unknown): AuthActionState {
  if (error instanceof Error && /code|challenge/i.test(error.message))
    return {
      code: 'invalid_code',
      message: 'Unable to verify that code. Try again.',
    }
  return {
    code: 'service_unavailable',
    message: 'Authentication is temporarily unavailable. Please try again.',
  }
}

export function actionErrorState(error: unknown): AuthActionState {
  if (isRedirectError(error)) throw error
  return actionStateFromError(error)
}
