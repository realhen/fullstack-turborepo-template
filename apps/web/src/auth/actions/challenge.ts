'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { authCookieOptions, flowCookieName } from '../cookies'
import { getWebAuthConfig } from '../config'
import { createFlowStateCodec } from '../flow-state'
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

export async function startTotpEnrollmentAction() {
  const { value, codec, config } = await workosFlow()
  const result = await startTotpEnrollment({
    provider: getAuthenticationProvider(config)!,
    flow: codec,
    flowValue: value,
    context: await currentAuthRequestContext(),
  })
  await replaceFlow(result.flow)
}

export async function startTotpChallengeAction(formData: FormData) {
  const factorId = z.string().min(1).safeParse(formData.get('factorId'))
  if (!factorId.success) redirect('/auth/challenge?error=validation_error')
  const { value, codec, config } = await workosFlow()
  await replaceFlow(
    await startTotpChallenge({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      factorId: factorId.data,
    }),
  )
}

export async function completeTotpChallengeAction(formData: FormData) {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success) redirect('/auth/challenge?error=validation_error')
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value)
  if (before.kind !== 'mfa' && before.kind !== 'mfa-enrollment')
    redirect('/sign-in?error=flow_expired')
  const result = await completeTotpChallenge({
    provider: getAuthenticationProvider(config)!,
    flow: codec,
    flowValue: value,
    code: code.data,
    context: await currentAuthRequestContext(),
  })
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    returnTo: before.returnTo,
  })
}

export async function selectOrganizationAction(formData: FormData) {
  const organizationId = z
    .string()
    .min(1)
    .safeParse(formData.get('organizationId'))
  if (!organizationId.success)
    redirect('/auth/challenge?error=validation_error')
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value, 'organization-selection')
  const result = await selectOrganization({
    provider: getAuthenticationProvider(config)!,
    flow: codec,
    flowValue: value,
    organizationId: organizationId.data,
    context: await currentAuthRequestContext(),
  })
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    returnTo: before.returnTo,
  })
}

export async function startRadarSmsChallengeAction(formData: FormData) {
  const phoneNumber = z.string().min(1).safeParse(formData.get('phoneNumber'))
  if (!phoneNumber.success) redirect('/auth/challenge?error=validation_error')
  const { value, codec, config } = await workosFlow()
  await replaceFlow(
    await startRadarSmsChallenge({
      provider: getAuthenticationProvider(config)!,
      flow: codec,
      flowValue: value,
      phoneNumber: phoneNumber.data,
      context: await currentAuthRequestContext(),
    }),
  )
}

export async function completeRadarChallengeAction(formData: FormData) {
  const code = z.string().min(1).safeParse(formData.get('code'))
  if (!code.success) redirect('/auth/challenge?error=validation_error')
  const { value, codec, config } = await workosFlow()
  const before = await codec.unseal(value)
  if (before.kind !== 'radar-email' && before.kind !== 'radar-sms')
    redirect('/sign-in?error=flow_expired')
  const result = await completeRadarChallenge({
    provider: getAuthenticationProvider(config)!,
    flow: codec,
    flowValue: value,
    code: code.data,
    context: await currentAuthRequestContext(),
  })
  await continueAuthenticationOutcome({
    outcome: result.outcome,
    ...('flow' in result ? { flow: result.flow } : {}),
    returnTo: before.returnTo,
  })
}

export async function beginSsoAction() {
  const { value, codec, config } = await workosFlow()
  const state = await codec.unseal(value, 'sso')
  const flow = await codec.seal({
    kind: 'oauth',
    state: randomBytes(24).toString('base64url'),
    codeVerifier: randomBytes(48).toString('base64url'),
    returnTo: state.returnTo,
    expiresAt: Date.now() + 600_000,
  })
  const next = await codec.unseal(flow, 'oauth')
  const url = await getAuthenticationProvider(config)!.authorizationUrl({
    ...(await currentAuthRequestContext()),
    connectionId: state.connectionId,
    codeVerifier: next.codeVerifier,
    state: next.state,
  })
  ;(await cookies()).set(
    flowCookieName(config),
    flow,
    authCookieOptions('flow', process.env.NODE_ENV === 'production'),
  )
  redirect(url)
}
