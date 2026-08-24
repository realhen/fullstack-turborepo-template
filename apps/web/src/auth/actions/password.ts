'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { AuthActionState } from '../action-state'
import {
  authCookieOptions,
  deleteAuthCookieOptions,
  flowCookieName,
} from '../cookies'
import { getWebAuthConfig } from '../config'
import { createFlowStateCodec } from '../flow-state'
import {
  passwordAuthentication,
  routeAuthenticationOutcome,
  verifyPasswordEmail,
} from '../password-service'
import { currentAuthRequestContext } from '../request-context'
import { safeReturnPath } from '../return-path'
import { getAuthenticationProvider, writeSessionCookie } from '../session'

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  returnTo: z.string().optional(),
  signalsId: z.string().optional(),
})

function destination(status: string) {
  if (status === 'email-verification-required') return '/verify-email'
  if (status === 'sso-required') return '/auth/sso'
  return '/auth/challenge'
}

export async function continueAuthenticationOutcome(input: {
  outcome: Awaited<ReturnType<typeof routeAuthenticationOutcome>>['outcome']
  flow?: string
  returnTo?: string
}) {
  const config = getWebAuthConfig()
  if (config.mode !== 'workos') redirect('/sign-in?error=service_unavailable')
  if (input.outcome.status === 'authenticated') {
    await writeSessionCookie(input.outcome.sealedSession)
    ;(await cookies()).set(
      flowCookieName(config),
      '',
      deleteAuthCookieOptions(process.env.NODE_ENV === 'production'),
    )
    redirect(safeReturnPath(input.returnTo))
  }
  if (input.flow) {
    ;(await cookies()).set(
      flowCookieName(config),
      input.flow,
      authCookieOptions('flow', process.env.NODE_ENV === 'production'),
    )
    redirect(destination(input.outcome.status))
  }
  redirect(`/sign-in?error=${encodeURIComponent(input.outcome.status)}`)
}

async function passwordAction(
  formData: FormData,
  signUp: boolean,
): Promise<AuthActionState | void> {
  const value = credentials.safeParse(Object.fromEntries(formData))
  if (!value.success)
    return {
      code: 'validation_error',
      message: 'Enter a valid email address and password.',
    }
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect(safeReturnPath(value.data.returnTo))
  const result = await passwordAuthentication({
    provider: getAuthenticationProvider(config)!,
    flow: createFlowStateCodec(config.cookiePassword),
    context: await currentAuthRequestContext(),
    ...value.data,
    signUp,
  })
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    ...(value.data.returnTo ? { returnTo: value.data.returnTo } : {}),
  })
}

export async function signInAction(formData: FormData) {
  return passwordAction(formData, false)
}

export async function signUpAction(formData: FormData) {
  return passwordAction(formData, true)
}

export async function verifyEmailAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success)
    return { code: 'validation_error', message: 'Enter the verification code.' }
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect('/app')
  const value = (await cookies()).get(flowCookieName(config))?.value
  if (!value) redirect('/sign-in?error=flow_expired')
  const flow = await createFlowStateCodec(config.cookiePassword).unseal(
    value,
    'email-verification',
  )
  const outcome = await verifyPasswordEmail({
    provider: getAuthenticationProvider(config)!,
    flow: createFlowStateCodec(config.cookiePassword),
    flowValue: value,
    code: code.data,
    context: await currentAuthRequestContext(),
    ...(typeof formData.get('signalsId') === 'string'
      ? { signalsId: formData.get('signalsId') as string }
      : {}),
  })
  const result = await routeAuthenticationOutcome({
    provider: getAuthenticationProvider(config)!,
    flow: createFlowStateCodec(config.cookiePassword),
    outcome,
    email: '',
    returnTo: flow.returnTo,
  })
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    returnTo: flow.returnTo,
  })
}
