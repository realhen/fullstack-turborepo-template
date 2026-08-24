import { cookies } from 'next/headers'
import { authCookieOptions, deleteAuthCookieOptions } from './cookies'
import { getWebAuthConfig, type WebAuthConfig } from './config'
import type {
  AuthenticationProvider,
  AuthenticatedUser,
  ProviderSession,
} from './provider'
import { WorkosAuthenticationProvider } from './workos-provider'
export type SessionAuthentication =
  | {
      authenticated: true
      user: AuthenticatedUser
      accessToken: string
      replacementCookie?: string
    }
  | { authenticated: false; clearCookie: boolean; retryable?: true }
export type SessionInput = {
  sealedSession?: string
  config: WebAuthConfig
  provider?: AuthenticationProvider
}
export function getAuthenticationProvider(
  config = getWebAuthConfig(),
): AuthenticationProvider | undefined {
  return config.mode === 'workos'
    ? new WorkosAuthenticationProvider(config)
    : undefined
}
function retryableSessionError(error: unknown) {
  if (error instanceof TypeError) return true
  if (error instanceof Error && error.cause instanceof TypeError) return true
  if (!(error instanceof Error) || !('code' in error)) return false
  const code = error.code
  if (code === 'ERR_JWKS_TIMEOUT') return true
  return (
    code === 'ERR_JOSE_GENERIC' &&
    /JSON Web Key Set HTTP response/.test(error.message)
  )
}
export async function authenticateWebSession(
  input: SessionInput,
): Promise<SessionAuthentication> {
  if (input.config.mode === 'local')
    return { authenticated: false, clearCookie: false }
  if (!input.sealedSession) return { authenticated: false, clearCookie: false }
  let loaded: ProviderSession
  try {
    loaded = await (input.provider ??
      getAuthenticationProvider(input.config))!.loadSession(input.sealedSession)
  } catch {
    // No provider session can be formed from this cookie, so it is terminal.
    return { authenticated: false, clearCookie: true }
  }
  let current: Awaited<ReturnType<ProviderSession['authenticate']>>
  try {
    current = await loaded.authenticate()
  } catch (error) {
    return retryableSessionError(error)
      ? { authenticated: false, clearCookie: false, retryable: true }
      : { authenticated: false, clearCookie: true }
  }
  if (current.authenticated && current.user && current.accessToken)
    return {
      authenticated: true,
      user: current.user,
      accessToken: current.accessToken,
    }
  try {
    const refreshed = await loaded.refresh()
    if (refreshed.authenticated)
      return {
        authenticated: true,
        user: refreshed.user,
        accessToken: refreshed.accessToken,
        replacementCookie: refreshed.sealedSession,
      }
    return refreshed.retryable
      ? { authenticated: false, clearCookie: false, retryable: true }
      : { authenticated: false, clearCookie: true }
  } catch (error) {
    return retryableSessionError(error)
      ? { authenticated: false, clearCookie: false, retryable: true }
      : { authenticated: false, clearCookie: true }
  }
}
export async function currentApiAuthorization(): Promise<string | undefined> {
  const config = getWebAuthConfig()
  if (config.mode === 'local') return process.env.API_AUTH_TOKEN
  const sealedSession = (await cookies()).get(config.sessionCookieName)?.value
  const result = await authenticateWebSession({
    config,
    ...(sealedSession ? { sealedSession } : {}),
  })
  return result.authenticated ? `Bearer ${result.accessToken}` : undefined
}
export async function writeSessionCookie(value: string) {
  const config = getWebAuthConfig()
  ;(await cookies()).set(
    config.sessionCookieName,
    value,
    authCookieOptions('session', process.env.NODE_ENV === 'production'),
  )
}
export async function clearSessionCookie() {
  const config = getWebAuthConfig()
  ;(await cookies()).set(
    config.sessionCookieName,
    '',
    deleteAuthCookieOptions(process.env.NODE_ENV === 'production'),
  )
}
