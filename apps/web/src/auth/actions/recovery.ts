'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  authCookieOptions,
  deleteAuthCookieOptions,
  flowCookieName,
} from '../cookies'
import { getWebAuthConfig } from '../config'
import { createFlowStateCodec } from '../flow-state'
import {
  completeMagicAuth,
  startMagicAuth,
  startRecovery,
} from '../recovery-service'
import { currentAuthRequestContext } from '../request-context'
import { safeReturnPath } from '../return-path'
import { getAuthenticationProvider } from '../session'
import { continueAuthenticationOutcome } from './password'
export async function forgotPasswordAction(formData: FormData) {
  const email = z.string().email().safeParse(formData.get('email'))
  const config = getWebAuthConfig()
  if (config.mode === 'workos' && email.success)
    await startRecovery({
      email: email.data,
      start: (value) =>
        getAuthenticationProvider(config)!.startPasswordReset({ email: value }),
    })
  redirect('/forgot-password?sent=1')
}
export async function captureResetToken(token: string | null) {
  const config = getWebAuthConfig()
  if (config.mode !== 'workos' || !token) redirect('/forgot-password')
  const value = await createFlowStateCodec(config.cookiePassword).seal({
    kind: 'password-reset',
    token,
    expiresAt: Date.now() + 600_000,
  })
  ;(await cookies()).set(
    flowCookieName(config),
    value,
    authCookieOptions('flow', process.env.NODE_ENV === 'production'),
  )
  redirect('/reset-password/new')
}
export async function resetPasswordAction(formData: FormData) {
  const password = z.string().min(8).parse(formData.get('password'))
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect('/sign-in')
  const store = await cookies()
  const value = store.get(flowCookieName(config))?.value
  if (!value) redirect('/forgot-password')
  const flow = await createFlowStateCodec(config.cookiePassword).unseal(
    value,
    'password-reset',
  )
  await getAuthenticationProvider(config)!.resetPassword({
    token: flow.token,
    password,
  })
  store.set(
    flowCookieName(config),
    '',
    deleteAuthCookieOptions(process.env.NODE_ENV === 'production'),
  )
  redirect('/sign-in')
}
export async function startMagicAuthAction(formData: FormData) {
  const parsed = z
    .object({
      email: z.string().email(),
      returnTo: z.string().optional(),
      signalsId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData))
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect('/app')
  if (!parsed.success) redirect('/magic-auth?error=validation_error')
  const flow = await startMagicAuth({
    email: parsed.data.email,
    returnTo: safeReturnPath(parsed.data.returnTo),
    flow: createFlowStateCodec(config.cookiePassword),
    start: async (email) =>
      getAuthenticationProvider(config)!.sendMagicAuthCode({
        email,
        ...(await currentAuthRequestContext()),
        ...(parsed.data.signalsId ? { signalsId: parsed.data.signalsId } : {}),
      }),
  })
  ;(await cookies()).set(
    flowCookieName(config),
    flow,
    authCookieOptions('flow', process.env.NODE_ENV === 'production'),
  )
  redirect('/magic-auth?code=1')
}

export async function completeMagicAuthAction(formData: FormData) {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success) redirect('/magic-auth?code=1&error=validation_error')
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect('/app')
  const value = (await cookies()).get(flowCookieName(config))?.value
  if (!value) redirect('/magic-auth?error=flow_expired')
  const codec = createFlowStateCodec(config.cookiePassword)
  const result = await completeMagicAuth({
    provider: getAuthenticationProvider(config)!,
    flow: codec,
    flowValue: value,
    code: code.data,
    context: await currentAuthRequestContext(),
    ...(typeof formData.get('signalsId') === 'string'
      ? { signalsId: formData.get('signalsId') as string }
      : {}),
  })
  const flow = await codec.unseal(value, 'magic-auth')
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    returnTo: flow.returnTo,
  })
}
