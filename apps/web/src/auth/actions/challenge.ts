'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { actionErrorState, type AuthActionState } from '../action-state'
import { authCookieOptions, flowCookieName } from '../cookies'
import { getWebAuthConfig } from '../config'
import { createFlowStateCodec } from '../flow-state'
import { createOAuthFlow } from '../oauth-service'
import {
  completeRadarChallenge,
  completeTotpChallenge,
  selectOrganization,
  startRadarSmsChallenge,
  startTotpChallenge,
  startTotpEnrollment,
} from '../challenge-service'
import { currentAuthRequestContext } from '../request-context'
import { getAuthenticationProvider } from '../session'
import { continueAuthenticationOutcome } from './password'

async function workosFlow() {
  const config = getWebAuthConfig()
  if (config.mode === 'local') redirect('/app')
  const value = (await cookies()).get(flowCookieName(config))?.value
  if (!value) redirect('/sign-in?error=flow_expired')
  return { config, value, codec: createFlowStateCodec(config.cookiePassword) }
}

async function replaceFlow(value: string) {
  const { config } = await workosFlow()
  ;(await cookies()).set(
    flowCookieName(config),
    value,
    authCookieOptions('flow', process.env.NODE_ENV === 'production'),
  )
  redirect('/auth/challenge')
}

export async function startTotpEnrollmentAction(): Promise<AuthActionState | void> {
  const { value, codec, config } = await workosFlow()
  try {
    const result = await startTotpEnrollment({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      context: await currentAuthRequestContext(),
    })
    await replaceFlow(result.flow)
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function startTotpChallengeAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const factorId = z.string().min(1).safeParse(formData.get('factorId'))
  if (!factorId.success)
    return { code: 'validation_error', message: 'Choose an authenticator.' }
  const { value, codec, config } = await workosFlow()
  try {
    await replaceFlow(
      await startTotpChallenge({
        provider: getAuthenticationProvider(config)!,
        flow: codec,
        flowValue: value,
        factorId: factorId.data,
      }),
    )
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function completeTotpChallengeAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success)
    return { code: 'validation_error', message: 'Enter the code.' }
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value)
  if (before.kind !== 'mfa' && before.kind !== 'mfa-enrollment')
    redirect('/sign-in?error=flow_expired')
  try {
    const result = await completeTotpChallenge({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      code: code.data,
      context: await currentAuthRequestContext(),
    })
    return continueAuthenticationOutcome({
      outcome: result.outcome,
      ...('flow' in result ? { flow: result.flow } : {}),
      returnTo: before.returnTo,
    })
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function selectOrganizationAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const organizationId = z
    .string()
    .min(1)
    .safeParse(formData.get('organizationId'))
  if (!organizationId.success)
    return { code: 'validation_error', message: 'Choose an organization.' }
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value, 'organization-selection')
  try {
    const result = await selectOrganization({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      organizationId: organizationId.data,
      context: await currentAuthRequestContext(),
    })
    return continueAuthenticationOutcome({
      outcome: result.outcome,
      ...('flow' in result ? { flow: result.flow } : {}),
      returnTo: before.returnTo,
    })
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function startRadarSmsChallengeAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const phoneNumber = z.string().min(1).safeParse(formData.get('phoneNumber'))
  if (!phoneNumber.success)
    return { code: 'validation_error', message: 'Enter a mobile number.' }
  const { value, codec, config } = await workosFlow()
  try {
    await replaceFlow(
      await startRadarSmsChallenge({
        provider: getAuthenticationProvider(config)!,
        flow: codec,
        flowValue: value,
        phoneNumber: phoneNumber.data,
        context: await currentAuthRequestContext(),
      }),
    )
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function completeRadarChallengeAction(
  formData: FormData,
): Promise<AuthActionState | void> {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success)
    return { code: 'validation_error', message: 'Enter the code.' }
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value)
  if (before.kind !== 'radar-email' && before.kind !== 'radar-sms')
    redirect('/sign-in?error=flow_expired')
  try {
    const result = await completeRadarChallenge({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      code: code.data,
      context: await currentAuthRequestContext(),
    })
    return continueAuthenticationOutcome({
      outcome: result.outcome,
      ...('flow' in result ? { flow: result.flow } : {}),
      returnTo: before.returnTo,
    })
  } catch (error) {
    return actionErrorState(error)
  }
}

export async function beginSsoAction(): Promise<AuthActionState | void> {
  const { value, codec, config } = await workosFlow()
  try {
    const state = await codec.unseal(value, 'sso')
    const next = await createOAuthFlow({
      flow: codec,
      returnTo: state.returnTo,
    })
    const url = await getAuthenticationProvider(config)!.authorizationUrl({
      ...(await currentAuthRequestContext()),
      connectionId: state.connectionId,
      codeVerifier: next.codeVerifier,
      state: next.state,
    })
    ;(await cookies()).set(
      flowCookieName(config),
      next.value,
      authCookieOptions('flow', process.env.NODE_ENV === 'production'),
    )
    redirect(url)
  } catch (error) {
    return actionErrorState(error)
  }
}
