import { cookies } from 'next/headers'
import { getWebAuthConfig, type WebAuthConfig } from './config'
import type { AuthenticationProvider } from './provider'
import {
  authenticateWebSession,
  clearSessionCookie,
  writeSessionCookie,
} from './session'

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
  const result = await authenticateWebSession({
    config,
    ...(sealedSession ? { sealedSession } : {}),
    ...(input.provider
      ? { provider: input.provider as AuthenticationProvider }
      : {}),
  })

  if (!result.authenticated) {
    if (result.clearCookie && input.sealedSession === undefined)
      await clearSessionCookie()
    return null
  }

  if (result.replacementCookie && input.sealedSession === undefined)
    await writeSessionCookie(result.replacementCookie)

  const firstName = result.user.firstName?.trim()
  const lastName = result.user.lastName?.trim()
  const name =
    [firstName, lastName].filter(Boolean).join(' ') || result.user.email
  return { email: result.user.email, name }
}
