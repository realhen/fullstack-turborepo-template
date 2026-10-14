import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import type { WebAuthConfig } from './config'
export const FLOW_MAX_AGE_SECONDS = 600
export function authCookieOptions(
  kind: 'session' | 'flow',
  production: boolean,
): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    maxAge: kind === 'flow' ? FLOW_MAX_AGE_SECONDS : undefined,
    path: '/',
    sameSite: 'lax',
    secure: production,
  }
}
export function deleteAuthCookieOptions(
  production: boolean,
): Partial<ResponseCookie> {
  return { ...authCookieOptions('session', production), maxAge: 0 }
}
export function sessionCookieName(config: WebAuthConfig) {
  return config.sessionCookieName
}
export function flowCookieName(
  config: Extract<WebAuthConfig, { mode: 'workos' }>,
) {
  return config.flowCookieName
}
