import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  authCookieOptions,
  deleteAuthCookieOptions,
  flowCookieName,
} from '@/auth/cookies'
import { getWebAuthConfig } from '@/auth/config'
import { createFlowStateCodec } from '@/auth/flow-state'
import { exchangeOAuthCallback } from '@/auth/oauth-service'
import { routeAuthenticationOutcome } from '@/auth/password-service'
import { currentAuthRequestContext } from '@/auth/request-context'
import { getAuthenticationProvider, writeSessionCookie } from '@/auth/session'

function destination(status: string) {
  if (status === 'email-verification-required') return '/verify-email'
  if (status === 'sso-required') return '/auth/sso'
  return '/auth/challenge'
}

export async function GET(request: Request) {
  const config = getWebAuthConfig()
  if (config.mode !== 'workos')
    return NextResponse.redirect(new URL('/', request.url))
  const store = await cookies()
  const value = store.get(flowCookieName(config))?.value
  if (!value)
    return NextResponse.redirect(
      new URL('/sign-in?error=oauth_failed', request.url),
    )
  store.set(
    flowCookieName(config),
    '',
    deleteAuthCookieOptions(process.env.NODE_ENV === 'production'),
  )
  try {
    const query = new URL(request.url).searchParams
    const allowed = new Set([
      'code',
      'state',
      'error',
      'error_description',
      'error_uri',
    ])
    if ([...query.keys()].some((key) => !allowed.has(key)))
      throw new Error('OAuth callback is invalid')
    const provider = getAuthenticationProvider(config)!
    const callback = await exchangeOAuthCallback({
      flow: createFlowStateCodec(config.cookiePassword),
      value,
      state: query.get('state'),
      code: query.get('code'),
      error: query.get('error'),
      context: await currentAuthRequestContext(),
      provider,
    })
    if (!('outcome' in callback))
      return NextResponse.redirect(
        new URL('/sign-in?error=oauth_failed', request.url),
      )
    const result = await routeAuthenticationOutcome({
      provider,
      flow: createFlowStateCodec(config.cookiePassword),
      outcome: callback.outcome,
      email: '',
      returnTo: callback.returnTo,
    })
    if (result.outcome.status === 'authenticated') {
      await writeSessionCookie(result.outcome.sealedSession)
      return NextResponse.redirect(new URL(callback.returnTo, request.url))
    }
    if ('flow' in result) {
      store.set(
        flowCookieName(config),
        result.flow,
        authCookieOptions('flow', process.env.NODE_ENV === 'production'),
      )
      return NextResponse.redirect(
        new URL(destination(result.outcome.status), request.url),
      )
    }
  } catch {
    // Cookie was already consumed; provider details must not reach the URL.
  }
  return NextResponse.redirect(
    new URL('/sign-in?error=oauth_failed', request.url),
  )
}
