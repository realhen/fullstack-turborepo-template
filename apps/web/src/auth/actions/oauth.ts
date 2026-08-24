'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { actionErrorState, type AuthActionState } from '../action-state'
import { authCookieOptions, flowCookieName } from '../cookies'
import { getWebAuthConfig } from '../config'
import { createFlowStateCodec } from '../flow-state'
import { createOAuthFlow, socialProvider } from '../oauth-service'
import { currentAuthRequestContext } from '../request-context'
import { safeReturnPath } from '../return-path'
import { getAuthenticationProvider } from '../session'

const oauthStart = z.object({
  provider: z.string().min(1),
  returnTo: z.string().optional(),
  signalsId: z.string().min(1).optional(),
})

export async function beginSocialOAuthAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const parsed = oauthStart.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { code: 'validation_error', message: 'Choose a sign-in provider.' }
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect(safeReturnPath(parsed.data.returnTo))
  let destination: string
  try {
    const selected = socialProvider(
      parsed.data.provider,
      config.socialProviders,
    )
    const flow = createFlowStateCodec(config.cookiePassword)
    const created = await createOAuthFlow({
      flow,
      ...(parsed.data.returnTo ? { returnTo: parsed.data.returnTo } : {}),
      ...(parsed.data.signalsId ? { signalsId: parsed.data.signalsId } : {}),
    })
    destination = await getAuthenticationProvider(config)!.authorizationUrl({
      ...(await currentAuthRequestContext()),
      provider: selected,
      codeVerifier: created.codeVerifier,
      state: created.state,
    })
    ;(await cookies()).set(
      flowCookieName(config),
      created.value,
      authCookieOptions('flow', process.env.NODE_ENV === 'production'),
    )
  } catch (error) {
    return actionErrorState(error)
  }
  redirect(destination)
}

export async function beginEnterpriseSsoAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const parsed = z
    .object({
      email: z.string().email(),
      returnTo: z.string().optional(),
      signalsId: z.string().min(1).optional(),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { code: 'validation_error', message: 'Enter a valid work email.' }
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect(safeReturnPath(parsed.data.returnTo))
  let destination: string
  try {
    const provider = getAuthenticationProvider(config)!
    const connection = await provider.resolveSsoConnection(parsed.data.email)
    if (!connection)
      return {
        code: 'invalid_credentials',
        message: 'Unable to continue with single sign-on.',
      }
    const flow = createFlowStateCodec(config.cookiePassword)
    const created = await createOAuthFlow({
      flow,
      ...(parsed.data.returnTo ? { returnTo: parsed.data.returnTo } : {}),
      ...(parsed.data.signalsId ? { signalsId: parsed.data.signalsId } : {}),
    })
    destination = await provider.authorizationUrl({
      ...(await currentAuthRequestContext()),
      connectionId: connection.connectionId,
      codeVerifier: created.codeVerifier,
      state: created.state,
    })
    ;(await cookies()).set(
      flowCookieName(config),
      created.value,
      authCookieOptions('flow', process.env.NODE_ENV === 'production'),
    )
  } catch (error) {
    return actionErrorState(error)
  }
  redirect(destination)
}
