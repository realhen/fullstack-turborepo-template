import { cookies } from 'next/headers'
import { authCookieOptions, deleteAuthCookieOptions } from './cookies'
import { getWebAuthConfig, type WebAuthConfig } from './config'
import type { AuthenticationProvider, AuthenticatedUser } from './provider'
import { WorkosAuthenticationProvider } from './workos-provider'
export type SessionAuthentication =
  | {
      authenticated: true
      user: AuthenticatedUser
      accessToken: string
      replacementCookie?: string
    }
  | { authenticated: false; clearCookie: boolean }
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
export async function authenticateWebSession(
  input: SessionInput,
): Promise<SessionAuthentication> {
  if (input.config.mode === 'local')
    return { authenticated: false, clearCookie: false }
  if (!input.sealedSession) return { authenticated: false, clearCookie: false }
  try {
    const loaded = await (input.provider ??
      getAuthenticationProvider(input.config))!.loadSession(input.sealedSession)
    const current = await loaded.authenticate()
    if (current.authenticated && current.user && current.accessToken)
      return {
        authenticated: true,
        user: current.user,
        accessToken: current.accessToken,
      }
    const refreshed = await loaded.refresh()
    return refreshed.authenticated && refreshed.user && refreshed.accessToken
      ? {
          authenticated: true,
          user: refreshed.user,
          accessToken: refreshed.accessToken,
          ...(refreshed.sealedSession
            ? { replacementCookie: refreshed.sealedSession }
            : {}),
        }
      : { authenticated: false, clearCookie: true }
  } catch {
    return { authenticated: false, clearCookie: true }
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
