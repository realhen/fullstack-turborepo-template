'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { flowCookieName, sessionCookieName } from '../cookies'
import { getWebAuthConfig } from '../config'
import { logoutCookieOptions, logoutDestination } from '../logout-service'

export async function logoutAction(formData: FormData): Promise<void> {
  const config = getWebAuthConfig()
  const cookieStore = await cookies()
  const sealedSession =
    config.mode === 'workos'
      ? cookieStore.get(sessionCookieName(config))?.value
      : undefined
  const returnTo = formData.get('returnTo')
  const destination = await logoutDestination({
    config,
    ...(config.mode === 'workos'
      ? {
          ...(sealedSession ? { sealedSession } : {}),
          ...(typeof returnTo === 'string' ? { returnTo } : {}),
        }
      : {}),
  })
  const options = logoutCookieOptions(process.env.NODE_ENV === 'production')
  cookieStore.set(sessionCookieName(config), '', options.session)
  if (config.mode === 'workos')
    cookieStore.set(flowCookieName(config), '', options.flow)
  redirect(destination)
}
