import { cookies } from 'next/headers'
import { getWebAuthConfig, type WebAuthConfig } from './config'
import type { AuthenticationProvider } from './provider'
import { getAuthenticationProvider } from './session'

export type CurrentUserDisplay = {
  email: string
  name: string
}

export type CurrentUserInput = {
  config?: WebAuthConfig
  provider?: Pick<AuthenticationProvider, 'loadSession'>
  sealedSession?: string
}

export async function getCurrentUser(
  input: CurrentUserInput = {},
): Promise<CurrentUserDisplay | null> {
  const config = input.config ?? getWebAuthConfig()
  if (config.mode === 'local') return null

  const sealedSession =
    input.sealedSession ??
    (await cookies()).get(config.sessionCookieName)?.value
  if (!sealedSession) return null
  let user
  try {
    const session = await (input.provider ??
      getAuthenticationProvider(config))!.loadSession(sealedSession)
    const authenticated = await session.authenticate()
    if (!authenticated.authenticated || !authenticated.user) return null
    user = authenticated.user
  } catch {
    return null
  }

  const firstName = user.firstName?.trim()
  const lastName = user.lastName?.trim()
  const name = [firstName, lastName].filter(Boolean).join(' ') || user.email
  return { email: user.email, name }
}
