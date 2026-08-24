import { deleteAuthCookieOptions } from './cookies'
import { getAuthenticationProvider } from './session'
import type { WebAuthConfig } from './config'
import type { AuthenticationProvider } from './provider'

export type LogoutDestinationInput = {
  config: WebAuthConfig
  provider?: Pick<AuthenticationProvider, 'loadSession'>
  sealedSession?: string
  returnTo?: string
}

export function safeLogoutReturn(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/'
  if ([...value].some((character) => character.charCodeAt(0) < 32)) return '/'
  if (value.includes('\\')) return '/'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded !== value || decoded.startsWith('//')) return '/'
  } catch {
    return '/'
  }
  return value
}

export function workosLogoutReturnUrl(
  config: Extract<WebAuthConfig, { mode: 'workos' }>,
  value: unknown,
): string {
  const redirectUri = new URL(config.redirectUri)
  if (redirectUri.protocol !== 'https:')
    throw new Error('WorkOS logout requires an HTTPS application origin')
  return new URL(safeLogoutReturn(value), redirectUri.origin).toString()
}

function isSecureProviderUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export async function logoutDestination(
  input: LogoutDestinationInput,
): Promise<string> {
  if (input.config.mode === 'local' || !input.sealedSession) return '/'
  try {
    const session = await (input.provider ??
      getAuthenticationProvider(input.config))!.loadSession(input.sealedSession)
    const destination = await session.logoutUrl(
      workosLogoutReturnUrl(input.config, input.returnTo),
    )
    return isSecureProviderUrl(destination) ? destination : '/'
  } catch {
    return '/'
  }
}

type DeletionOptions = ReturnType<typeof deleteAuthCookieOptions>

export function logoutCookieOptions(production: boolean): {
  session: DeletionOptions
  flow: DeletionOptions
} {
  const options = deleteAuthCookieOptions(production)
  return { flow: { ...options }, session: { ...options } }
}
